// Real PostgreSQL seller ledger and payouts on two database connections, like two server processes. Settings, the inbox, the module
// switch and the catalog helpers are test doubles. The sale recovery only sees this script's orders.
// MARKETPLACE_BASELINE=<git ref> runs the marketplace service of that revision to show the payout fault there.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `mkt-money-${Date.now()}`, baseline = process.env.MARKETPLACE_BASELINE
const state = {gate: null, enabled: true, buyers: [], failSaleFor: 0}
// `gate`: a reader is held after its read until a second reader has read too (or 400 ms pass): the state of two requests in the same instant.
const held = () => { const gate = state.gate; if (!gate) return Promise.resolve(); gate.waiting++; if (gate.waiting >= 2) gate.open(); return Promise.race([gate.opened, new Promise(resolve => setTimeout(resolve, 400))]) }
const clients = [prisma]
const payouts = model => new Proxy(model, {get: (target, key) => key === 'count' ? async args => { const result = await target.count(args); await held(); return result } : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const lines = model => new Proxy(model, {get: (target, key) => key === 'findMany' ? args => target.findMany(args.where.createdAt ? {...args, where: {...args.where, order: {...args.where.order, userId: {in: state.buyers}}}} : args) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const sellers = model => new Proxy(model, {get: (target, key) => key === 'findUnique' ? async args => { if (args.where.id === state.failSaleFor) throw new Error('seller unavailable'); return target.findUnique(args) } : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const wrap = client => new Proxy(client, {get: (target, key) => key === 'sellerPayout' ? payouts(target.sellerPayout) : key === 'orderLine' ? lines(target.orderLine) : key === 'seller' ? sellers(target.seller) : key === '$transaction' ? (work, ...rest) => typeof work === 'function' ? target.$transaction(tx => work(wrap(tx)), ...rest) : target.$transaction(work, ...rest) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const source = file => baseline && file === 'src/modules/marketplace/server/marketplace.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8', maxBuffer: 1 << 26}) : fs.readFileSync(file, 'utf8')
function instance(client = new PrismaClient()) {
 if (!clients.includes(client)) clients.push(client)
 const mocks = {
  '@/platform/database/prisma': {db: wrap(client)},
  '@/platform/observability/logger': {logEvent: () => {}},
  '@/extensions/server/modules': {isModuleEnabled: async () => state.enabled},
  '@/modules/settings/server': {readJsonSetting: async () => ({defaultCommission: 10, holdDays: 0, minPayoutToman: 1000}), writeJsonSetting: async () => {}},
  '@/modules/notifications/server/inbox': {createInboxEvent: async event => event},
  '@/modules/catalog/server/product-input': {}, '@/modules/catalog/server/price-history': {}, '@/modules/catalog/server/product-config': {}, '@/modules/content/server/events': {contentChanged: () => {}},
  // Outside a render React's cache() would remember the first answer; the switch is read every time here.
  react: {cache: fn => fn},
 }
 const cache = new Map()
 const load = file => {
  if (cache.has(file)) return cache.get(file).exports
  const mod = {exports: {}}; cache.set(file, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
   if (Object.hasOwn(mocks, name)) return mocks[name]
   if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts')}
   return require(name)
  }, mod, mod.exports)
  return mod.exports
 }
 return load('src/modules/marketplace/server/marketplace.ts')
}
let count = 0
const settled = results => results.map(result => result.status === 'fulfilled' ? 'ok' : (result.reason.status || result.reason.message))
async function main() {
 const one = instance(prisma), two = instance()
 const user = name => prisma.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}})
 const shop = async name => prisma.seller.create({data: {userId: (await user(name)).id, slug: `${seed}-${name}`, shopName: name, status: 'ACTIVE', iban: 'IR000000000000000000000000', ibanOwner: name}})
 const credit = (seller, amount) => prisma.sellerLedger.create({data: {sellerId: seller.id, kind: 'ADJUST', amountMinor: BigInt(amount), dedupeKey: `${seed}:${count++}`, availableAt: new Date(Date.now() - 1000)}})
 const reserved = async seller => -Number((await prisma.sellerLedger.aggregate({where: {sellerId: seller.id, kind: 'PAYOUT'}, _sum: {amountMinor: true}}))._sum.amountMinor || 0n)

 // --- a seller asks for a payout twice in the same instant
 const greedy = await shop('greedy')
 await credit(greedy, 100_000)
 let open; state.gate = {waiting: 0, opened: new Promise(resolve => { open = resolve })}; state.gate.open = open
 const results = settled(await Promise.allSettled([one.requestPayout(greedy, 80_000), two.requestPayout(greedy, 80_000)]))
 state.gate = null
 assert.equal(await prisma.sellerPayout.count({where: {sellerId: greedy.id, status: 'REQUESTED'}}), 1, 'one open payout request per seller')
 assert.equal(await reserved(greedy), 80_000, 'no more is reserved than the seller has')
 assert.deepEqual(results.sort(), [409, 'ok'].sort())
 // The ordinary rules are unchanged: more than the rest is refused; after a rejection the money is back and can be asked for again.
 await assert.rejects(one.requestPayout(greedy, 10_000), error => error.status === 409, 'a request is already open')
 const first = await prisma.sellerPayout.findFirstOrThrow({where: {sellerId: greedy.id}})
 await one.processPayout({id: first.id, action: 'reject', note: 'test', actorId: 1})
 await assert.rejects(one.requestPayout(greedy, 150_000))
 await one.requestPayout(greedy, 100_000)
 assert.equal(await prisma.sellerPayout.count({where: {sellerId: greedy.id, status: 'REQUESTED'}}), 1)
 if (baseline) return console.log(`No payout fault shown at ${baseline}`)

 // --- a paid, delivered order whose sale never reached the seller's ledger
 const [vendor, other] = [await shop('vendor'), await shop('other')]
 const buyer = await user('buyer'); state.buyers.push(buyer.id)
 const product = await prisma.product.create({data: {slug: seed, name: seed, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 30, approval: 'APPROVED', sellerId: vendor.id}})
 const order = async (seller, {delivered = true, status = 'PAID', age = 30} = {}) => {
  const row = await prisma.order.create({data: {userId: buyer.id, idempotencyKey: `${seed}-${count++}`, totalAmount: 50_000, totalMinor: 50_000n, currency: 'IRT', productId: product.id, status,
   lines: {create: [{name: 'item', productId: product.id, sellerId: seller.id, quantity: 2, unitPriceMinor: 25_000n, totalMinor: 50_000n, createdAt: new Date(Date.now() - age * 60_000)}]}}})
  if (delivered) await prisma.productDelivery.create({data: {orderId: row.id}})
  return row
 }
 const entries = async row => (await prisma.sellerLedger.findMany({where: {orderId: row.id}, orderBy: {id: 'asc'}})).map(entry => [entry.kind, Number(entry.amountMinor)])
 const lost = await order(vendor), recordedAlready = await order(vendor), young = await order(vendor, {age: 2}), undelivered = await order(vendor, {delivered: false}), unpaid = await order(vendor, {status: 'PENDING'}), old = await order(vendor, {age: 60 * 24 * 5}), broken = await order(other)
 await one.recordMarketplaceSale(recordedAlready.id)
 state.enabled = false
 assert.deepEqual(await one.recoverMarketplaceSales(), {checked: 0, recorded: 0, failed: 0}, 'marketplace off: nothing is read')
 state.enabled = true
 state.failSaleFor = other.id
 assert.deepEqual(await one.recoverMarketplaceSales(), {checked: 2, recorded: 1, failed: 1}, 'an order that cannot be recorded is counted and does not stop the other')
 assert.deepEqual(await entries(lost), [['SALE', 50_000], ['COMMISSION', -5_000]], 'the seller is credited the sale minus commission')
 assert.equal((await prisma.seller.findUniqueOrThrow({where: {id: vendor.id}})).salesCount, 4)
 for (const row of [young, undelivered, unpaid, old]) assert.deepEqual(await entries(row), [], 'outside the window, not delivered or not paid: left alone')
 assert.equal((await entries(recordedAlready)).length, 2, 'an order already recorded is not recorded twice')
 state.failSaleFor = 0
 assert.deepEqual(await one.recoverMarketplaceSales(), {checked: 1, recorded: 1, failed: 0}); assert.equal((await entries(broken)).length, 2)
 assert.deepEqual(await one.recoverMarketplaceSales(), {checked: 0, recorded: 0, failed: 0})
 console.log('PostgreSQL marketplace: two payout requests at once reserve one, payout rules unchanged, an unrecorded delivered sale credited once, undelivered, unpaid, young and old orders left alone, module off passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const users = (await prisma.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(row => row.id)
  const shops = (await prisma.seller.findMany({where: {slug: {startsWith: seed}}, select: {id: true}})).map(row => row.id)
  await prisma.sellerLedger.deleteMany({where: {sellerId: {in: shops}}}); await prisma.sellerPayout.deleteMany({where: {sellerId: {in: shops}}})
  await prisma.productDelivery.deleteMany({where: {order: {userId: {in: users}}}}); await prisma.orderLine.deleteMany({where: {order: {userId: {in: users}}}}); await prisma.order.deleteMany({where: {userId: {in: users}}})
  await prisma.product.deleteMany({where: {slug: seed}}); await prisma.seller.deleteMany({where: {id: {in: shops}}}); await prisma.user.deleteMany({where: {id: {in: users}}})
 } finally {await Promise.all(clients.map(client => client.$disconnect()))}
})
