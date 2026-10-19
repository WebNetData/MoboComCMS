// Real PostgreSQL invoices and wallet on two database connections, like two server processes. The inbox, extension events,
// SMS and referral follow-ups are test doubles.
// INVOICE_VOID_BASELINE=<git ref> runs the billing service of that revision, and closes invoices the way that revision's callers
// did (release the credit, then mark void), to show the faults there. INVOICE_VOID_SKIP=claim leaves out the first section.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `inv-void-${Date.now()}`, baseline = process.env.INVOICE_VOID_BASELINE
const skip = name => (process.env.INVOICE_VOID_SKIP || '').split(',').includes(name)
const state = {hold: null, failWalletFor: 0, users: []}
// A settlement is stopped right after it has read the invoice, until the test lets it go on: the gap in which another request can act.
const clients = [prisma]
const invoices = model => new Proxy(model, {get: (target, key) => key === 'findUnique' ? async args => { const row = await target.findUnique(args); const hold = state.hold; if (hold && !hold.used) { hold.used = true; hold.reached(); await hold.released } return row } : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
// The worker's scan only sees this script's invoices.
const scoped = model => new Proxy(model, {get: (target, key) => key === 'findMany' ? args => target.findMany({...args, where: {...args.where, userId: {in: state.users}}}) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const wrap = (client, inTx = false) => new Proxy(client, {get: (target, key) => key === 'invoice' ? (inTx ? invoices(target.invoice) : scoped(target.invoice)) : key === '$transaction' ? (work, ...rest) => typeof work === 'function' ? target.$transaction(tx => work(wrap(tx, true)), ...rest) : target.$transaction(work, ...rest) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const source = file => baseline && file === 'src/modules/billing/server/billing.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8', maxBuffer: 1 << 26}) : fs.readFileSync(file, 'utf8')
function instance(client = new PrismaClient()) {
 if (!clients.includes(client)) clients.push(client)
 const mocks = {
  '@/platform/database/prisma': {db: wrap(client)},
  '@/platform/observability/logger': {logEvent: () => {}},
  '@/modules/billing/server/gateways': {maskSecret: value => value},
  '@/extensions/server/runtime': {emitExtensionEvent: async () => {}},
  '@/modules/notifications/server/inbox': {invoicePaidEvent: async () => {}},
  '@/modules/sms/server/sms': {notifyAdmins: async () => {}},
  '@/modules/referrals/server/referrals': {awardReferralForInvoice: async () => {}},
 }
 const cache = new Map()
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
 return load('src/modules/billing/server/billing.ts')
}
let count = 0
async function main() {
 const one = instance(prisma), two = instance()
 // How an expired or failed payment closes its invoice: this revision's helper, or the old callers' sequence.
 const close = async (service, id) => service.voidOpenInvoice ? service.voidOpenInvoice(id, 'test') : (await service.releaseInvoiceCredit(id, 'test'), await prisma.invoice.updateMany({where: {id, status: 'UNPAID'}, data: {status: 'VOID'}}))
 const customer = async name => { const user = await prisma.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}}); await prisma.walletAccount.create({data: {userId: user.id, currency: 'IRT', balanceMinor: 0n}}); state.users.push(user.id); return user }
 // An invoice of 100,000 with 40,000 of the customer's wallet credit already reserved on it (and taken from the wallet).
 const invoice = (user, data = {}) => prisma.invoice.create({data: {number: `${seed}-${count++}`, userId: user.id, status: 'UNPAID', kind: 'BILLING', total: 100_000, totalMinor: 100_000n, currency: 'IRT', walletApplied: 40_000, walletAppliedMinor: 40_000n, ...data}})
 const wallet = async user => Number((await prisma.walletAccount.findUnique({where: {userId_currency: {userId: user.id, currency: 'IRT'}}}))?.balanceMinor || 0n)
 const status = async row => (await prisma.invoice.findUniqueOrThrow({where: {id: row.id}})).status
 const pay = (service, row) => service.markInvoicePaid({invoiceId: row.id, amount: 60_000, provider: 'TEST', providerTxnId: `${seed}-${row.id}`})
 const settleDuring = async (row, during) => {
  let reached, release; state.hold = {used: false, reached: null, released: new Promise(resolve => { release = resolve })}
  const arrived = new Promise(resolve => { reached = resolve }); state.hold.reached = reached
  const settling = pay(one, row)
  await arrived; await during(); state.hold = null; release()
  return settling
 }

 // --- a settlement that loses the invoice to a void must not report it as paid
 if (!skip('claim')) {
  const a = await customer('a'), row = await invoice(a)
  const result = await settleDuring(row, () => prisma.invoice.update({where: {id: row.id}, data: {status: 'VOID'}}))
  assert.equal(await status(row), 'VOID')
  assert.equal(result.ok, false, 'a settlement that found the invoice void is not a success (its order would be fulfilled)')
  assert.equal(await prisma.payment.count({where: {invoiceId: row.id}}), 0)
 }

 // --- an expiry closes the invoice while a payment is between reading it and claiming it
 {
  const b = await customer('b'), row = await invoice(b)
  const result = await settleDuring(row, () => close(two, row.id))
  const [final, balance] = [await status(row), await wallet(b)]
  assert.ok(!(final === 'PAID' && balance > 0), `the invoice is not both paid with the reserved credit and that credit given back (status ${final}, wallet ${balance})`)
  assert.deepEqual([final, balance, result.ok], ['VOID', 40_000, false], 'the void wins: credit back, settlement refused')
 }
 if (baseline) return console.log(`No fault shown at ${baseline}`)

 // --- one after the other
 const c = await customer('c'), late = await invoice(c)
 assert.deepEqual(await one.voidOpenInvoice(late.id, 'test'), {voided: true, released: 40_000, creditOk: true}); assert.equal(await wallet(c), 40_000)
 assert.equal((await pay(one, late)).ok, false, 'a payment arriving for a void invoice is refused')
 assert.deepEqual(await one.voidOpenInvoice(late.id, 'test'), {voided: false, released: 0, creditOk: true}); assert.equal(await wallet(c), 40_000, 'voiding twice releases once')
 const d = await customer('d'), settled = await invoice(d)
 const paid = await pay(one, settled)
 assert.deepEqual([paid.ok, paid.alreadyPaid, await status(settled)], [true, false, 'PAID'])
 assert.deepEqual(await one.voidOpenInvoice(settled.id, 'test'), {voided: false, released: 0, creditOk: true}); assert.equal(await wallet(d), 0, 'a paid invoice keeps its credit')
 assert.deepEqual([(await pay(two, settled)).ok, (await pay(two, settled)).alreadyPaid], [true, true], 'a repeated callback is still a success')
 // Both at the same instant, no hold: exactly one outcome, never both.
 for (let round = 0; round < 6; round++) {
  const e = await customer(`e${round}`), row = await invoice(e)
  const [settle] = await Promise.all([pay(one, row), two.voidOpenInvoice(row.id, 'test')])
  const [final, balance] = [await status(row), await wallet(e)]
  assert.ok((final === 'PAID' && balance === 0 && settle.ok) || (final === 'VOID' && balance === 40_000 && !settle.ok), `round ${round}: ${final}, wallet ${balance}, settle ok ${settle.ok}`)
 }

 // --- the credit release fails or never runs: the invoice stays void and the worker gives the credit back once
 const f = await customer('f'), stuck = await invoice(f)
 state.failWalletFor = f.id
 assert.deepEqual(await one.voidOpenInvoice(stuck.id, 'test'), {voided: true, released: 0, creditOk: false})
 await prisma.invoice.update({where: {id: stuck.id}, data: {updatedAt: new Date(Date.now() - 30 * 60_000)}})
 const young = await invoice(f, {status: 'VOID'})
 assert.deepEqual(await one.recoverVoidInvoiceCredit(100), {checked: 1, released: 0, failed: 1}, 'while the wallet fails the invoice is counted, not dropped'); assert.equal(await wallet(f), 0)
 state.failWalletFor = 0
 await prisma.invoice.update({where: {id: stuck.id}, data: {updatedAt: new Date(Date.now() - 30 * 60_000)}})
 assert.deepEqual(await one.recoverVoidInvoiceCredit(100), {checked: 1, released: 1, failed: 0})
 assert.equal(await wallet(f), 40_000, 'the reserved credit comes back'); assert.equal((await prisma.invoice.findUniqueOrThrow({where: {id: stuck.id}})).walletAppliedMinor, 0n)
 assert.deepEqual(await one.recoverVoidInvoiceCredit(100), {checked: 0, released: 0, failed: 0}); assert.equal(await wallet(f), 40_000, 'and only once')
 assert.equal((await prisma.invoice.findUniqueOrThrow({where: {id: young.id}})).walletAppliedMinor, 40_000n, 'an invoice voided less than ten minutes ago is left')
 console.log('PostgreSQL invoices: a lost claim is not reported as paid, an invoice is paid or void and never both (held and free races), late and repeated calls, and a credit that was not released is given back once passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  state.hold = null
  const ids = (await prisma.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(row => row.id)
  await prisma.payment.deleteMany({where: {userId: {in: ids}}}); await prisma.invoice.deleteMany({where: {userId: {in: ids}}}); await prisma.walletTx.deleteMany({where: {userId: {in: ids}}})
  await prisma.user.deleteMany({where: {id: {in: ids}}})
 } finally {await Promise.all(clients.map(client => client.$disconnect()))}
})
