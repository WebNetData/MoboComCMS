// Exercises the real Mellat browser callback and PostgreSQL settlement path.
// The only provider boundary replaced is SOAP fetch to the configured Mellat URL.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const seed = `mellat-callback-${Date.now()}`
const users = [], products = [], orders = [], invoices = [], eventKeys = [], refs = []
const endpoint = 'https://mellat-callback.test/soap'
const oldFetch = global.fetch
const oldEndpoint = process.env.MELLAT_API_URL
process.env.MELLAT_API_URL = endpoint
const state = { calls: [], replies: [], verifyGate: null }

function soapReply(code) { return new Response(`<Envelope><Body><return>${code}</return></Body></Envelope>`, { status: 200 }) }
global.fetch = async (url, options = {}) => {
  assert.equal(String(url), endpoint, `unexpected network request: ${String(url)}`)
  const body = String(options.body || '')
  const method = body.match(/<int:(bp[A-Za-z]+Request)>/)?.[1]
  assert.ok(method, `unknown SOAP request: ${body.slice(0, 300)}`)
  state.calls.push({ method, body })
  if (method === 'bpVerifyRequest' && state.verifyGate) {
    const gate = state.verifyGate
    state.verifyGate = null
    gate.entered()
    await gate.release
  }
  const reply = state.replies.shift()
  if (!reply) throw new Error(`No scripted Mellat response for ${method}`)
  if (reply.network) throw new Error(`controlled ${method} network failure`)
  return soapReply(reply.code)
}

const load = require('./connected-source-loader.cjs')({ '@/platform/database/prisma': { db: prisma } })

const callback = load('src/modules/billing/server/http/payment/mellat.ts').POST_callback
const orderIdFor = (number, suffix) => {
  const digits = String(Number(number.replace(/\D/g, '').slice(-9) || '0'))
  return `${digits}${String(suffix).padStart(6, '0').slice(-6)}`
}
let sequence = 0
async function fixture({ stock = null, status = 'UNPAID' } = {}) {
  const n = ++sequence
  const user = await prisma.user.create({ data: { email: `${seed}-${n}@example.invalid`, passwordHash: 'test-only', smsAlerts: false, emailAlerts: false, pushAlerts: false } })
  users.push(user.id)
  await prisma.walletAccount.create({ data: { userId: user.id, currency: 'IRT', balanceMinor: 900_000n } })
  let product = null
  if (stock !== null) {
    product = await prisma.product.create({ data: { slug: `${seed}-${n}`, name: `callback-fixture-${n}`, price: 12_345, priceMinor: 12_345n, currency: 'IRT', stock, approval: 'APPROVED', active: true } })
    products.push(product.id)
  }
  const gateway = await prisma.gateway.create({ data: { name: `${seed}-${n}`, provider: 'MELLAT', apiKey: 'TEST_TERMINAL', accountUser: 'TEST_USER', secretKey: 'TEST_PASSWORD', fiat: 'IRT', currencies: 'IRT', active: true } })
  const order = await prisma.order.create({ data: { userId: user.id, ...(product ? { productId: product.id } : {}), totalAmount: 12_345, totalMinor: 12_345n, currency: 'IRT', provider: 'MELLAT', gatewayId: gateway.id, status: 'PENDING', idempotencyKey: `${seed}-${n}` } })
  orders.push(order.id)
  const number = `${Date.now()}${String(n).padStart(3, '0')}`
  const refId = `MC${String(n).padStart(10, '0')}`
  refs.push(refId)
  const invoice = await prisma.invoice.create({ data: { number, userId: user.id, orderId: order.id, ...(product ? { productId: product.id } : {}), gatewayId: gateway.id, status, kind: 'BILLING', subtotal: 12_345, subtotalMinor: 12_345n, total: 12_345, totalMinor: 12_345n, currency: 'IRT', providerTxnId: refId } })
  invoices.push(invoice.id)
  const eventKey = `${Date.now()}${String(n).padStart(3, '0')}`
  eventKeys.push(eventKey)
  return { user, product, gateway, order, invoice, refId, eventKey, saleOrderId: orderIdFor(number, n), saleReferenceId: eventKey }
}
function request(row, extra = {}) {
  const form = new URLSearchParams({ RefId: row.refId, ResCode: '0', SaleOrderId: row.saleOrderId, SaleReferenceId: row.saleReferenceId, CardHolderPan: '1234-****-5678', ...extra })
  return new Request(`http://localhost:3116/api/payment/mellat/callback`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', Origin: 'http://localhost:3116' }, body: form })
}
async function post(row, extra) {
  const req = request(row, extra)
  const response = await callback({ nextUrl: new URL(req.url), headers: req.headers, formData: () => req.formData() })
  assert.equal(response.status, 303)
  return response.headers.get('location')
}
async function statuses(row) {
  const [invoice, order, payments, inbox, wallet, product, reservation] = await Promise.all([
    prisma.invoice.findUniqueOrThrow({ where: { id: row.invoice.id } }),
    prisma.order.findUniqueOrThrow({ where: { id: row.order.id } }),
    prisma.payment.findMany({ where: { invoiceId: row.invoice.id } }),
    prisma.webhookInbox.findUnique({ where: { provider_eventKey: { provider: 'MELLAT', eventKey: row.eventKey } } }),
    prisma.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: row.user.id, currency: 'IRT' } } }),
    row.product ? prisma.product.findUniqueOrThrow({ where: { id: row.product.id } }) : null,
    row.product ? prisma.inventoryReservation.findFirst({ where: { orderId: row.order.id } }) : null,
  ])
  return { invoice, order, payments, inbox, wallet, product, reservation }
}
function script(...codes) { state.replies.push(...codes.map(code => typeof code === 'object' ? code : ({ code: String(code) }))) }
function resetCalls() { state.calls.length = 0 }
function methodNames() { return state.calls.map(call => call.method) }

async function main() {
  // A closed invoice cannot be sent back to the bank for a second payment attempt.
  {
    const row = await fixture({ status: 'VOID' })
    resetCalls()
    const req = new Request(`http://localhost:3116/api/payment/mellat/start?ref=${row.refId}`, { headers: { Origin: 'http://localhost:3116' } })
    const response = await load('src/modules/billing/server/http/payment/mellat.ts').GET_start({ nextUrl: new URL(req.url), headers: req.headers })
    assert.equal(response.status, 303)
    assert.match(response.headers.get('location') || '', new RegExp(`/invoice/${row.invoice.number}$`))
    assert.deepEqual(methodNames(), [])
  }

  // Mismatched bank order reference and customer cancellation must never reach SOAP or settle.
  {
    const row = await fixture()
    resetCalls()
    await post(row, { SaleOrderId: `${row.saleOrderId}9` })
    assert.deepEqual(methodNames(), [])
    let result = await statuses(row)
    assert.deepEqual([result.invoice.status, result.order.status, result.payments.length, result.wallet.balanceMinor], ['UNPAID', 'PENDING', 0, 900_000n])
    const cancel = await fixture()
    await post(cancel, { ResCode: '17' })
    assert.deepEqual(methodNames(), [])
    result = await statuses(cancel)
    assert.deepEqual([result.invoice.status, result.order.status, result.payments.length], ['UNPAID', 'PENDING', 0])
  }

  // A dropped verify response is resolved by inquiry, then paid exactly once. Forged callback amount is ignored.
  {
    const row = await fixture()
    resetCalls(); script({ network: true }, '0', '0')
    await post(row, { Amount: '1' })
    let result = await statuses(row)
    assert.deepEqual(methodNames(), ['bpVerifyRequest', 'bpInquiryRequest', 'bpSettleRequest'])
    assert.deepEqual([result.invoice.status, result.order.status, result.payments.length, result.payments[0]?.amountMinor, result.wallet.balanceMinor, result.inbox?.status], ['PAID', 'PAID', 1, 12_345n, 900_000n, 'DONE'])
    assert.equal(result.payments[0].provider, 'MELLAT')
  }

  // Mellat's already-verified/already-settled codes are accepted as successful idempotent outcomes.
  {
    const row = await fixture()
    resetCalls(); script('43', '45')
    await post(row)
    const result = await statuses(row)
    assert.deepEqual(methodNames(), ['bpVerifyRequest', 'bpSettleRequest'])
    assert.deepEqual([result.invoice.status, result.order.status, result.payments.length, result.inbox?.status, result.wallet.balanceMinor], ['PAID', 'PAID', 1, 'DONE', 900_000n])
  }

  // The durable claim permits one worker while a second simultaneous browser post is in flight.
  {
    const row = await fixture({ stock: 2 })
    let enter, release
    const entered = new Promise(resolve => { enter = resolve })
    const blocked = new Promise(resolve => { release = resolve })
    state.verifyGate = { entered: enter, release: blocked }
    resetCalls(); script('0', '0')
    const first = post(row)
    let timer
    try {
      await Promise.race([entered, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('verify barrier was not reached')), 5_000) })])
      await post(row)
      release()
      await first
    } finally {
      clearTimeout(timer)
      release()
      state.verifyGate = null
      await first.catch(() => {})
    }
    let result = await statuses(row)
    assert.deepEqual(methodNames(), ['bpVerifyRequest', 'bpSettleRequest'])
    assert.deepEqual([result.invoice.status, result.order.status, result.payments.length, result.inbox?.status, result.inbox?.attempts, result.wallet.balanceMinor, result.product.stock, result.reservation?.status], ['PAID', 'PAID', 1, 'DONE', 1, 900_000n, 1, 'CONSUMED'])
    await post(row)
    result = await statuses(row)
    assert.deepEqual([result.payments.length, result.inbox?.attempts, result.wallet.balanceMinor, result.product.stock, result.reservation?.status], [1, 1, 900_000n, 1, 'CONSUMED'], 'a replay after completion changes no financial or inventory row')
  }

  // An ambiguous verify followed by a failed inquiry remains unpaid and retryable in the inbox.
  {
    const row = await fixture()
    resetCalls(); script({ network: true }, '55')
    await post(row)
    let result = await statuses(row)
    assert.deepEqual(methodNames(), ['bpVerifyRequest', 'bpInquiryRequest'])
    assert.deepEqual([result.invoice.status, result.order.status, result.payments.length, result.inbox?.status, result.inbox?.attempts, result.wallet.balanceMinor], ['UNPAID', 'PENDING', 0, 'FAILED', 1, 900_000n])
    resetCalls(); script('0', '0')
    await post(row)
    result = await statuses(row)
    assert.deepEqual(methodNames(), ['bpVerifyRequest', 'bpSettleRequest'])
    assert.deepEqual([result.invoice.status, result.order.status, result.payments.length, result.inbox?.status, result.inbox?.attempts], ['PAID', 'PAID', 1, 'DONE', 2])
  }

  // If verify and inquiry both lose their replies, the state is reported as unconfirmed (not as a timeout refund).
  {
    const row = await fixture()
    resetCalls(); script({ network: true }, { network: true })
    const destination = await post(row)
    const reason = new URL(destination).searchParams.get('reason')
    const expected = 'ارتباط با بانک ملت برقرار نشد — وضعیت پرداخت از سوی بانک تأیید نشد؛ فاکتور و حساب خود را بررسی کنید و با پشتیبانی تماس بگیرید.'
    assert.equal(reason, expected)
    let result = await statuses(row)
    assert.deepEqual([methodNames(), result.invoice.status, result.order.status, result.payments.length, result.inbox?.status, result.wallet.balanceMinor], [['bpVerifyRequest', 'bpInquiryRequest'], 'UNPAID', 'PENDING', 0, 'FAILED', 900_000n])
    resetCalls(); script('0', '0')
    await post(row)
    result = await statuses(row)
    assert.deepEqual([result.invoice.status, result.order.status, result.payments.length, result.inbox?.status, result.inbox?.attempts], ['PAID', 'PAID', 1, 'DONE', 2])
  }

  // Exhausted stock refuses local settlement; only confirmed 0/48 reversal outcomes get confirmed copy.
  for (const reversal of [{ code: '0', confirmed: true }, { code: '48', confirmed: true }, { code: '55', confirmed: false }, { network: true, confirmed: false }]) {
    const row = await fixture({ stock: 0 })
    resetCalls(); script('0', reversal)
    const destination = await post(row)
    const reason = new URL(destination).searchParams.get('reason')
    const expectedMessage = reversal.confirmed
      ? 'برگشت تراکنش از سوی بانک تأیید شد.'
      : 'برگشت تراکنش از سوی بانک تأیید نشد؛ وضعیت فاکتور و حساب خود را بررسی کنید و با پشتیبانی تماس بگیرید.'
    assert.equal(reason, `سفارش ثبت نشد (out of stock). ${expectedMessage}`)
    const result = await statuses(row)
    assert.deepEqual(methodNames(), ['bpVerifyRequest', 'bpReversalRequest'])
    assert.deepEqual([result.invoice.status, result.order.status, result.payments.length, result.product.stock, result.inbox?.status, result.inbox?.attempts, result.wallet.balanceMinor], ['UNPAID', 'PENDING', 0, 0, 'FAILED', 1, 900_000n])
  }

  console.log('PostgreSQL Mellat callback: invalid/cancelled returns, verify→inquiry recovery, durable concurrent/replayed claim, retryable failed verification, and settlement refusal with unconfirmed reversal passed')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    state.verifyGate = null
    await prisma.webhookInbox.deleteMany({ where: { provider: 'MELLAT', eventKey: { in: eventKeys } } })
    if (refs.length) await prisma.webhookLog.deleteMany({ where: { source: 'mellat', OR: refs.map(refId => ({ payload: { contains: refId } })) } })
    await prisma.fulfillmentJob.deleteMany({ where: { orderId: { in: orders } } })
    await prisma.inventoryReservation.deleteMany({ where: { orderId: { in: orders } } })
    await prisma.productDelivery.deleteMany({ where: { orderId: { in: orders } } })
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoices } } })
    await prisma.invoice.deleteMany({ where: { id: { in: invoices } } })
    await prisma.order.deleteMany({ where: { id: { in: orders } } })
    await prisma.product.deleteMany({ where: { id: { in: products } } })
    await prisma.walletAccount.deleteMany({ where: { userId: { in: users } } })
    await prisma.walletTx.deleteMany({ where: { userId: { in: users } } })
    await prisma.gateway.deleteMany({ where: { name: { startsWith: seed } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  } finally {
    global.fetch = oldFetch
    if (oldEndpoint === undefined) delete process.env.MELLAT_API_URL
    else process.env.MELLAT_API_URL = oldEndpoint
    await prisma.$disconnect()
  }
})
