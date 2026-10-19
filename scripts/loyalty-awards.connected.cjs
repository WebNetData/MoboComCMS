// Real PostgreSQL customer-club awards; settings and the inbox are isolated.
// The run uses a clock far in the future, so orders that already exist in the database are out of its window.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `loyalty-awards-${Date.now()}`, now = new Date('2100-01-01T12:00:00Z'), placed = new Date('2100-01-01T09:00:00Z')
const baseline = process.env.LOYALTY_AWARDS_BASELINE
const state = {failAccountFor: 0}, inbox = []
// One customer's account cannot be read: the award of that order fails.
const account = new Proxy(prisma.loyaltyAccount, {get(target, key) {return key === 'findUnique' ? async args => {if (args.where.userId === state.failAccountFor) throw new Error('account unavailable'); return target.findUnique(args)} : target[key]}})
const db = new Proxy(prisma, {get(target, key) {return key === 'loyaltyAccount' ? account : typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
// LOYALTY_AWARDS_BASELINE=<git ref> runs the marketing service of that revision to reproduce the old behaviour.
const source = file => baseline && file === 'src/modules/store/server/marketing.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8'}) : fs.readFileSync(file, 'utf8')
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/config/env': {authSecret: 'test-only'},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/modules/settings/server': {readJsonSetting: async key => key === 'store.loyalty.v1' ? {enabled: true, since: '2099-12-01T00:00:00Z', earnPoints: 1, earnStepToman: 1000, signupBonus: 0} : null, writeJsonSetting: async () => {}},
 '@/modules/notifications/server/inbox': {createInboxEvent: async event => {if (!inbox.some(row => row.dedupeKey === event.dedupeKey)) inbox.push(event); return event}},
 '@/modules/wallet/server/wallet': {}, '@/modules/providers/server/panel-credentials': {}, '@/modules/store/server/cart': {},
}
function load(file, cache = new Map()) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts', cache)}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
let product, orders = 0
const customer = async name => prisma.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}})
const paid = (userId, totalMinor = 250_000n, status = 'PAID') => prisma.order.create({data: {userId, idempotencyKey: `${seed}-${orders++}`, totalAmount: Number(totalMinor), totalMinor, currency: 'IRT', productId: product.id, status, createdAt: placed, updatedAt: placed}})
const entries = userId => prisma.loyaltyEntry.findMany({where: {userId, kind: 'EARN_ORDER'}, orderBy: {orderId: 'asc'}})
const balance = async userId => (await prisma.loyaltyAccount.findUnique({where: {userId}}))?.balance || 0
async function main() {
 const service = load('src/modules/store/server/marketing.ts'), domain = load('src/modules/store/domain/marketing.ts')
 const settings = await service.getLoyaltySettings(), expected = domain.pointsFor(settings, domain.tomanOf(250_000n, 'IRT'), domain.tierFor(settings, 0).tier.multiplier)
 assert.ok(expected > 0)
 product = await prisma.product.create({data: {slug: seed, name: seed, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 30, approval: 'APPROVED'}})
 // More recent paid orders than one read already have their points; a later order must still get its own.
 const regular = await customer('regular')
 await prisma.order.createMany({data: Array.from({length: 505}, () => ({userId: regular.id, idempotencyKey: `${seed}-${orders++}`, totalAmount: 1000, totalMinor: 1000n, currency: 'IRT', productId: product.id, status: 'PAID', createdAt: placed, updatedAt: placed}))})
 const awardedOrders = await prisma.order.findMany({where: {userId: regular.id}, select: {id: true}})
 await prisma.loyaltyEntry.createMany({data: awardedOrders.map(order => ({userId: regular.id, points: 0, kind: 'EARN_ORDER', orderId: order.id, idempotencyKey: `order:${order.id}`}))})
 const buyer = await customer('buyer'), order = await paid(buyer.id)
 let result = await service.runLoyaltyAwards(now)
 if (baseline) {
  assert.equal(result.awarded, 0); assert.equal((await entries(buyer.id)).length, 0)
  console.log(`Reproduced at ${baseline}: 505 recent orders that already had their points filled the 500-order window, so a later paid order earned nothing`)
  await prisma.loyaltyEntry.deleteMany({where: {userId: regular.id}}); await prisma.order.deleteMany({where: {userId: regular.id}})
  const broken = await customer('broken'); await paid(broken.id); const next = await customer('next'); await paid(next.id)
  await prisma.loyaltyEntry.create({data: {userId: buyer.id, points: 0, kind: 'EARN_ORDER', orderId: order.id, idempotencyKey: `order:${order.id}`}})
  state.failAccountFor = broken.id
  await assert.rejects(service.runLoyaltyAwards(now)); assert.equal((await entries(next.id)).length, 0)
  console.log(`Reproduced at ${baseline}: one order whose award failed aborted the run before the next order`)
  return
 }
 assert.deepEqual(result, {awarded: 1})
 assert.deepEqual((await entries(buyer.id)).map(row => [row.orderId, row.points, row.idempotencyKey]), [[order.id, expected, `order:${order.id}`]])
 assert.equal(await balance(buyer.id), expected)
 assert.deepEqual(inbox.map(row => [row.userId, row.kind, row.dedupeKey]), [[buyer.id, 'LOYALTY', `loyalty:order:${order.id}`]])
 assert.deepEqual(await service.runLoyaltyAwards(now), {awarded: 0}, 'an order earns once')
 assert.equal(await balance(buyer.id), expected); assert.equal(await prisma.loyaltyEntry.count({where: {userId: regular.id}}), 505)
 // A failed award is retried; the orders after it still earn.
 const broken = await customer('broken'), brokenOrder = await paid(broken.id), next = await customer('next')
 await paid(next.id)
 state.failAccountFor = broken.id
 assert.deepEqual(await service.runLoyaltyAwards(now), {awarded: 1})
 assert.equal(await balance(next.id), expected); assert.equal((await entries(broken.id)).length, 0)
 state.failAccountFor = 0
 // Two schedulers award the retried order once.
 const twice = await Promise.all([service.runLoyaltyAwards(now), service.runLoyaltyAwards(now)])
 assert.equal(twice[0].awarded + twice[1].awarded, 1)
 assert.deepEqual((await entries(broken.id)).map(row => [row.orderId, row.points]), [[brokenOrder.id, expected]]); assert.equal(await balance(broken.id), expected)
 // The run limit carries the remaining orders to the next run.
 const bulk = await customer('bulk')
 for (let i = 0; i < 3; i++) await paid(bulk.id)
 assert.deepEqual(await service.runLoyaltyAwards(now, 2), {awarded: 2}); assert.deepEqual(await service.runLoyaltyAwards(now, 2), {awarded: 1})
 // Later orders may earn more: the customer moves up a tier on the way.
 assert.equal((await entries(bulk.id)).length, 3); assert.equal(await balance(bulk.id), (await entries(bulk.id)).reduce((sum, row) => sum + row.points, 0))
 // Unpaid, too small and stale orders: no points; a too-small order is recorded so it is not read again.
 const other = await customer('other'), pending = await paid(other.id, 250_000n, 'PENDING'), small = await paid(other.id, 10n)
 const stale = await paid(other.id); await prisma.order.update({where: {id: stale.id}, data: {updatedAt: new Date(now.getTime() - 4 * 86_400_000)}})
 assert.deepEqual(await service.runLoyaltyAwards(now), {awarded: 0})
 assert.deepEqual((await entries(other.id)).map(row => [row.orderId, row.points]), [[small.id, 0]]); assert.equal(await balance(other.id), 0)
 assert.equal(await prisma.loyaltyEntry.count({where: {orderId: {in: [pending.id, stale.id]}}}), 0)
 console.log('PostgreSQL awards past 505 already-awarded orders, single award, isolated failure and retry, concurrent schedulers, run limit, unpaid/small/stale orders passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await prisma.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(user => user.id)
  await prisma.loyaltyEntry.deleteMany({where: {userId: {in: ids}}}); await prisma.loyaltyAccount.deleteMany({where: {userId: {in: ids}}})
  await prisma.order.deleteMany({where: {userId: {in: ids}}}); await prisma.product.deleteMany({where: {slug: seed}}); await prisma.user.deleteMany({where: {id: {in: ids}}})
 } finally {await prisma.$disconnect()}
})
