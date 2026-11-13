// A repair invoiced at the shop counter (owner 2026-11-13), through the actual Store and Forms owners against disposable
// PostgreSQL rows: who may invoice a repair, the paid sale with a stock part, work and a bought-in part, the link to the
// repair, one paid invoice per repair, and handing the device back only with it (or a manager's recorded reason).
const assert = require('node:assert/strict')
const { randomUUID, randomBytes } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')

assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable database required')
process.env.STORE_DELIVERY_KEY = randomBytes(32).toString('hex')
const db = new PrismaClient(), stamp = `repair-${Date.now().toString(36)}`
const users = [], roles = [], products = [], forms = [], sessions = [], orders = [], places = []
let viewer, shelfId
class SmsError extends Error {}
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  'next-auth/jwt': { getToken: async () => viewer ? { uid: viewer.id, authAt: new Date().toISOString() } : null },
  '@/extensions/server/modules': { moduleGuard: async () => null, isModuleEnabled: async () => true },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }), clientIp: () => '127.0.0.1' },
  '@/modules/sms/server/sms': { notifyPhone: async () => {}, siteLink: async (route) => `http://site.invalid${route}`, requestOtp: async () => ({}), verifyOtp: async () => {}, SmsError },
  react: { ...require('react'), cache: (fn) => fn },
})
const definitions = load('src/modules/forms/domain/forms.ts')
const service = load('src/modules/forms/server/service.ts')
const counterApi = load('src/modules/store/server/http/counter-sales.ts')
const answersApi = load('src/modules/site/server/http/admin/forms/submissions/route.ts')
const returns = load('src/modules/store/server/returns/counter.ts')
const stock = load('src/modules/catalog/server/locations.ts')
const balance = async (productId) => (await db.locationStock.findFirst({ where: { productId, locationId: shelfId } }))?.quantity ?? 0

async function user(label, permissions) {
  const role = permissions ? await db.role.create({ data: { name: `${stamp}-${label}`, permissions } }) : null
  if (role) roles.push(role.id)
  const row = await db.user.create({ data: { name: label, email: `${stamp}-${label}@example.invalid`, role: 'ADMIN', roleId: role?.id || null, passwordHash: 'fixture-only' } })
  users.push(row.id)
  const session = await db.storeRegisterSession.create({ data: { requestId: randomUUID(), register: `${stamp}-${label}`, cashierId: row.id, currency: 'IRT', locationId: shelfId } })
  sessions.push(session.id)
  return { ...row, sessionId: session.id }
}
async function repairRow(formId, extra = {}) {
  const answers = [{ id: 'name', label: 'نام', type: 'text', value: 'علی رضایی' }, { id: 'mobile', label: 'موبایل', type: 'mobile', value: '09120000000' }, { id: 'device', label: 'نوع دستگاه', type: 'radio', value: 'لپ‌تاپ' }, { id: 'model', label: 'مدل', type: 'text', value: 'ASUS X1504' }]
  return db.formSubmission.create({ data: { formId, data: JSON.stringify(answers), stage: 'RECEIVED', receivedAt: new Date(), pickupCode: '123456', receiptToken: randomBytes(12).toString('hex'), ...extra } })
}
async function counter(method, query = '', body) {
  const response = await counterApi[method === 'GET' ? 'GET_counter' : 'POST_counter'](new NextRequest(`http://site.invalid/api/admin/store/counter${query}`, { method, headers: { Origin: 'http://site.invalid', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }))
  return { status: response.status, body: await response.json() }
}
async function work(id, step) {
  const response = await answersApi.PATCH(new NextRequest('http://site.invalid/api/admin/forms/submissions', { method: 'PATCH', headers: { Origin: 'http://site.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ id, work: step }) }))
  return { status: response.status, body: await response.json() }
}
const sale = (who, submissionId, lines, workLines) => ({ requestId: randomUUID(), confirmed: true, sessionId: who.sessionId, method: 'CASH', customerName: 'علی رضایی', customerPhone: '', lines, repair: { submissionId, currency: 'IRT', work: workLines } })
const WORK = [{ name: 'تعویض SSD و نصب ویندوز', part: false, quantity: 1, unitMinor: '500' }, { name: 'باتری لپ‌تاپ', part: true, quantity: 1, unitMinor: '2000' }]

async function main() {
  const shelf = await db.stockLocation.create({ data: { name: `${stamp}-shop`, kind: 'SHOP', sellsOnline: false } })
  places.push(shelf.id); shelfId = shelf.id
  const manager = await user('manager')
  const handler = await user('handler', 'dashboard.view,forms.handle,instore.sell')
  const cashier = await user('cashier', 'dashboard.view,instore.sell')
  const ssd = await db.product.create({ data: { slug: `${stamp}-ssd`, sku: `${stamp}-ssd`, name: 'SSD 512', kind: 'PHYSICAL', active: true, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: 5 } })
  products.push(ssd.id)
  const home = await db.$transaction((tx) => stock.defaultLocationId(tx))
  await db.$transaction(async (tx) => { await stock.adoptEditorStock(tx, ssd.id); await stock.transferStock(tx, { productId: ssd.id, variantId: null, from: home, to: shelf.id, quantity: 4 }) })
  const template = definitions.TEMPLATES.find((item) => item.id === 'computer-repair').build()
  const form = await service.saveForm({ ...template, slug: stamp, settings: { ...template.settings, handlers: [handler.id] } })
  forms.push(form.id)
  const first = await repairRow(form.id)

  // Who may invoice: the form's handler or a forms manager; a cashier without the form may not.
  viewer = handler
  const read = await counter('GET', `?repair=${first.id}`)
  assert.equal(read.status, 200, JSON.stringify(read.body))
  assert.equal(read.body.repair.customerName, 'علی رضایی')
  assert.match(read.body.repair.device, /ASUS X1504/)
  assert.equal(read.body.repair.formId, form.id)
  viewer = cashier
  assert.equal((await counter('GET', `?repair=${first.id}`)).status, 403)
  assert.equal((await counter('POST', '', sale(cashier, first.id, [], WORK))).status, 403)

  // No paid invoice, no handover for staff.
  viewer = handler
  const early = await work(first.id, { stage: 'DONE', pickupCode: '123456' })
  assert.equal(early.status, 403, JSON.stringify(early.body))

  // The invoice: a part from stock, work and a bought-in part, paid at the register in one transaction.
  const created = await counter('POST', '', sale(handler, first.id, [{ productId: ssd.id, variantId: null, quantity: 1, expectedUnitMinor: '1000', inputs: {} }], WORK))
  assert.equal(created.status, 200, JSON.stringify(created.body))
  const orderId = created.body.orderId
  orders.push(orderId)
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { invoice: true, lines: { orderBy: { line: 'asc' } }, payments: true } })
  assert.equal(order.totalMinor, 3500n)
  assert.equal(order.productId, ssd.id)
  assert.equal(order.invoice.status, 'PAID')
  assert.equal(order.payments[0].amountMinor, 3500n)
  assert.deepEqual(order.lines.map((line) => [line.kind, line.productId, line.totalMinor]), [['PHYSICAL', ssd.id, 1000n], ['SERVICE', null, 500n], ['PART', null, 2000n]])
  assert.equal(JSON.parse(order.meta).repair.submissionId, first.id)
  assert.equal(await balance(ssd.id), 3, 'only the stock part leaves the shelf')
  assert.equal(await db.inventoryReservation.count({ where: { orderId, status: 'CONSUMED' } }), 1)
  assert.equal((await db.formSubmission.findUniqueOrThrow({ where: { id: first.id } })).repairOrderId, orderId)
  assert.equal((await db.auditLog.findFirstOrThrow({ where: { action: 'store.counter.sale', targetId: String(orderId) } })).metadata.includes(String(first.id)), true)
  const printed = await counter('GET', `?order=${orderId}`)
  assert.equal(printed.body.receipt.repair.id, first.id)
  assert.deepEqual(printed.body.receipt.lines.map((line) => line.kind), ['PHYSICAL', 'SERVICE', 'PART'])

  // One paid invoice per repair; work and bought-in parts are never returned to a shelf.
  assert.equal((await counter('GET', `?repair=${first.id}`)).status, 409)
  assert.equal((await counter('POST', '', sale(handler, first.id, [], WORK))).status, 409)
  const lookup = await returns.counterReturnLookup(order.invoice.number)
  assert.deepEqual(lookup.lines.map((line) => line.returnable), [1, 0, 0])

  // With the invoice paid, the customer's code hands the device back.
  const done = await work(first.id, { stage: 'DONE', pickupCode: '123456' })
  assert.equal(done.status, 200, JSON.stringify(done.body))
  assert.equal((await counter('GET', `?repair=${first.id}`)).status, 409, 'a finished repair takes no new invoice')

  // Work only: no stock line, still a recorded sale.
  const second = await repairRow(form.id)
  const only = await counter('POST', '', sale(handler, second.id, [], [WORK[0]]))
  assert.equal(only.status, 200, JSON.stringify(only.body))
  orders.push(only.body.orderId)
  const onlyOrder = await db.order.findUniqueOrThrow({ where: { id: only.body.orderId }, include: { product: true, lines: true } })
  assert.equal(onlyOrder.totalMinor, 500n)
  assert.equal(onlyOrder.product.slug, 'repair-work', 'a store order of work only names the inactive repair-work item')
  assert.equal(onlyOrder.product.active, false)
  assert.equal(onlyOrder.lines[0].productId, null)
  assert.equal(await db.inventoryReservation.count({ where: { orderId: onlyOrder.id } }), 0, 'work takes no stock')
  assert.equal(await db.orderEvent.count({ where: { orderId: onlyOrder.id, status: 'PAID' } }), 1)
  const again = await counter('POST', '', sale(handler, (await repairRow(form.id)).id, [], [WORK[1]]))
  assert.equal(again.status, 200, JSON.stringify(again.body))
  orders.push(again.body.orderId)
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: again.body.orderId } })).productId, onlyOrder.productId)
  assert.equal(await db.product.count({ where: { slug: 'repair-work' } }), 1)

  // Warranty or free work: only a manager hands it back without an invoice, with a recorded reason.
  const third = await repairRow(form.id)
  viewer = manager
  assert.equal((await work(third.id, { stage: 'DONE', pickupCode: '123456' })).status, 403)
  const free = await work(third.id, { stage: 'DONE', pickupCode: '123456', override: 'تعمیر در گارانتی و رایگان' })
  assert.equal(free.status, 200, JSON.stringify(free.body))
  assert.equal(await db.auditLog.count({ where: { action: 'forms.pickup_without_invoice', targetId: String(third.id) } }), 1)
  console.log('PASS Repair invoice: handler/manager access and cashier denial, stock part + work + bought-in part paid in one sale, link to the repair, receipt kinds, one paid invoice per repair, work not returnable, handover gated by the paid invoice, work-only sale recorded, manager handover without invoice audited')
}

main().finally(async () => {
  const subs = await db.formSubmission.findMany({ where: { formId: { in: forms } }, select: { id: true } })
  await db.formSubmission.updateMany({ where: { formId: { in: forms } }, data: { repairOrderId: null } })
  await db.storeTender.deleteMany({ where: { orderId: { in: orders } } })
  await db.payment.deleteMany({ where: { orderId: { in: orders } } })
  await db.invoice.deleteMany({ where: { orderId: { in: orders } } })
  await db.inventoryReservation.deleteMany({ where: { orderId: { in: orders } } })
  await db.orderLine.deleteMany({ where: { orderId: { in: orders } } })
  await db.orderEvent.deleteMany({ where: { orderId: { in: orders } } })
  await db.productDelivery.deleteMany({ where: { orderId: { in: orders } } })
  await db.order.deleteMany({ where: { id: { in: orders } } })
  await db.stockMovement.deleteMany({ where: { productId: { in: products } } })
  await db.locationStock.deleteMany({ where: { productId: { in: products } } })
  await db.product.deleteMany({ where: { OR: [{ id: { in: products } }, { slug: 'repair-work' }] } })
  await db.formSubmission.deleteMany({ where: { id: { in: subs.map((row) => row.id) } } })
  await db.siteForm.deleteMany({ where: { id: { in: forms } } })
  await db.auditLog.deleteMany({ where: { actorUserId: { in: users } } })
  await db.storeRegisterSession.deleteMany({ where: { id: { in: sessions } } })
  await db.stockLocation.deleteMany({ where: { id: { in: places } } })
  await db.user.deleteMany({ where: { id: { in: users } } })
  await db.role.deleteMany({ where: { id: { in: roles } } })
  await db.$disconnect()
}).catch((error) => { console.error(error); process.exitCode = 1 })
