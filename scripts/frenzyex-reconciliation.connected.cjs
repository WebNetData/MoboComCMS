// Real PostgreSQL FrenzyEx reconciliation selection; the provider is a test double that reports every request as still pending,
// so no invoice is settled, and the run only sees this script's invoices.
// Its payments are stored under a provider name of their own, so a worker of another process using the same
// database (a local app container, for instance) never selects them: such a worker once polled six of the
// due test requests between two batches and made the order assertions fail.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `frenzy-reconcile-${Date.now()}`
const baseline = process.env.FRENZY_RECONCILE_BASELINE
const state = {throwFor: ''}, polled = []
const PROVIDER = `TEST-${seed}`
const own = args => ({...args, where: {...args.where, ...(args.where.provider === 'FRENZYEX' ? {provider: PROVIDER} : {}), invoice: {...(args.where.invoice || {}), number: {startsWith: seed}}}})
const payment = new Proxy(prisma.payment, {get(target, key) {return ['findMany', 'findFirst', 'count'].includes(key) ? args => target[key](own(args)) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
const db = new Proxy(prisma, {get(target, key) {return key === 'payment' ? payment : typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
// FRENZY_RECONCILE_BASELINE=<git ref> runs the reconciliation service of that revision to reproduce the old behaviour.
const file = 'src/modules/billing/server/frenzyex-reconciliation.ts'
const source = baseline ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8'}) : fs.readFileSync(file, 'utf8')
const money = {normalizeCurrency: value => String(value).toUpperCase(), toMinor: value => BigInt(Math.round(Number(value))), legacyNumber: value => Number(value)}
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/modules/billing/infrastructure/frenzyex': {
  getFrenzyPayment: async (_key, requestId) => {
   if (requestId === state.throwFor) throw new Error('unexpected provider reply')
   polled.push(requestId)
   return {ok: true, snapshot: {requestId, orderRef: requestId.replace('req-', ''), amount: 1000, amountCcy: 'TMN', status: 'pending'}}
  },
  cancelFrenzyPayment: async () => ({ok: false}),
 },
 '@/modules/billing/server/billing': {}, '@/modules/catalog/server/inventory': {}, '@/modules/fulfillment/server/jobs': {}, '@/modules/wallet/server/wallet': {},
 '@/shared/money': money,
}
function load() {
 const mod = {exports: {}}
 new Function('require', 'module', 'exports', ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), mod, mod.exports)
 return mod.exports
}
let user, count = 0
async function pending(reconcile, tracked = true) {
 const number = `${seed}-${String(count++).padStart(4, '0')}`
 const invoice = await prisma.invoice.create({data: {number, userId: user.id, status: 'UNPAID', providerTxnId: tracked ? `req-${number}` : ''}})
 return prisma.payment.create({data: {userId: user.id, invoiceId: invoice.id, provider: PROVIDER, providerTxnId: tracked ? `req-${number}` : '', amountMinor: 1000n, currency: 'TMN', status: 'PENDING', raw: JSON.stringify(reconcile ? {reconcile} : {})}})
}
const meta = async row => JSON.parse((await prisma.payment.findUniqueOrThrow({where: {id: row.id}})).raw).reconcile || {}
const future = () => new Date(Date.now() + 10 * 60_000).toISOString()
async function main() {
 process.env.FRENZYEX_API_KEY = 'test-only'
 const service = load()
 user = await prisma.user.create({data: {email: `${seed}@example.invalid`, passwordHash: 'test-only'}})
 // More open requests than one read are waiting for their next check; a newer request that is due must still be polled.
 const invoices = Array.from({length: 205}, () => `${seed}-${String(count++).padStart(4, '0')}`)
 await prisma.invoice.createMany({data: invoices.map(number => ({number, userId: user.id, status: 'UNPAID', providerTxnId: `req-${number}`}))})
 const stored = await prisma.invoice.findMany({where: {number: {in: invoices}}, select: {id: true, number: true}})
 await prisma.payment.createMany({data: stored.map(invoice => ({userId: user.id, invoiceId: invoice.id, provider: PROVIDER, providerTxnId: `req-${invoice.number}`, amountMinor: 1000n, currency: 'TMN', status: 'PENDING', raw: JSON.stringify({reconcile: {nextAt: future()}})}))})
 const fresh = await pending(null)
 let result = await service.processFrenzyReconciliationBatch(20)
 if (baseline) {
  assert.equal(result.checked, 0); assert.equal(polled.length, 0); assert.equal((await meta(fresh)).lastCheckedAt, undefined)
  console.log(`Reproduced at ${baseline}: 205 open requests waiting for their next check filled the 200-request window, so a newer due request was never polled`)
  await prisma.payment.deleteMany({where: {invoiceId: {in: stored.map(invoice => invoice.id)}}}); await prisma.invoice.deleteMany({where: {id: {in: stored.map(invoice => invoice.id)}}})
  const broken = await pending(null), behind = await pending(null)
  await prisma.payment.update({where: {id: fresh.id}, data: {raw: JSON.stringify({reconcile: {nextAt: future()}})}})
  state.throwFor = broken.providerTxnId
  await assert.rejects(service.processFrenzyReconciliationBatch(20)); assert.equal((await meta(behind)).lastCheckedAt, undefined)
  console.log(`Reproduced at ${baseline}: one request whose poll threw aborted the batch (and with it the rest of the order worker) before the next request`)
  return
 }
 assert.equal(result.checked, 1); assert.equal(result.pending, 1); assert.equal(result.deferred, 205); assert.deepEqual(polled, [fresh.providerTxnId])
 let checked = await meta(fresh)
 assert.ok(checked.lastCheckedAt); assert.ok(new Date(checked.nextAt).getTime() > Date.now(), 'a pending request is scheduled for its next check')
 result = await service.processFrenzyReconciliationBatch(20)
 assert.equal(result.checked, 0, 'a request is not polled again before its next check'); assert.equal(result.deferred, 206)
 await prisma.payment.deleteMany({where: {invoiceId: {in: stored.map(invoice => invoice.id)}}}); await prisma.invoice.deleteMany({where: {id: {in: stored.map(invoice => invoice.id)}}})
 // More due requests than one batch: the ones never checked go before the ones just checked.
 const many = []
 for (let i = 0; i < 30; i++) many.push(await pending(null))
 polled.length = 0
 result = await service.processFrenzyReconciliationBatch(20)
 assert.equal(result.checked, 20); assert.deepEqual(polled, many.slice(0, 20).map(row => row.providerTxnId))
 // A minute later the first twenty are due again.
 for (const row of many.slice(0, 20)) {const current = await meta(row); await prisma.payment.update({where: {id: row.id}, data: {raw: JSON.stringify({reconcile: {...current, nextAt: new Date(Date.now() - 1000).toISOString()}})}})}
 polled.length = 0
 result = await service.processFrenzyReconciliationBatch(20)
 assert.equal(result.checked, 20)
 assert.deepEqual(polled.slice(0, 10), many.slice(20).map(row => row.providerTxnId), 'requests that were never checked are polled first')
 assert.deepEqual(polled.slice(10), many.slice(0, 10).map(row => row.providerTxnId), 'then the ones checked longest ago')
 await prisma.payment.updateMany({where: {id: {in: many.map(row => row.id)}}, data: {raw: JSON.stringify({reconcile: {nextAt: future()}})}})
 // A request without a provider id cannot be polled and is reported; a poll that throws fails alone.
 const untracked = await pending(null, false), broken = await pending(null), behind = await pending(null)
 state.throwFor = broken.providerTxnId; polled.length = 0
 result = await service.processFrenzyReconciliationBatch(20)
 assert.equal(result.checked, 2); assert.equal(result.failed, 1); assert.equal(result.pending, 1); assert.equal(result.untracked, 1)
 assert.deepEqual(polled, [behind.providerTxnId]); assert.equal((await meta(untracked)).lastCheckedAt, undefined)
 // A request settled by a callback after the scan is not polled.
 state.throwFor = ''; polled.length = 0
 await prisma.invoice.update({where: {id: broken.invoiceId}, data: {status: 'PAID'}})
 result = await service.processFrenzyReconciliationBatch(20)
 assert.equal(result.checked, 0); assert.deepEqual(polled, [])
 console.log('PostgreSQL due request past 205 waiting requests, no early re-poll, least-recently-checked order across batches, untracked report, isolated poll failure and settled-invoice skip passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await prisma.invoice.findMany({where: {number: {startsWith: seed}}, select: {id: true}})).map(row => row.id)
  await prisma.payment.deleteMany({where: {invoiceId: {in: ids}}}); await prisma.invoice.deleteMany({where: {id: {in: ids}}}); if (user) await prisma.user.deleteMany({where: {id: user.id}})
 } finally {await prisma.$disconnect()}
})
