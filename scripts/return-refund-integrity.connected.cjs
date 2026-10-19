// Real PostgreSQL returns and wallet, on two database connections like two server processes. Settings, the inbox, order
// transitions, stock, seller shares, club points, SMS and the multipart reader are test doubles.
// RETURN_REFUND_BASELINE=<git ref> runs the returns service of that revision to show the faults there;
// RETURN_REFUND_SKIP=cancel,pair leaves out the earlier sections so a later fault can be seen there too.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `return-refund-${Date.now()}`, baseline = process.env.RETURN_REFUND_BASELINE
const skip = name => (process.env.RETURN_REFUND_SKIP || '').split(',').includes(name)
const state = {gate: null, failWalletFor: 0, effects: []}
// `gate`: a reader is held after its read until a second reader has read too (or 400 ms pass): the state of two requests in the same instant.
const held = () => { const gate = state.gate; if (!gate) return Promise.resolve(); gate.waiting++; if (gate.waiting >= 2) gate.open(); return Promise.race([gate.opened, new Promise(resolve => setTimeout(resolve, 400))]) }
const armGate = () => { let open; state.gate = {waiting: 0, opened: new Promise(resolve => { open = resolve })}; state.gate.open = open }
const clients = [prisma]
const gated = (model, method) => new Proxy(model, {get: (target, key) => key === method ? async args => { const result = await target[method](args); await held(); return result } : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
// Held reads: the order (its refund ledger) and the count of open requests.
const wrap = client => new Proxy(client, {get: (target, key) => key === 'order' ? gated(target.order, 'findFirst') : key === 'returnRequest' ? gated(target.returnRequest, 'count') : key === '$transaction' ? (work, ...rest) => typeof work === 'function' ? target.$transaction(tx => work(wrap(tx)), ...rest) : target.$transaction(work, ...rest) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const source = file => baseline && file === 'src/modules/store/server/returns.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8', maxBuffer: 1 << 26}) : fs.readFileSync(file, 'utf8')
const form = fields => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data }
const mocksFor = db => ({
 '@/platform/database/prisma': {db},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/platform/http/rate-limit': {rateLimitHit: () => ({ok: true})},
 '@/platform/http/multipart': {MultipartError: class extends Error {}, readMultipart: async req => req.form},
 '@/modules/settings/server': {readJsonSetting: async () => ({enabled: true, autoRefundCancel: true}), writeJsonSetting: async () => {}},
 '@/modules/notifications/server/inbox': {createInboxEvent: async event => event},
 '@/modules/catalog/server/inventory': {restockConsumedInventory: async orderId => { state.effects.push(`restock:${orderId}`) }},
 '@/modules/store/server/orders': {transitionOrder: async input => { state.effects.push(`transition:${input.orderId}:${input.to}`) }},
 '@/modules/marketplace/server/marketplace': {reverseSellerShare: async (orderId, amount) => { state.effects.push(`seller:${orderId}:${amount}`) }},
 '@/modules/store/server/marketing': {reverseOrderPoints: async (orderId, amount) => { state.effects.push(`points:${orderId}:${amount}`) }},
 '@/modules/sms/server/sms': {notifyAdmins: async () => {}},
})
function instance(client = new PrismaClient()) {
 if (!clients.includes(client)) clients.push(client)
 const mocks = mocksFor(wrap(client)), cache = new Map()
 const load = file => {
  if (cache.has(file)) return cache.get(file).exports
  const mod = {exports: {}}; cache.set(file, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
   if (name === '@/modules/wallet/server/wallet') {const real = load('src/modules/wallet/server/wallet.ts'); return {...real, moveWallet: async input => input.userId === state.failWalletFor ? {ok: false, message: 'wallet unavailable'} : real.moveWallet(input)}}
   if (Object.hasOwn(mocks, name)) return mocks[name]
   if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts')}
   return require(name)
  }, mod, mod.exports)
  return mod.exports
 }
 return Object.assign({}, load('src/modules/store/server/returns.ts'), {__wallet: load('src/modules/wallet/server/wallet.ts')})
}
let product, count = 0
const settled = results => results.map(result => result.status === 'fulfilled' ? 'ok' : (result.reason.code || result.reason.message))
async function main() {
 const one = instance(prisma), two = instance()
 product = await prisma.product.create({data: {slug: seed, name: seed, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 30, approval: 'APPROVED'}})
 const customer = async name => prisma.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}})
 const paidOrder = user => prisma.order.create({data: {userId: user.id, idempotencyKey: `${seed}-${count++}`, totalAmount: 100_000, totalMinor: 100_000n, currency: 'IRT', productId: product.id, status: 'PAID', lines: {create: [{name: 'item', productId: product.id, quantity: 1, unitPriceMinor: 100_000n, totalMinor: 100_000n}]}}})
 const wallet = async user => Number((await prisma.walletAccount.findUnique({where: {userId_currency: {userId: user.id, currency: 'IRT'}}}))?.balanceMinor || 0n)
 const requests = order => prisma.returnRequest.findMany({where: {orderId: order.id}, orderBy: {id: 'asc'}})
 const request = (order, user, data = {}) => prisma.returnRequest.create({data: {number: `${seed}-${count++}`, orderId: order.id, userId: user.id, kind: 'CANCEL', requestedMinor: 100_000n, currency: 'IRT', ...data}})
 const cancel = (service, user, order) => service.createReturnRequest({form: form({kind: 'CANCEL', reason: 'changed_mind'})}, user.id, order.id)

 // --- the wallet itself: a member's first two movements at once both succeed, and one key sent twice at once is paid once
 {
  const fresh = await customer('fresh')
  const real = one.__wallet, other = two.__wallet
  const pair = await Promise.all([real.moveWallet({userId: fresh.id, amount: 1000, currency: 'IRT', type: 'ADMIN_CREDIT', idempotencyKey: `${seed}-first-1`}), other.moveWallet({userId: fresh.id, amount: 2000, currency: 'IRT', type: 'ADMIN_CREDIT', idempotencyKey: `${seed}-first-2`})])
  assert.deepEqual(pair.map(result => result.ok), [true, true], 'neither of two first movements fails'); assert.equal(await wallet(fresh), 3000)
  const same = await Promise.all([real.moveWallet({userId: fresh.id, amount: 500, currency: 'IRT', type: 'ADMIN_CREDIT', idempotencyKey: `${seed}-same`}), other.moveWallet({userId: fresh.id, amount: 500, currency: 'IRT', type: 'ADMIN_CREDIT', idempotencyKey: `${seed}-same`})])
  assert.deepEqual(same.map(result => result.ok), [true, true]); assert.equal(await wallet(fresh), 3500, 'one key is paid once')
 }

 // --- "cancel order" clicked twice in the same instant, with automatic refund of cancellations on (the default)
 if (!skip('cancel')) {
  const a = await customer('a'), order = await paidOrder(a)
  armGate()
  const results = settled(await Promise.allSettled([cancel(one, a, order), cancel(two, a, order)]))
  state.gate = null
  assert.equal(await wallet(a), 100_000, 'the order is refunded once, not twice')
  assert.equal((await requests(order)).length, 1, 'one request is opened')
  assert.deepEqual(results.sort(), ['OPEN_REQUEST', 'ok'])
  assert.equal((await prisma.order.findUniqueOrThrow({where: {id: order.id}})).status, 'REFUNDED')
  const info = await one.customerReturnInfo(a.id, order.id)
  assert.deepEqual([info.eligibility.cancel, info.eligibility.return], [false, false])
  assert.equal(info.eligibility.reason, 'مبلغ این سفارش قبلاً کامل برگشت داده شده است.', 'a completed refund is explained as refunded, not unpaid')
 }

 // --- two requests of one order refunded in the same instant (two staff members, or two requests that already exist)
 if (!skip('pair')) {
  const b = await customer('b'), order = await paidOrder(b)
  const [first, second] = [await request(order, b), await request(order, b)]
  armGate()
  const results = settled(await Promise.allSettled([one.refundReturn({id: first.id, actorId: null}), two.refundReturn({id: second.id, actorId: null})]))
  state.gate = null
  assert.equal(await wallet(b), 100_000, 'two requests together refund no more than the order holds')
  assert.equal(results.filter(result => result === 'ok').length, 1)
  assert.deepEqual((await requests(order)).map(row => [row.status, row.refundMinor]).sort(), [['REFUNDED', 100_000n], ['REQUESTED', 0n]].sort(), 'the other request stays open with nothing refunded')
  // A partial refund then the rest: the second is clamped to what is left.
  const c = await customer('c'), partial = await paidOrder(c)
  const [p1, p2] = [await request(partial, c, {kind: 'RETURN', requestedMinor: 30_000n}), await request(partial, c, {kind: 'RETURN', requestedMinor: 100_000n})]
  await one.refundReturn({id: p1.id, actorId: null}); await one.refundReturn({id: p2.id, actorId: null})
  assert.equal(await wallet(c), 100_000); assert.deepEqual((await requests(partial)).map(row => row.refundMinor), [30_000n, 70_000n])
  await assert.rejects(one.refundReturn({id: p2.id, actorId: null}), error => error.status === 409, 'a finished refund is not paid again')
  assert.equal(await wallet(c), 100_000)
 }

 // --- a refund that was claimed but never credited (the process stopped in between)
 const d = await customer('d'), stopped = await paidOrder(d)
 const claimed = await request(stopped, d, {status: 'REFUNDED', refundMinor: 100_000n, refundedAt: new Date(Date.now() - 30 * 60_000)})
 state.effects.length = 0
 if (baseline) {
  await assert.rejects(one.refundReturn({id: claimed.id, actorId: null}), error => error.status === 409)
  assert.equal(await wallet(d), 100_000, 'the customer of an interrupted refund gets the money')
 }
 // Still failing: it stays claimed and is counted; then it is finished once, with the order-level effects.
 const young = await request(await paidOrder(d), d, {status: 'REFUNDED', refundMinor: 100_000n, refundedAt: new Date()})
 state.failWalletFor = d.id
 assert.deepEqual(await one.recoverInterruptedRefunds(), {checked: 1, finished: 0, failed: 1})
 assert.equal((await prisma.returnRequest.findUniqueOrThrow({where: {id: claimed.id}})).status, 'REFUNDED')
 state.failWalletFor = 0
 assert.deepEqual(await one.recoverInterruptedRefunds(), {checked: 1, finished: 1, failed: 0}, 'a refund claimed less than ten minutes ago may still be in flight and is left')
 assert.equal(await wallet(d), 100_000)
 const finished = await prisma.returnRequest.findUniqueOrThrow({where: {id: claimed.id}})
 assert.ok(finished.walletTxId); assert.equal(finished.restocked, true)
 assert.deepEqual(state.effects, [`restock:${stopped.id}`, `seller:${stopped.id}:100000`, `points:${stopped.id}:100000`])
 assert.equal((await prisma.order.findUniqueOrThrow({where: {id: stopped.id}})).status, 'REFUNDED')
 assert.deepEqual(await one.recoverInterruptedRefunds(), {checked: 0, finished: 0, failed: 0})
 // Credited but the record of it missing: the record is repaired, nothing is paid or restocked again.
 // The database refuses to unlink a paid refund from its wallet row; the crash is staged with the rule lifted for this one statement.
 await prisma.$transaction([prisma.$executeRawUnsafe('ALTER TABLE "ReturnRequest" DISABLE TRIGGER "ReturnRequest_state_rules"'), prisma.returnRequest.update({where: {id: claimed.id}, data: {walletTxId: null}}), prisma.$executeRawUnsafe('ALTER TABLE "ReturnRequest" ENABLE TRIGGER "ReturnRequest_state_rules"')])
 state.effects.length = 0
 assert.deepEqual(await one.recoverInterruptedRefunds(), {checked: 1, finished: 1, failed: 0})
 assert.equal(await wallet(d), 100_000); assert.deepEqual(state.effects, []); assert.ok((await prisma.returnRequest.findUniqueOrThrow({where: {id: claimed.id}})).walletTxId)
 assert.equal((await prisma.returnRequest.findUniqueOrThrow({where: {id: young.id}})).walletTxId, null)
 console.log('PostgreSQL returns: a double cancel refunds once, two requests refund no more than the order holds, a partial then full refund is clamped, an interrupted refund is finished once and a missing record repaired passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await prisma.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(row => row.id)
  await prisma.orderEvent.deleteMany({where: {order: {userId: {in: ids}}}}); await prisma.orderLine.deleteMany({where: {order: {userId: {in: ids}}}}); await prisma.returnRequest.deleteMany({where: {userId: {in: ids}}}); await prisma.invoice.deleteMany({where: {userId: {in: ids}}})
  await prisma.walletTx.deleteMany({where: {userId: {in: ids}}}); await prisma.order.deleteMany({where: {userId: {in: ids}}}); await prisma.product.deleteMany({where: {slug: seed}}); await prisma.user.deleteMany({where: {id: {in: ids}}})
 } finally {await Promise.all(clients.map(client => client.$disconnect()))}
})
