// Real PostgreSQL invoices, jobs, deliveries and order events. The recoveries only see this script's rows; nothing a job would do is run.
// FULFILLMENT_WINDOW_BASELINE=<git ref> runs the fulfillment jobs of that revision to show the fault there.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `fulfil-window-${Date.now()}`, baseline = process.env.FULFILLMENT_WINDOW_BASELINE
const state = {users: [], failSaleFor: 0}
const scoped = (model, scope) => new Proxy(model, {get: (target, key) => key === 'findMany' ? args => target.findMany({...args, where: scope(args.where)}) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const db = new Proxy(prisma, {get: (target, key) => key === 'invoice' ? scoped(target.invoice, where => ({...where, userId: {in: state.users}})) : key === 'productDelivery' ? scoped(target.productDelivery, where => ({...where, order: {...where.order, userId: {in: state.users}}})) : key === '$transaction' ? (work, ...rest) => typeof work === 'function' ? target.$transaction(async tx => { const result = await work(tx); return result }, ...rest) : target.$transaction(work, ...rest) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const stub = new Proxy({}, {get: (_, key) => key === '__esModule' ? false : async () => { throw new Error(`test double called: ${String(key)}`) }})
function load(file, real = {}) {
 const source = baseline && file === 'src/modules/fulfillment/server/jobs.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8', maxBuffer: 1 << 26}) : fs.readFileSync(file, 'utf8')
 const mod = {exports: {}}
 new Function('require', 'module', 'exports', ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => name === '@/platform/database/prisma' ? {db} : name === '@/platform/observability/logger' ? {logEvent: () => {}} : Object.hasOwn(real, name) ? real[name] : name.startsWith('@/') ? stub : require(name), mod, mod.exports)
 return mod.exports
}
let count = 0
async function main() {
 const jobs = load('src/modules/fulfillment/server/jobs.ts')
 const buyer = await prisma.user.create({data: {email: `${seed}@example.invalid`, passwordHash: 'test-only'}})
 state.users.push(buyer.id)
 const panel = await prisma.panel.create({data: {name: seed, url: 'https://panel.invalid', type: 'REMNAWAVE', token: 'test-only'}})
 const plan = await prisma.plan.create({data: {name: seed, trafficGB: 50, days: 30, price: 1000, priceMinor: 1000n, currency: 'IRT', panelId: panel.id}})
 const order = extra => prisma.order.create({data: {userId: buyer.id, planId: plan.id, totalAmount: 1000, totalMinor: 1000n, currency: 'IRT', idempotencyKey: `${seed}-${count++}`, status: 'PAID', provider: 'wallet', ...extra}})
 const invoiceFor = row => prisma.invoice.create({data: {number: `${seed}-${count++}`, userId: buyer.id, orderId: row.id, planId: plan.id, status: 'PAID', kind: 'BILLING', total: 1000, totalMinor: 1000n, currency: 'IRT'}})

 // --- a paid order without a job, older than more than one page of newer paid orders that all have theirs
 const forgotten = await order(); await invoiceFor(forgotten)
 const newer = []
 for (let i = 0; i < 520; i++) newer.push({userId: buyer.id, planId: plan.id, totalAmount: 1000, totalMinor: 1000n, currency: 'IRT', idempotencyKey: `${seed}-${count++}`, status: 'PAID', provider: 'wallet'})
 await prisma.order.createMany({data: newer})
 const rows = await prisma.order.findMany({where: {userId: buyer.id, id: {gt: forgotten.id}}, select: {id: true}, orderBy: {id: 'asc'}})
 await prisma.invoice.createMany({data: rows.map(row => ({number: `${seed}-${count++}`, userId: buyer.id, orderId: row.id, planId: plan.id, status: 'PAID', kind: 'BILLING', total: 1000, totalMinor: 1000n, currency: 'IRT'}))})
 await prisma.fulfillmentJob.createMany({data: rows.map(row => ({kind: 'PROVISION_SUBSCRIPTION', dedupeKey: `PROVISION_SUBSCRIPTION:order:${row.id}`, status: 'DONE', orderId: row.id}))})
 const result = await jobs.recoverMissingPaidFulfillment(20)
 assert.equal(await prisma.fulfillmentJob.count({where: {orderId: forgotten.id}}), 1, 'the paid order behind a full page of fulfilled ones still gets its job')
 assert.deepEqual([result.checked, result.enqueued, result.failed], [521, 1, 0])
 if (baseline) return console.log(`No fault shown at ${baseline}`)
 assert.deepEqual(await jobs.recoverMissingPaidFulfillment(20), {checked: 521, enqueued: 0, failed: 0})
 // The per-run limit still holds, newest first.
 const three = []; for (let i = 0; i < 3; i++) { const row = await order(); await invoiceFor(row); three.push(row) }
 assert.deepEqual(await jobs.recoverMissingPaidFulfillment(2), {checked: 500, enqueued: 2, failed: 0})
 assert.deepEqual(await Promise.all(three.map(row => prisma.fulfillmentJob.count({where: {orderId: row.id}}))), [0, 1, 1])
 assert.deepEqual(await jobs.recoverMissingPaidFulfillment(20), {checked: 524, enqueued: 1, failed: 0})

 // --- a delivered store order whose sale was never recorded
 const orders = load('src/modules/store/server/orders.ts', {'@/modules/store/domain/store': load('src/modules/store/domain/store.ts'), '@/shared/money': (() => { const m = {exports: {}}; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/shared/money/index.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => name.startsWith('.') || name.startsWith('@/shared/money/') ? (() => { const file = `src/shared/money/${name.replace('./', '').replace('@/shared/money/', '')}.ts`, inner = {exports: {}}; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(require, inner, inner.exports); return inner.exports })() : require(name), m, m.exports); return m.exports })()})
 const product = await prisma.product.create({data: {slug: seed, name: seed, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 30, approval: 'APPROVED'}})
 const delivered = async ({age = 30, status = 'PAID', recorded = false} = {}) => {
  const row = await prisma.order.create({data: {userId: buyer.id, productId: product.id, totalAmount: 1000, totalMinor: 1000n, currency: 'IRT', idempotencyKey: `${seed}-${count++}`, status, provider: 'wallet', lines: {create: [{name: 'item', productId: product.id, quantity: 3, unitPriceMinor: 1000n, totalMinor: 3000n}]}}})
  await prisma.productDelivery.create({data: {orderId: row.id, createdAt: new Date(Date.now() - age * 60_000)}})
  if (recorded) await prisma.orderEvent.create({data: {orderId: row.id, status: 'PAID', note: 'x'}})
  return row
 }
 const sold = async () => (await prisma.product.findUniqueOrThrow({where: {id: product.id}})).soldCount
 const paidEvents = row => prisma.orderEvent.count({where: {orderId: row.id, status: 'PAID'}})
 const lost = await delivered(), done = await delivered({recorded: true}), young = await delivered({age: 2}), old = await delivered({age: 60 * 24 * 5}), refunded = await delivered({status: 'REFUNDED'})
 assert.deepEqual(await orders.recoverStoreSaleRecords(20), {checked: 1, recorded: 1, failed: 0})
 assert.equal(await paidEvents(lost), 1, 'the order\'s timeline gets its "paid" entry'); assert.equal(await sold(), 3, 'and the product its sold count')
 assert.deepEqual(await Promise.all([done, young, old, refunded].map(paidEvents)), [1, 0, 0, 0], 'already recorded, young, old and refunded orders are left')
 assert.deepEqual(await orders.recoverStoreSaleRecords(20), {checked: 0, recorded: 0, failed: 0}); assert.equal(await sold(), 3, 'recorded once')
 console.log('PostgreSQL fulfillment recovery: a paid order behind more than a page of fulfilled ones is queued, the per-run limit holds, and an unrecorded delivered sale is recorded once passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await prisma.order.findMany({where: {userId: {in: state.users}}, select: {id: true}})).map(row => row.id)
  for (let i = 0; i < ids.length; i += 400) { const part = ids.slice(i, i + 400); await prisma.fulfillmentJob.deleteMany({where: {orderId: {in: part}}}); await prisma.orderEvent.deleteMany({where: {orderId: {in: part}}}); await prisma.productDelivery.deleteMany({where: {orderId: {in: part}}}); await prisma.orderLine.deleteMany({where: {orderId: {in: part}}}) }
  await prisma.invoice.deleteMany({where: {userId: {in: state.users}}}); await prisma.order.deleteMany({where: {userId: {in: state.users}}})
  await prisma.product.deleteMany({where: {slug: seed}}); await prisma.plan.deleteMany({where: {name: seed}}); await prisma.panel.deleteMany({where: {name: seed}}); await prisma.user.deleteMany({where: {id: {in: state.users}}})
 } finally {await prisma.$disconnect()}
})
