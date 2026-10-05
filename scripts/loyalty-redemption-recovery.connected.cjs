// Real PostgreSQL customer-club ledger and wallet. The recovery only sees this script's members; settings and the inbox are test doubles.
// LOYALTY_REVERSAL_BASELINE=<git ref> runs the marketing service of that revision for the refund-reversal part, to show the fault there.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `loyalty-redeem-${Date.now()}`, baseline = process.env.LOYALTY_REVERSAL_BASELINE
const state = {ids: [], pointValueToman: 10, failWalletFor: 0, gate: null}
// `gate`: a reader of one order's entries is held after its read until a second reader has read too (or 400 ms pass), the state two
// refunds arriving in the same instant are in. Each service instance has its own database connection, as two server processes do.
const held = () => { const gate = state.gate; if (!gate) return Promise.resolve(); gate.waiting++; if (gate.waiting >= 2) gate.open(); return Promise.race([gate.opened, new Promise(resolve => setTimeout(resolve, 400))]) }
const clients = [prisma]
const entries = model => new Proxy(model, {get: (target, key) => key === 'findMany' ? async args => { const rows = await target.findMany({...args, where: {...args.where, userId: {in: state.ids}}}); if (args.where.orderId) await held(); return rows } : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const wrap = client => new Proxy(client, {get: (target, key) => key === 'loyaltyEntry' ? entries(target.loyaltyEntry) : key === '$transaction' ? (work, ...rest) => typeof work === 'function' ? target.$transaction(tx => work(wrap(tx)), ...rest) : target.$transaction(work, ...rest) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const mocksFor = db => ({
 '@/platform/database/prisma': {db},
 '@/platform/config/env': {authSecret: () => 'test-only'},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/modules/settings/server': {readJsonSetting: async key => key === 'store.loyalty.v1' ? {enabled: true, pointValueToman: state.pointValueToman, minRedeem: 10, signupBonus: 0} : null, writeJsonSetting: async () => {}},
 '@/modules/notifications/server/inbox': {createInboxEvent: async event => event},
 '@/modules/providers/server/panel-credentials': {}, '@/modules/store/server/cart': {},
})
/** The marketing service on its own connection. */
function instance(client = new PrismaClient()) {
 if (!clients.includes(client)) clients.push(client)
 const mocks = mocksFor(wrap(client)), cache = new Map()
 return file => load(file, mocks, cache)
}
function load(file, mocks, cache) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(baseline && file === 'src/modules/store/server/marketing.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8', maxBuffer: 1 << 26}) : fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (name === '@/modules/wallet/server/wallet') {const real = load('src/modules/wallet/server/wallet.ts', mocks, cache); return {...real, moveWallet: async input => input.userId === state.failWalletFor ? {ok: false, message: 'wallet unavailable'} : real.moveWallet(input)}}
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts', mocks, cache)}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
const minutes = n => new Date(Date.now() - n * 60_000)
// --- refunds take back an order's points: never more than it earned, however the refunds arrive
async function reversals(service, other) {
 const member = await prisma.user.create({data: {email: `${seed}-refund@example.invalid`, passwordHash: 'test-only'}})
 state.ids.push(member.id)
 const product = await prisma.product.create({data: {slug: seed, name: seed, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 30, approval: 'APPROVED'}})
 await prisma.loyaltyAccount.create({data: {userId: member.id, balance: 0, lifetime: 0}})
 const earn = async (n, earned) => {
  const order = await prisma.order.create({data: {userId: member.id, idempotencyKey: `${seed}-${n}`, totalAmount: 100_000, totalMinor: 100_000n, currency: 'IRT', productId: product.id, status: 'PAID'}})
  await prisma.loyaltyEntry.create({data: {userId: member.id, points: earned, kind: 'EARN_ORDER', orderId: order.id, idempotencyKey: `${seed}:earn:${n}`}})
  await prisma.loyaltyAccount.update({where: {userId: member.id}, data: {balance: {increment: earned}, lifetime: {increment: earned}}})
  return order
 }
 const reversedOf = async order => -(await prisma.loyaltyEntry.findMany({where: {orderId: order.id, kind: 'REVERSE_ORDER'}})).reduce((sum, row) => sum + row.points, 0)
 const account = () => prisma.loyaltyAccount.findUniqueOrThrow({where: {userId: member.id}})
 // Two full refunds of one order at the same instant.
 const first = await earn(1, 100)
 let open; state.gate = {waiting: 0, opened: new Promise(resolve => { open = resolve })}; state.gate.open = open
 await Promise.all([service.reverseOrderPoints(first.id, 100_000n, 'return:1'), other.reverseOrderPoints(first.id, 100_000n, 'return:2')])
 state.gate = null
 assert.equal(await reversedOf(first), 100, 'two simultaneous refunds take back what the order earned, not twice that')
 assert.deepEqual([(await account()).balance, (await account()).lifetime], [0, 0])
 // One after the other: a partial refund, the same refund repeated, then the rest.
 const second = await earn(2, 100)
 await service.reverseOrderPoints(second.id, 25_000n, 'return:3'); assert.equal(await reversedOf(second), 25)
 await service.reverseOrderPoints(second.id, 25_000n, 'return:3'); assert.equal(await reversedOf(second), 25, 'a repeated refund records nothing new')
 await service.reverseOrderPoints(second.id, 100_000n, 'return:4'); assert.equal(await reversedOf(second), 100)
 await service.reverseOrderPoints(second.id, 100_000n, 'return:5'); assert.equal(await reversedOf(second), 100)
 assert.deepEqual([(await account()).balance, (await account()).lifetime], [0, 0])
 await service.reverseOrderPoints(999_999_999, 1n, 'return:none')
}
async function main() {
 const service = instance(prisma)('src/modules/store/server/marketing.ts'), other = instance()('src/modules/store/server/marketing.ts')
 await reversals(service, other)
 if (baseline) return console.log(`No reversal fault shown at ${baseline}`)
 const users = await Promise.all(['ok', 'stopped', 'undone', 'fresh', 'old', 'worthless', 'stuck'].map(name => prisma.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}})))
 state.ids.push(...users.map(user => user.id))
 const [ok, stopped, undone, fresh, old, worthless, stuck] = users
 for (const user of users) await prisma.loyaltyAccount.create({data: {userId: user.id, balance: 1000, lifetime: 1000}})
 const wallet = async user => Number((await prisma.walletAccount.findUnique({where: {userId_currency: {userId: user.id, currency: 'IRT'}}}))?.balanceMinor || 0n)
 const points = async user => (await prisma.loyaltyAccount.findUniqueOrThrow({where: {userId: user.id}})).balance
 // The state a redemption leaves when the process stops after taking the points: account decremented, ledger entry written, no wallet credit.
 const interrupted = async (user, amount, createdAt) => {
  await prisma.loyaltyAccount.update({where: {userId: user.id}, data: {balance: {decrement: amount}}})
  return prisma.loyaltyEntry.create({data: {userId: user.id, points: -amount, kind: 'REDEEM', note: 'x', idempotencyKey: `${seed}:${user.id}:${amount}`, createdAt}})
 }

 // A complete redemption is left alone.
 const done = await service.redeemPoints(ok.id, 100)
 assert.deepEqual([done.points, done.toman], [100, 1000]); assert.equal(await wallet(ok), 1000); assert.equal(await points(ok), 900)
 await prisma.loyaltyEntry.updateMany({where: {userId: ok.id, kind: 'REDEEM'}, data: {createdAt: minutes(30)}})
 await interrupted(stopped, 200, minutes(30))
 // Undone by the request itself after a failed credit: the points are back, so nothing is owed.
 state.failWalletFor = undone.id
 await assert.rejects(service.redeemPoints(undone.id, 300), error => error.status === 500)
 state.failWalletFor = 0
 assert.equal(await points(undone), 1000)
 await prisma.loyaltyEntry.updateMany({where: {userId: undone.id, kind: 'REDEEM'}, data: {createdAt: minutes(30)}})
 await interrupted(fresh, 50, minutes(2))     // may still be in flight
 await interrupted(old, 60, minutes(60 * 24 * 9)) // outside the week
 await interrupted(stuck, 70, minutes(30))
 state.failWalletFor = stuck.id

 let result = await service.recoverPointRedemptions()
 assert.deepEqual(result, {checked: 2, credited: 1, returned: 0, failed: 1}, 'only the interrupted, settled-by-nobody redemptions inside the window are touched')
 assert.equal(await wallet(stopped), 2000, 'the member gets the credit for the points that were taken'); assert.equal(await points(stopped), 800)
 assert.equal(await wallet(ok), 1000); assert.equal(await wallet(undone), 0); assert.equal(await points(undone), 1000)
 assert.equal(await wallet(fresh), 0); assert.equal(await wallet(old), 0); assert.equal(await wallet(stuck), 0)
 // Again: nothing is paid twice; the one that failed is retried and now succeeds.
 state.failWalletFor = 0
 result = await service.recoverPointRedemptions()
 assert.deepEqual(result, {checked: 1, credited: 1, returned: 0, failed: 0})
 assert.equal(await wallet(stopped), 2000); assert.equal(await wallet(stuck), 700)
 assert.deepEqual(await service.recoverPointRedemptions(), {checked: 0, credited: 0, returned: 0, failed: 0})
 // Points no longer have a wallet value: they are given back, once.
 await interrupted(worthless, 400, minutes(30))
 state.pointValueToman = 0
 assert.deepEqual(await service.recoverPointRedemptions(), {checked: 1, credited: 0, returned: 1, failed: 0})
 assert.equal(await points(worthless), 1000); assert.equal(await wallet(worthless), 0)
 assert.deepEqual(await service.recoverPointRedemptions(), {checked: 0, credited: 0, returned: 0, failed: 0})
 state.pointValueToman = 10
 assert.deepEqual(await service.recoverPointRedemptions(), {checked: 0, credited: 0, returned: 0, failed: 0}, 'a returned redemption is not credited later')
 // The young one is picked up once it is old enough.
 await prisma.loyaltyEntry.updateMany({where: {userId: fresh.id, kind: 'REDEEM'}, data: {createdAt: minutes(11)}})
 assert.deepEqual(await service.recoverPointRedemptions(), {checked: 1, credited: 1, returned: 0, failed: 0}); assert.equal(await wallet(fresh), 500)
 console.log('PostgreSQL club points: simultaneous refunds reverse only what was earned; redemptions interrupted ones credited once, undone and complete ones left alone, young and old ones outside the window, failure isolated and retried, valueless points returned passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  await prisma.loyaltyEntry.deleteMany({where: {userId: {in: state.ids}}}); await prisma.loyaltyAccount.deleteMany({where: {userId: {in: state.ids}}}); await prisma.walletTx.deleteMany({where: {userId: {in: state.ids}}})
  await prisma.order.deleteMany({where: {userId: {in: state.ids}}}); await prisma.product.deleteMany({where: {slug: seed}})
  await prisma.user.deleteMany({where: {email: {startsWith: seed}}})
 } finally {await Promise.all(clients.map(client => client.$disconnect()))}
})
