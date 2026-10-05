// Real PostgreSQL orders and VIP periods. The recovery only sees this script's orders; the inbox, the module switch and the session are test doubles.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `gift-vip-${Date.now()}`
const state = {enabled: true, buyers: [], failFor: 0}
const order = new Proxy(prisma.order, {get: (target, key) => key === 'findMany' ? args => target.findMany({...args, where: {...args.where, userId: {in: state.buyers}}}) : key === 'findUnique' ? async args => { if (args.where.id === state.failFor) throw new Error('order unavailable'); return target.findUnique(args) } : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const db = new Proxy(prisma, {get: (target, key) => key === 'order' ? order : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/extensions/server/modules': {isModuleEnabled: async () => state.enabled},
 '@/modules/notifications/server/inbox': {createInboxEvent: async event => event},
 '@/modules/identity/auth': {authOptions: {}},
 'next-auth': {getServerSession: async () => null},
 react: {cache: fn => fn},
}
const cache = new Map()
function load(file) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts')}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
let count = 0
async function main() {
 const service = load('src/modules/membership/server/membership.ts')
 const buyer = await prisma.user.create({data: {email: `${seed}@example.invalid`, passwordHash: 'test-only'}})
 state.buyers.push(buyer.id)
 const product = (name, vipGiftDays) => prisma.product.create({data: {slug: `${seed}-${name}`, name, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 30, approval: 'APPROVED', vipGiftDays}})
 const [withGift, plain] = [await product('gift', 30), await product('plain', 0)]
 const paid = (item, {status = 'PAID', age = 30} = {}) => prisma.order.create({data: {userId: buyer.id, idempotencyKey: `${seed}-${count++}`, totalAmount: 1000, totalMinor: 1000n, currency: 'IRT', productId: item.id, status, createdAt: new Date(Date.now() - age * 60_000)}})
 const periods = async row => (await prisma.userMembership.findMany({where: {orderId: row.id}})).map(period => [period.source, period.dedupeKey])
 const lost = await paid(withGift), already = await paid(withGift), noGift = await paid(plain), unpaid = await paid(withGift, {status: 'PENDING'}), young = await paid(withGift, {age: 2}), old = await paid(withGift, {age: 60 * 24 * 5}), broken = await paid(withGift)
 await service.grantGiftForOrder(already.id)
 state.enabled = false
 assert.deepEqual(await service.recoverGiftMemberships(), {checked: 0, granted: 0, failed: 0}, 'membership off: nothing is read')
 state.enabled = true
 state.failFor = broken.id
 assert.deepEqual(await service.recoverGiftMemberships(), {checked: 2, granted: 1, failed: 1}, 'an order that cannot be granted is counted and does not stop the other')
 assert.deepEqual(await periods(lost), [['GIFT', `gift:order:${lost.id}`]], 'the customer receives the gift period')
 assert.equal((await periods(already)).length, 1, 'an order already granted is not granted twice')
 for (const row of [noGift, unpaid, young, old]) assert.deepEqual(await periods(row), [], 'no gift days, not paid, or outside the window: left alone')
 const before = await service.getActiveMembership(buyer.id)
 assert.ok(before && before.endsAt > new Date(Date.now() + 50 * 86_400_000), 'two gifts of thirty days extend each other')
 state.failFor = 0
 assert.deepEqual(await service.recoverGiftMemberships(), {checked: 1, granted: 1, failed: 0}); assert.equal((await periods(broken)).length, 1)
 assert.deepEqual(await service.recoverGiftMemberships(), {checked: 0, granted: 0, failed: 0})
 console.log('PostgreSQL gift membership recovery: an ungranted gift given once, granted, giftless, unpaid, young and old orders left alone, a failing order counted and recovered later, module off passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  await prisma.userMembership.deleteMany({where: {userId: {in: state.buyers}}}); await prisma.order.deleteMany({where: {userId: {in: state.buyers}}})
  await prisma.product.deleteMany({where: {slug: {startsWith: seed}}}); await prisma.user.deleteMany({where: {email: {startsWith: seed}}})
 } finally {await prisma.$disconnect()}
})
