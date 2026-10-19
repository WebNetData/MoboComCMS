// Real PostgreSQL: the rules the database itself holds on orders, invoices, payments, wallet rows, fulfilment jobs,
// receipts and returns (migration 20261216120000_money_state_rules). Every write here goes straight to the tables,
// the way a fault in code, a script or a hand at a console would. Fixtures are namespaced and removed.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api'), {NextRequest} = require('next/server'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `money-rules-${Date.now()}`
let count = 0

/** The write is refused by a database rule (SQLSTATE 23514) whose message matches. */
async function refused(write, pattern, label) {
 let error = null
 try { await write() } catch (caught) { error = caught }
 assert.ok(error, `${label}: the write went through`)
 const text = String(error.message)
 assert.match(text, /23514/, `${label}: refused, but not by a database rule: ${text.slice(-200)}`)
 assert.match(text, pattern, `${label}: refused by another rule: ${text.slice(-300)}`)
}

// The admin routes, with a database that answers their first read of an invoice or order from before a change:
// the page was loaded, then the customer paid (or the order was refunded), then the admin pressed the button.
const stale = {invoice: null, order: null}
const behind = (model, name) => new Proxy(model, {get: (target, key) => key === 'findUnique' ? async args => { const row = await target.findUnique(args); const was = stale[name]; return row && was && row.id === was.id ? {...row, status: was.status} : row } : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const db = new Proxy(prisma, {get: (target, key) => key === 'invoice' || key === 'order' ? behind(target[key], key) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const never = name => new Proxy({}, {get: (_, key) => async () => { throw new Error(`${name}.${String(key)} must not run here`) }})
function route(file) {
 const mocks = {
  '@/platform/database/prisma': {db},
  '@/modules/identity/server/access': {requirePerm: async () => ({id: 1, email: 'admin@example.invalid'})},
  '@/platform/audit/server': {auditAdmin: async () => {}},
  '@/modules/billing/server/gateways': {maskSecret: value => value},
  '@/platform/observability/logger': {logEvent: () => {}},
  '@/extensions/server/runtime': {emitExtensionEvent: async () => {}},
  '@/modules/notifications/server/inbox': {invoicePaidEvent: async () => {}},
  '@/modules/catalog/server/inventory': {releaseInventoryReservation: async () => {}, ensureInventoryReservation: async () => ({ok: true})},
 }
 for (const name of ['@/modules/billing/server/settle', '@/modules/wallet/server/wallet', '@/modules/identity/server/staff-guard', '@/modules/identity/server/profile-fields', '@/modules/subscriptions/server/submanage', '@/modules/providers/server/panels', '@/modules/subscriptions/server/provision', '@/modules/fulfillment/server/jobs']) mocks[name] = never(name)
 const cache = new Map()
 const load = path => {
  if (cache.has(path)) return cache.get(path).exports
  const mod = {exports: {}}; cache.set(path, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
   if (Object.hasOwn(mocks, name)) return mocks[name]
   if (name.startsWith('@/')) {const base = `src/${name.slice(2)}`; return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '/index.ts')}
   return require(name)
  }, mod, mod.exports)
  return mod.exports
 }
 return load(file)
}
const send = (handler, body, params) => handler(new NextRequest('http://localhost/api/admin/x', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)}), {params: Promise.resolve(params || {})}).then(async response => ({status: response.status, body: await response.json().catch(() => null)}))

async function main() {
 const user = await prisma.user.create({data: {email: `${seed}@example.invalid`, passwordHash: 'test-only'}})
 const order = (data = {}) => prisma.order.create({data: {userId: user.id, totalAmount: 1000, totalMinor: 1000n, currency: 'IRT', idempotencyKey: `${seed}-${count++}`, status: 'PENDING', ...data}})
 const invoice = (data = {}) => prisma.invoice.create({data: {number: `${seed}-${count++}`, userId: user.id, status: 'UNPAID', kind: 'BILLING', total: 1000, totalMinor: 1000n, currency: 'IRT', ...data}})
 const payment = (data = {}) => prisma.payment.create({data: {userId: user.id, provider: 'MANUAL', eventKey: `${seed}-${count++}`, amount: 1000, amountMinor: 1000n, currency: 'IRT', status: 'PENDING', ...data}})
 const walletTx = (data = {}) => prisma.walletTx.create({data: {userId: user.id, amount: 1000, amountMinor: 1000n, balanceAfter: 1000, balanceAfterMinor: 1000n, currency: 'IRT', type: 'TOPUP', status: 'PENDING', idempotencyKey: `${seed}-${count++}`, ...data}})
 const job = (data = {}) => prisma.fulfillmentJob.create({data: {kind: 'DELIVER_PRODUCT', dedupeKey: `${seed}-${count++}`, status: 'PENDING', ...data}})
 const move = (model, id, data) => prisma[model].update({where: {id}, data})

 // ---------------------------------------------------------------- values
 await refused(() => order({status: 'SHIPPED'}), /Order_status_check/, 'an unknown order state')
 await refused(() => order({totalMinor: -1n}), /Order_totalMinor_nonnegative/, 'a negative order total')
 await refused(() => invoice({status: 'OPEN'}), /Invoice_status_check/, 'an unknown invoice state')
 await refused(() => invoice({kind: 'GIFT'}), /Invoice_kind_check/, 'an unknown invoice kind')
 for (const field of ['subtotalMinor', 'discountMinor', 'taxMinor', 'totalMinor', 'walletAppliedMinor', 'paidAmountMinor']) await refused(() => invoice({[field]: -1n}), /Invoice_money_nonnegative/, `a negative ${field}`)
 await refused(() => payment({status: 'SETTLED'}), /Payment_status_check/, 'an unknown payment state')
 await refused(() => payment({feeMinor: -1n}), /Payment_feeMinor_nonnegative/, 'a negative fee')
 await refused(() => payment({status: 'CONFIRMED', amountMinor: -1n}), /Payment_amount_sign/, 'negative money received')
 await refused(() => payment({status: 'REFUNDED', amountMinor: 1n}), /Payment_amount_sign/, 'positive money given back')
 await refused(() => walletTx({status: 'OK'}), /WalletTx_status_check/, 'an unknown wallet state')
 await refused(() => walletTx({type: 'TEST'}), /WalletTx_type_check/, 'an unknown wallet row type')
 await refused(() => walletTx({balanceAfterMinor: -1n}), /WalletTx_balanceAfterMinor_nonnegative/, 'a negative balance after')
 await refused(() => job({status: 'RUNNING'}), /FulfillmentJob_status_check/, 'an unknown job state')
 await refused(() => job({attempts: -1}), /FulfillmentJob_attempts_nonnegative/, 'negative attempts')
 const account = await prisma.walletAccount.create({data: {userId: user.id, currency: 'IRT', balanceMinor: 500n}})
 await refused(() => prisma.walletAccount.update({where: {id: account.id}, data: {balanceMinor: {decrement: 501n}}}), /WalletAccount_balanceMinor_nonnegative/, 'spending more than the wallet holds')
 await prisma.walletAccount.update({where: {id: account.id}, data: {balanceMinor: {decrement: 500n}}})
 const held = await order({status: 'PAID'})
 const line = data => prisma.orderLine.create({data: {orderId: held.id, line: count++, name: 'item', quantity: 1, unitPriceMinor: 1000n, totalMinor: 1000n, ...data}})
 await refused(() => line({quantity: 0}), /OrderLine_quantity_positive/, 'a line of nothing')
 await refused(() => line({totalMinor: -1n}), /OrderLine_money_nonnegative/, 'a negative line total')
 await refused(() => line({sellerStatus: 'LOST'}), /OrderLine_sellerStatus_check/, 'an unknown seller state')
 await line({sellerStatus: 'ACCEPTED'})
 const billed = await invoice()
 const receipt = (data = {}) => prisma.paymentReceipt.create({data: {invoiceId: billed.id, userId: user.id, ...data}})
 await refused(() => receipt({status: 'SEEN'}), /PaymentReceipt_status_check/, 'an unknown receipt state')
 await refused(() => receipt({amountMinor: -1n}), /PaymentReceipt_amountMinor_nonnegative/, 'a negative receipt')
 const request = (data = {}) => prisma.returnRequest.create({data: {number: `${seed}-${count++}`, orderId: held.id, userId: user.id, kind: 'RETURN', requestedMinor: 1000n, currency: 'IRT', ...data}})
 await refused(() => request({status: 'OPEN'}), /ReturnRequest_status_check/, 'an unknown return state')
 await refused(() => request({kind: 'SWAP'}), /ReturnRequest_kind_check/, 'an unknown return kind')
 await refused(() => request({refundMinor: -1n}), /ReturnRequest_money_nonnegative/, 'a negative refund')

 // ---------------------------------------------------------------- invoice
 for (const from of ['DRAFT', 'UNPAID']) { const row = await invoice({status: from}); await move('invoice', row.id, {status: 'PAID', paidAmountMinor: 1000n}) }
 for (const [from, to] of [['DRAFT', 'UNPAID'], ['UNPAID', 'DRAFT'], ['UNPAID', 'VOID'], ['DRAFT', 'VOID'], ['VOID', 'UNPAID'], ['VOID', 'DRAFT']]) { const row = await invoice({status: from}); await move('invoice', row.id, {status: to}) }
 const paid = await invoice({status: 'PAID', paidAmountMinor: 1000n})
 for (const to of ['UNPAID', 'DRAFT', 'VOID']) await refused(() => move('invoice', paid.id, {status: to}), /a paid invoice can only be refunded/, `PAID -> ${to}`)
 await refused(() => move('invoice', paid.id, {totalMinor: 1n}), /amounts of a paid invoice do not change/, 'the total of a paid invoice')
 await refused(() => move('invoice', paid.id, {paidAmountMinor: 1n}), /amounts of a paid invoice do not change/, 'what a paid invoice was paid')
 await refused(() => move('invoice', paid.id, {currency: 'USD'}), /amounts of a paid invoice do not change/, 'the currency of a paid invoice')
 await move('invoice', paid.id, {notes: 'a note on a paid invoice is still a note', walletAppliedMinor: 0n})
 await move('invoice', paid.id, {status: 'PAID'})
 const voided = await invoice({status: 'VOID'})
 await refused(() => move('invoice', voided.id, {status: 'PAID'}), /only an open invoice is paid/, 'VOID -> PAID')
 await refused(() => move('invoice', voided.id, {status: 'REFUNDED'}), /only a paid invoice is refunded/, 'VOID -> REFUNDED')
 await refused(() => move('invoice', billed.id, {status: 'REFUNDED'}), /only a paid invoice is refunded/, 'UNPAID -> REFUNDED')
 await move('invoice', paid.id, {status: 'REFUNDED'})
 for (const to of ['PAID', 'UNPAID', 'VOID', 'DRAFT']) await refused(() => move('invoice', paid.id, {status: to}), /a refunded invoice is closed/, `REFUNDED -> ${to}`)
 await refused(() => move('invoice', paid.id, {totalMinor: 1n}), /amounts of a paid invoice do not change/, 'the total of a refunded invoice')
 // A claim that finds nothing changes nothing and is not an error: how the code asks.
 assert.equal((await prisma.invoice.updateMany({where: {id: paid.id, status: {in: ['UNPAID', 'DRAFT']}}, data: {status: 'VOID'}})).count, 0)

 // ---------------------------------------------------------------- order
 for (const to of ['PAID', 'FAILED', 'EXPIRED', 'CANCELLED']) { const row = await order(); await move('order', row.id, {status: to}) }
 for (const from of ['FAILED', 'CANCELLED', 'EXPIRED']) { const row = await order({status: from}); await move('order', row.id, {status: 'PAID'}) }
 for (const to of ['PENDING', 'FAILED', 'EXPIRED']) await refused(() => move('order', held.id, {status: to}), /a paid order does not become unpaid/, `order PAID -> ${to}`)
 const cancelledPaid = await order({status: 'PAID'})
 await move('order', cancelledPaid.id, {status: 'CANCELLED'})
 await move('order', cancelledPaid.id, {status: 'REFUNDED'})
 for (const to of ['PAID', 'PENDING', 'CANCELLED', 'FAILED']) await refused(() => move('order', cancelledPaid.id, {status: to}), /a refunded order is closed/, `order REFUNDED -> ${to}`)
 await move('order', cancelledPaid.id, {paymentUrl: '/x'})

 // ---------------------------------------------------------------- payment
 const pending = await payment()
 await move('payment', pending.id, {status: 'PROCESSED'}); await move('payment', pending.id, {status: 'FAILED'}); await move('payment', pending.id, {amountMinor: 900n, status: 'CONFIRMED'})
 for (const [data, label] of [[{status: 'PENDING'}, 'state'], [{status: 'REFUNDED', amountMinor: -900n}, 'state and amount'], [{amountMinor: 1n}, 'amount'], [{currency: 'USD'}, 'currency']]) await refused(() => move('payment', pending.id, data), /a settled payment does not change/, `a confirmed payment's ${label}`)
 await move('payment', pending.id, {raw: '{"note":"the record of the provider may still be completed"}', providerTxnId: 'late'})
 const back = await payment({status: 'REFUNDED', amount: -1000, amountMinor: -1000n})
 await refused(() => move('payment', back.id, {status: 'CONFIRMED', amountMinor: 1000n}), /a settled payment does not change/, 'a refund turned into a payment')

 // ---------------------------------------------------------------- wallet ledger
 const topup = await walletTx()
 await move('walletTx', topup.id, {status: 'PROCESSING'}); await move('walletTx', topup.id, {status: 'DONE', amountMinor: 700n, balanceAfterMinor: 700n})
 for (const [data, label] of [[{status: 'PENDING'}, 'state'], [{status: 'FAILED'}, 'state'], [{amountMinor: 1n}, 'amount'], [{balanceAfterMinor: 1n}, 'balance'], [{type: 'REFUND'}, 'type'], [{currency: 'USD'}, 'currency']]) await refused(() => move('walletTx', topup.id, data), /a wallet row that moved money does not change/, `a done wallet row's ${label}`)
 await move('walletTx', topup.id, {description: 'a description may be corrected'})
 const failed = await walletTx(); await move('walletTx', failed.id, {status: 'FAILED'})

 // ---------------------------------------------------------------- fulfilment job
 const work = await job()
 await move('fulfillmentJob', work.id, {status: 'PROCESSING'}); await move('fulfillmentJob', work.id, {status: 'FAILED'}); await move('fulfillmentJob', work.id, {status: 'PROCESSING'}); await move('fulfillmentJob', work.id, {status: 'DONE'})
 for (const to of ['PENDING', 'PROCESSING', 'FAILED']) await refused(() => move('fulfillmentJob', work.id, {status: to}), /a finished job does not run again/, `job DONE -> ${to}`)
 await move('fulfillmentJob', work.id, {payload: '{"applied":true}'})

 // ---------------------------------------------------------------- receipt
 const slip = await receipt()
 await move('paymentReceipt', slip.id, {status: 'APPROVED'}); await move('paymentReceipt', slip.id, {status: 'PENDING'})
 await move('paymentReceipt', slip.id, {status: 'APPROVED'})
 await refused(() => move('paymentReceipt', slip.id, {status: 'REJECTED'}), /only a waiting receipt is rejected/, 'an approved receipt rejected')
 await move('paymentReceipt', slip.id, {status: 'PENDING'}); await move('paymentReceipt', slip.id, {status: 'REJECTED'})
 for (const to of ['PENDING', 'APPROVED']) await refused(() => move('paymentReceipt', slip.id, {status: to}), /a rejected receipt is closed/, `receipt REJECTED -> ${to}`)

 // ---------------------------------------------------------------- return
 for (const final of ['REJECTED', 'WITHDRAWN']) {
  const row = await request(); await move('returnRequest', row.id, {status: final})
  for (const to of ['REQUESTED', 'APPROVED', 'REFUNDED']) await refused(() => move('returnRequest', row.id, {status: to}), /a decided request is closed/, `return ${final} -> ${to}`)
 }
 const refund = await request()
 await move('returnRequest', refund.id, {status: 'APPROVED'}); await move('returnRequest', refund.id, {status: 'REFUNDED', refundMinor: 1000n})
 // The credit failed: the claim is taken back, and made again.
 await move('returnRequest', refund.id, {status: 'APPROVED', refundMinor: 0n}); await move('returnRequest', refund.id, {status: 'REFUNDED', refundMinor: 1000n})
 await move('returnRequest', refund.id, {walletTxId: topup.id})
 for (const [data, label] of [[{status: 'APPROVED'}, 'state'], [{status: 'REQUESTED', refundMinor: 0n}, 'state and amount']]) await refused(() => move('returnRequest', refund.id, data), /a refund that was paid is not taken back/, `a paid refund's ${label}`)
 await refused(() => move('returnRequest', refund.id, {refundMinor: 1n}), /amount of a paid refund does not change/, 'the amount of a paid refund')
 await refused(() => move('returnRequest', refund.id, {walletTxId: null}), /amount of a paid refund does not change/, 'a paid refund unlinked from its wallet row')
 await move('returnRequest', refund.id, {restocked: true})

 // ---------------------------------------------------------------- admin routes on a page that is behind
 const invoices = route('src/modules/billing/server/http/admin/invoices/route.ts'), orders = route('src/modules/orders/server/http/admin/orders/route.ts'), customer = route('src/modules/identity/server/http/admin/users/[id]/route.ts')
 const statusOf = async (model, id) => (await prisma[model].findUniqueOrThrow({where: {id}})).status
 const paidSince = async () => { const row = await invoice({status: 'PAID', paidAmountMinor: 1000n}); stale.invoice = {id: row.id, status: 'UNPAID'}; return row }
 // The invoice page: void, reopen, re-price.
 for (const [body, label] of [[{action: 'void'}, 'void'], [{status: 'UNPAID'}, 'reopen'], [{status: 'VOID'}, 'mark void'], [{status: 'DRAFT'}, 'back to draft'], [{discount: '10'}, 're-price']]) {
  const row = await paidSince()
  const answer = await send(invoices.PATCH, {id: row.id, ...body})
  assert.equal(answer.status, 409, `invoice page, ${label}: ${JSON.stringify(answer)}`)
  const after = await prisma.invoice.findUniqueOrThrow({where: {id: row.id}})
  assert.deepEqual([after.status, after.totalMinor, after.paidAmountMinor], ['PAID', 1000n, 1000n], `invoice page, ${label}: the paid invoice was touched`)
 }
 // Without the stale read the page says the same, from its own check.
 stale.invoice = null
 const settled = await invoice({status: 'PAID', paidAmountMinor: 1000n})
 for (const body of [{status: 'UNPAID'}, {discount: '10'}]) assert.equal((await send(invoices.PATCH, {id: settled.id, ...body})).status, 409)
 assert.equal((await send(invoices.PATCH, {id: settled.id, notes: 'called the customer'})).status, 200, 'a note on a paid invoice is saved')
 assert.equal((await prisma.invoice.findUniqueOrThrow({where: {id: settled.id}})).notes, 'called the customer')
 const open = await invoice()
 assert.equal((await send(invoices.PATCH, {id: open.id, status: 'DRAFT', discount: '100'})).status, 200, 'an open invoice is still edited')
 assert.deepEqual(await prisma.invoice.findUniqueOrThrow({where: {id: open.id}}).then(row => [row.status, row.discountMinor]), ['DRAFT', 100n])
 // The customer page: void, unpaid, refund.
 for (const change of ['void', 'unpaid']) {
  const row = await paidSince()
  const answer = await send(customer.POST, {action: 'invoice', invoiceId: row.id, invoiceAction: change}, {id: String(user.id)})
  assert.equal(answer.status, 409, `customer page, ${change}: ${JSON.stringify(answer)}`)
  assert.equal(await statusOf('invoice', row.id), 'PAID')
 }
 const refundedSince = await invoice({status: 'PAID', paidAmountMinor: 1000n}); await move('invoice', refundedSince.id, {status: 'REFUNDED'})
 stale.invoice = {id: refundedSince.id, status: 'PAID'}
 const twice = await send(customer.POST, {action: 'invoice', invoiceId: refundedSince.id, invoiceAction: 'refund'}, {id: String(user.id)})
 assert.equal(twice.status, 409, `customer page, a second refund: ${JSON.stringify(twice)}`)
 assert.equal(await prisma.payment.count({where: {invoiceId: refundedSince.id}}), 0, 'a second refund records no payment')
 stale.invoice = null
 // The orders page: an order refunded meanwhile is not cancelled over the refund.
 const closed = await order({status: 'PAID'}); await move('order', closed.id, {status: 'REFUNDED'})
 stale.order = {id: closed.id, status: 'PAID'}
 assert.equal((await send(orders.PATCH, {id: closed.id, action: 'cancel'})).status, 409)
 assert.equal(await statusOf('order', closed.id), 'REFUNDED')
 stale.order = null
 const waiting = await order()
 assert.equal((await send(orders.PATCH, {id: waiting.id, action: 'cancel'})).status, 200)
 assert.equal(await statusOf('order', waiting.id), 'CANCELLED')

 console.log('PostgreSQL money rules: unknown states and negative money are refused; paid invoices and orders, settled payments, done wallet rows, finished jobs, rejected receipts and paid refunds stay as they are; every legal move still goes through; an admin page that is behind answers 409 and changes nothing')
}

main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await prisma.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(row => row.id)
  await prisma.fulfillmentJob.deleteMany({where: {dedupeKey: {startsWith: seed}}})
  await prisma.returnRequest.deleteMany({where: {userId: {in: ids}}}); await prisma.paymentReceipt.deleteMany({where: {userId: {in: ids}}})
  await prisma.payment.deleteMany({where: {userId: {in: ids}}}); await prisma.invoice.deleteMany({where: {userId: {in: ids}}})
  await prisma.walletTx.deleteMany({where: {userId: {in: ids}}}); await prisma.order.deleteMany({where: {userId: {in: ids}}})
  await prisma.user.deleteMany({where: {id: {in: ids}}})
 } finally {await prisma.$disconnect()}
})
