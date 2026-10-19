// Real PostgreSQL abandoned-cart reminders; settings, inbox and cart pricing are isolated.
// The run uses a clock far in the future, so carts that already exist in the database are out of its window.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `cart-recovery-${Date.now()}`, now = new Date('2100-01-01T12:00:00Z')
const baseline = process.env.CART_RECOVERY_BASELINE
const settings = {enabled: true, steps: [{afterHours: 1, message: 'first'}, {afterHours: 24, message: 'second', couponCode: 'BACK10'}], minValueToman: 0, maxAgeDays: 7}
const inbox = [], state = {failInboxFor: 0, failViewFor: 0}
// CART_RECOVERY_BASELINE=<git ref> runs the marketing service of that revision to reproduce the old behaviour.
const source = file => baseline && file === 'src/modules/store/server/marketing.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8'}) : fs.readFileSync(file, 'utf8')
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/config/env': {authSecret: 'test-only'},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/modules/settings/server': {readJsonSetting: async key => key === 'store.cartRecovery.v1' ? settings : null, writeJsonSetting: async () => {}},
 '@/modules/notifications/server/inbox': {createInboxEvent: async event => {
  if (event.userId === state.failInboxFor) throw new Error('inbox unavailable')
  if (!inbox.some(row => row.dedupeKey === event.dedupeKey)) inbox.push(event)
  return event
 }},
 '@/modules/wallet/server/wallet': {}, '@/modules/providers/server/panel-credentials': {},
 '@/modules/store/server/cart': {cartView: async owner => {
  if (owner.userId === state.failViewFor) throw new Error('cart cannot be priced')
  const rows = await db.cartLine.findMany({where: {cart: {userId: owner.userId}}, include: {product: true}})
  return {currency: 'IRT', itemsTotal: rows.reduce((sum, row) => sum + row.product.price * row.quantity, 0), lines: rows.map(row => ({name: row.product.name, issue: ''}))}
 }},
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
const hoursAgo = hours => new Date(now.getTime() - hours * 3_600_000)
let product
async function abandoned(name, hours, reminderCount = 0) {
 const user = await db.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}})
 const cart = await db.cart.create({data: {userId: user.id, token: `${seed}-${name}-cart`, reminderCount, updatedAt: hoursAgo(hours), lines: {create: {productId: product.id, quantity: 2}}}})
 return {user, cart}
}
const read = row => db.cart.findUniqueOrThrow({where: {id: row.cart.id}})
const reminders = row => db.cartReminder.findMany({where: {cartId: row.cart.id}, orderBy: {step: 'asc'}})
async function main() {
 const service = load('src/modules/store/server/marketing.ts')
 product = await db.product.create({data: {slug: seed, name: seed, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 30, approval: 'APPROVED'}})
 // More carts than one run reads are between two steps; they must not hold back the carts that are due.
 await db.user.createMany({data: Array.from({length: 205}, (_, i) => ({email: `${seed}-waiting-${i}@example.invalid`, passwordHash: 'test-only'}))})
 const waiting = await db.user.findMany({where: {email: {startsWith: `${seed}-waiting-`}}, select: {id: true}})
 await db.cart.createMany({data: waiting.map((user, i) => ({userId: user.id, token: `${seed}-waiting-${i}-cart`, reminderCount: 1, updatedAt: hoursAgo(10)}))})
 const waitingCarts = await db.cart.findMany({where: {token: {startsWith: `${seed}-waiting-`}}, select: {id: true}})
 await db.cartLine.createMany({data: waitingCarts.map(cart => ({cartId: cart.id, productId: product.id, quantity: 1}))})
 const due = await abandoned('due', 2)
 let result = await service.runCartRecovery(now)
 if (baseline) {
  assert.equal(result.sent, 0); assert.equal((await read(due)).reminderCount, 0)
  console.log(`Reproduced at ${baseline}: 205 carts waiting for their second reminder filled the 200-cart window, so a cart due for its first reminder was not reminded`)
  await db.cart.deleteMany({where: {token: {startsWith: `${seed}-waiting-`}}})
  const poison = await abandoned('poison', 3), behind = await abandoned('behind', 2.5)
  state.failViewFor = poison.user.id
  await assert.rejects(service.runCartRecovery(now)); assert.equal((await read(behind)).reminderCount, 0)
  console.log(`Reproduced at ${baseline}: one cart that cannot be priced aborted the run before the next due cart`)
  state.failViewFor = 0; await db.cart.deleteMany({where: {id: poison.cart.id}})
  state.failInboxFor = due.user.id
  await service.runCartRecovery(now)
  assert.equal((await read(due)).reminderCount, 1); assert.equal((await reminders(due)).length, 1); assert.equal(inbox.filter(row => row.userId === due.user.id).length, 0)
  console.log(`Reproduced at ${baseline}: a failed inbox write consumed the reminder step and recorded it as sent although the customer received nothing`)
  return
 }
 assert.equal(result.sent, 1, 'only the due cart is reminded')
 let row = await read(due)
 assert.equal(row.reminderCount, 1); assert.equal(row.updatedAt.getTime(), hoursAgo(2).getTime(), 'the schedule stays measured from the last change')
 assert.equal(row.remindedAt.getTime(), now.getTime())
 assert.deepEqual((await reminders(due)).map(item => [item.step, item.couponCode, item.valueMinor, item.currency]), [[0, '', 2000n, 'IRT']])
 assert.deepEqual(inbox.map(item => [item.userId, item.kind, item.dedupeKey, item.href]), [[due.user.id, 'CART_REMINDER', `cart:${due.cart.id}:0:${hoursAgo(2).getTime()}`, '/cart']])
 assert.equal(await db.cart.count({where: {token: {startsWith: `${seed}-waiting-`}, reminderCount: 1, remindedAt: null}}), 205, 'carts between two steps are untouched')
 assert.deepEqual(await service.runCartRecovery(now), {sent: 0}, 'a step is sent once')
 await db.cart.deleteMany({where: {token: {startsWith: `${seed}-waiting-`}}})
 // A cart that cannot be priced fails alone; the carts behind it are still reminded.
 const poison = await abandoned('poison', 3), behind = await abandoned('behind', 2.5)
 state.failViewFor = poison.user.id
 assert.deepEqual(await service.runCartRecovery(now), {sent: 1})
 assert.equal((await read(poison)).reminderCount, 0); assert.equal((await read(behind)).reminderCount, 1)
 state.failViewFor = 0
 assert.deepEqual(await service.runCartRecovery(now), {sent: 1}, 'the failed cart is reminded once it can be priced')
 assert.equal((await read(poison)).reminderCount, 1)
 // A failed inbox write keeps the step due; the retry sends it exactly once.
 const unlucky = await abandoned('unlucky', 30, 1)
 state.failInboxFor = unlucky.user.id
 assert.deepEqual(await service.runCartRecovery(now), {sent: 0})
 assert.equal((await read(unlucky)).reminderCount, 1); assert.equal((await reminders(unlucky)).length, 0)
 state.failInboxFor = 0
 const twice = await Promise.all([service.runCartRecovery(now), service.runCartRecovery(now)])
 assert.equal(twice[0].sent + twice[1].sent, 1, 'two schedulers send one reminder')
 assert.equal((await read(unlucky)).reminderCount, 2)
 assert.deepEqual((await reminders(unlucky)).map(item => [item.step, item.couponCode]), [[1, 'BACK10']])
 assert.equal(inbox.filter(item => item.userId === unlucky.user.id).length, 1); assert.ok(inbox.find(item => item.userId === unlucky.user.id).bodyFa.includes('BACK10'))
 // A cart never reminded but already past the second step gets one reminder per run, in order.
 const late = await abandoned('late', 30)
 assert.deepEqual(await service.runCartRecovery(now), {sent: 1}); assert.equal((await read(late)).reminderCount, 1)
 assert.deepEqual(await service.runCartRecovery(now), {sent: 1}); assert.equal((await read(late)).reminderCount, 2)
 assert.deepEqual((await reminders(late)).map(item => item.step), [0, 1])
 // An order since the last change, a cart older than the window and disabled recovery send nothing.
 const bought = await abandoned('bought', 2), old = await abandoned('old', 24 * 8)
 await db.order.create({data: {userId: bought.user.id, idempotencyKey: `${seed}-order`, totalAmount: 1, totalMinor: 1000n, currency: 'IRT', productId: product.id, createdAt: hoursAgo(1)}})
 assert.deepEqual(await service.runCartRecovery(now), {sent: 0})
 assert.equal((await read(bought)).reminderCount, settings.steps.length, 'a bought cart is closed'); assert.equal((await read(old)).reminderCount, 0)
 const before = inbox.length, fresh = await abandoned('disabled', 2)
 settings.enabled = false
 assert.deepEqual(await service.runCartRecovery(now), {sent: 0}); assert.equal((await read(fresh)).reminderCount, 0); assert.equal(inbox.length, before)
 console.log('PostgreSQL due-only selection past 205 waiting carts, single send, isolated pricing failure, inbox-failure retry, concurrent schedulers, step order, bought/old/disabled carts passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const users = await db.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}}), ids = users.map(user => user.id)
  await db.cartReminder.deleteMany({where: {userId: {in: ids}}}); await db.order.deleteMany({where: {userId: {in: ids}}})
  await db.cart.deleteMany({where: {userId: {in: ids}}}); await db.product.deleteMany({where: {slug: seed}}); await db.user.deleteMany({where: {id: {in: ids}}})
 } finally {await db.$disconnect()}
})
