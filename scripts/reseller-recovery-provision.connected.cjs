// Real PostgreSQL orders, invoices and fulfillment jobs: which job a paid order gets when it is queued after the fact.
// Everything a job would then do (panels, stock, memberships, …) is a test double; no job is run here.
// RESELLER_RECOVERY_BASELINE=<git ref> runs the fulfillment jobs of that revision to show the fault there.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `reseller-recovery-${Date.now()}`, baseline = process.env.RESELLER_RECOVERY_BASELINE
const state = {users: []}
// The recovery's scan of paid invoices is limited to this script's.
const invoices = model => new Proxy(model, {get: (target, key) => key === 'findMany' ? args => target.findMany({...args, where: {...args.where, userId: {in: state.users}}}) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const db = new Proxy(prisma, {get: (target, key) => key === 'invoice' ? invoices(target.invoice) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const file = 'src/modules/fulfillment/server/jobs.ts'
const source = baseline ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8', maxBuffer: 1 << 26}) : fs.readFileSync(file, 'utf8')
// Only the database and the logger are real to this module; every other import is an empty stand-in, which is enough to queue jobs.
const stub = new Proxy({}, {get: (_, key) => key === '__esModule' ? false : async () => { throw new Error(`test double called: ${String(key)}`) }})
const mod = {exports: {}}
new Function('require', 'module', 'exports', ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => name === '@/platform/database/prisma' ? {db} : name === '@/platform/observability/logger' ? {logEvent: () => {}} : name.startsWith('@/') ? stub : require(name), mod, mod.exports)
const jobs = mod.exports
let count = 0
async function main() {
 const [reseller, customer, buyer] = await Promise.all(['reseller', 'customer', 'buyer'].map(name => prisma.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}})))
 state.users.push(reseller.id, buyer.id)
 const panel = await prisma.panel.create({data: {name: seed, url: 'https://panel.invalid', type: 'REMNAWAVE', token: 'test-only'}})
 const plan = await prisma.plan.create({data: {name: seed, trafficGB: 50, days: 30, price: 100_000, priceMinor: 100_000n, currency: 'IRT', panelId: panel.id}})
 const paidOrder = async (user, meta) => {
  const order = await prisma.order.create({data: {userId: user.id, planId: plan.id, totalAmount: 100_000, totalMinor: 100_000n, currency: 'IRT', idempotencyKey: `${seed}-${count++}`, status: 'PAID', provider: 'wallet', meta: JSON.stringify(meta)}})
  const invoice = await prisma.invoice.create({data: {number: `${seed}-${count++}`, userId: user.id, orderId: order.id, planId: plan.id, status: 'PAID', kind: 'BILLING', total: 100_000, totalMinor: 100_000n, currency: 'IRT'}})
  return {order, invoice}
 }
 const jobOf = async order => { const row = await prisma.fulfillmentJob.findFirst({where: {orderId: order.id}}); return row && {kind: row.kind, dedupeKey: row.dedupeKey, payload: JSON.parse(row.payload)} }
 const sale = {kind: 'reseller', resellerId: 77, customerUserId: customer.id, customerEmail: customer.email, username: 'client-one', trafficGB: 20, days: 15, deviceLimit: 2}

 // --- a paid reseller sale that never got its job (the process stopped between settling and queueing)
 const lost = await paidOrder(reseller, sale)
 const ordinary = await paidOrder(buyer, {})
 const renewal = await paidOrder(buyer, {kind: 'renewal', subscriptionId: 4242, days: 30, trafficGB: 50, renewalVersion: 2})
 const result = await jobs.recoverMissingPaidFulfillment(20)
 assert.deepEqual([result.enqueued, result.failed], [3, 0])
 assert.deepEqual(await jobOf(lost.order), {
  kind: 'RESELLER_PROVISION', dedupeKey: `RESELLER_PROVISION:order:${lost.order.id}`,
  payload: {customerUserId: customer.id, resellerId: 77, planId: plan.id, username: 'client-one', trafficGB: 20, days: 15, deviceLimit: 2},
 }, 'the account is queued for the reseller\'s customer with the allowance the reseller chose')
 // Other paid orders are queued as before.
 assert.equal((await jobOf(ordinary.order)).kind, 'PROVISION_SUBSCRIPTION')
 assert.deepEqual([(await jobOf(renewal.order)).kind, (await jobOf(renewal.order)).payload.subscriptionId], ['RENEW_SUBSCRIPTION', 4242])
 if (baseline) return console.log(`No fault shown at ${baseline}`)
 // Queued once, whoever queues it: the reseller's own retry uses the same key.
 assert.deepEqual(await jobs.recoverMissingPaidFulfillment(20), {checked: 3, enqueued: 0, failed: 0})
 await jobs.enqueueOrderFulfillment({orderId: lost.order.id, invoiceId: lost.invoice.id, planId: plan.id})
 assert.equal(await prisma.fulfillmentJob.count({where: {orderId: lost.order.id}}), 1)
 // A reseller order that does not say whose account it is cannot be provisioned for anyone: it is reported, not guessed.
 const broken = await paidOrder(reseller, {kind: 'reseller', resellerId: 77})
 assert.deepEqual(await jobs.recoverMissingPaidFulfillment(20), {checked: 4, enqueued: 0, failed: 1})
 assert.equal(await jobOf(broken.order), null)
 console.log('PostgreSQL fulfillment recovery: a paid reseller sale is queued as the customer\'s account with its chosen allowance, ordinary and renewal orders unchanged, queued once, an incomplete reseller order reported passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await prisma.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(row => row.id)
  await prisma.fulfillmentJob.deleteMany({where: {order: {userId: {in: ids}}}}).catch(async () => { const orders = (await prisma.order.findMany({where: {userId: {in: ids}}, select: {id: true}})).map(row => row.id); await prisma.fulfillmentJob.deleteMany({where: {orderId: {in: orders}}}) })
  await prisma.invoice.deleteMany({where: {userId: {in: ids}}}); await prisma.order.deleteMany({where: {userId: {in: ids}}})
  await prisma.plan.deleteMany({where: {name: seed}}); await prisma.panel.deleteMany({where: {name: seed}}); await prisma.user.deleteMany({where: {id: {in: ids}}})
 } finally {await prisma.$disconnect()}
})
