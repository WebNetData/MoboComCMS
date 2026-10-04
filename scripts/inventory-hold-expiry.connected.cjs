// Real PostgreSQL stock holds. The expiry job is global, so the run only lists this script's orders.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `inventory-hold-${Date.now()}`, orders = []
const baseline = process.env.INVENTORY_HOLD_BASELINE
const state = {afterList: null}
// The expired-hold listing is limited to this script's orders; `afterList` lets a payment arrive right after the listing.
const reservations = new Proxy(prisma.inventoryReservation, {get(target, key) {
 if (key !== 'findMany') return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
 return async args => {
  if (!args.distinct) return target.findMany(args)
  const rows = await target.findMany({...args, where: {...args.where, orderId: {in: orders}}})
  if (state.afterList) {const hook = state.afterList; state.afterList = null; await hook()}
  return rows
 }
}})
const db = new Proxy(prisma, {get(target, key) {return key === 'inventoryReservation' ? reservations : typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
// INVENTORY_HOLD_BASELINE=<git ref> runs the inventory service of that revision to reproduce the old behaviour.
const file = 'src/modules/catalog/server/inventory.ts'
const source = baseline ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8'}) : fs.readFileSync(file, 'utf8')
function load() {
 const mod = {exports: {}}
 new Function('require', 'module', 'exports', ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => name === '@/platform/database/prisma' ? {db} : require(name), mod, mod.exports)
 return mod.exports
}
let user, product
const stock = async () => (await prisma.product.findUniqueOrThrow({where: {id: product.id}})).stock
const hold = async orderId => prisma.inventoryReservation.findFirstOrThrow({where: {orderId}})
const past = () => new Date(Date.now() - 5 * 60_000)
async function main() {
 const inventory = load()
 user = await prisma.user.create({data: {email: `${seed}@example.invalid`, passwordHash: 'test-only'}})
 product = await prisma.product.create({data: {slug: seed, name: seed, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 5, approval: 'APPROVED'}})
 // An order with one unit held; `expired` puts the hold past its lease.
 const order = async (status, expired = true) => {
  const row = await prisma.order.create({data: {userId: user.id, idempotencyKey: `${seed}-${orders.length}`, totalAmount: 1000, totalMinor: 1000n, currency: 'IRT', productId: product.id, status: 'PENDING'}})
  orders.push(row.id)
  assert.deepEqual(await inventory.reserveInventory({orderId: row.id}), {ok: true, lines: 1})
  if (expired) await prisma.inventoryReservation.updateMany({where: {orderId: row.id}, data: {expiresAt: past()}})
  if (status !== 'PENDING') await prisma.order.update({where: {id: row.id}, data: {status}})
  return row
 }
 // A paid order whose delivery is late: its hold has run out but the unit is sold.
 const paid = await order('PAID')
 assert.equal(await stock(), 4)
 let released = await inventory.releaseExpiredReservations(100)
 if (baseline) {
  assert.equal(released, 1); assert.equal((await hold(paid.id)).status, 'RELEASED'); assert.equal(await stock(), 5)
  const consumed = await inventory.consumeInventoryReservation(paid.id)
  assert.equal(consumed.ok, false)
  console.log(`Reproduced at ${baseline}: the expired hold of a paid order was released, its unit went back on sale, and delivery then failed with "${consumed.message}"`)
  const late = await order('PENDING')
  state.afterList = () => prisma.inventoryReservation.updateMany({where: {orderId: late.id}, data: {expiresAt: new Date(Date.now() + 3_600_000)}})
  assert.equal(await inventory.releaseExpiredReservations(100), 1); assert.equal((await hold(late.id)).status, 'RELEASED')
  console.log(`Reproduced at ${baseline}: a hold extended by an arriving payment right after it was listed as expired was released anyway`)
  return
 }
 assert.equal(released, 0)
 let row = await hold(paid.id)
 assert.equal(row.status, 'HELD'); assert.ok(row.expiresAt.getTime() > Date.now() + 50 * 60_000, 'the paid hold is moved out of the expiry window'); assert.equal(await stock(), 4)
 assert.equal(await inventory.releaseExpiredReservations(100), 0, 'it is not listed again')
 assert.deepEqual(await inventory.consumeInventoryReservation(paid.id), {ok: true, consumed: true}); assert.equal((await hold(paid.id)).status, 'CONSUMED')
 // Unpaid orders: an expired hold goes back on sale once, a live hold stays.
 const abandoned = await order('PENDING'), open = await order('PENDING', false)
 assert.equal(await stock(), 2)
 assert.equal(await inventory.releaseExpiredReservations(100), 1)
 assert.equal((await hold(abandoned.id)).status, 'RELEASED'); assert.equal((await hold(open.id)).status, 'HELD'); assert.equal(await stock(), 3)
 assert.equal(await inventory.releaseExpiredReservations(100), 0); assert.equal(await stock(), 3)
 // A payment that extends the hold right after it was listed as expired keeps its unit.
 const late = await order('PENDING')
 assert.equal(await stock(), 2)
 state.afterList = async () => {assert.deepEqual(await inventory.ensureInventoryReservation({orderId: late.id, holdMinutes: 60}), {ok: true, lines: 1})}
 assert.equal(await inventory.releaseExpiredReservations(100), 0)
 assert.equal((await hold(late.id)).status, 'HELD'); assert.equal(await stock(), 2)
 // An order that became paid after it was listed keeps its hold too.
 const settling = await order('PENDING')
 state.afterList = () => prisma.order.update({where: {id: settling.id}, data: {status: 'PAID'}})
 assert.equal(await inventory.releaseExpiredReservations(100), 0); assert.equal((await hold(settling.id)).status, 'HELD'); assert.equal(await stock(), 1)
 // A released hold is taken again when the customer pays late and stock allows; the staff release still works.
 assert.deepEqual(await inventory.ensureInventoryReservation({orderId: abandoned.id}), {ok: true, lines: 1})
 assert.equal((await hold(abandoned.id)).status, 'HELD'); assert.equal(await stock(), 0)
 assert.deepEqual(await inventory.releaseInventoryReservation(open.id), {ok: true, released: true}); assert.equal(await stock(), 1)
 console.log('PostgreSQL paid hold kept and consumed, abandoned hold released once, live hold kept, extension and payment racing the expiry job, late re-take and staff release passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  await prisma.inventoryReservation.deleteMany({where: {orderId: {in: orders}}}); await prisma.order.deleteMany({where: {id: {in: orders}}})
  if (product) await prisma.product.deleteMany({where: {id: product.id}}); if (user) await prisma.user.deleteMany({where: {id: user.id}})
 } finally {await prisma.$disconnect()}
})
