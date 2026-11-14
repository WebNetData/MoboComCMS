// A repair invoiced at the shop counter (owner 2026-11-13), through the actual Store and Forms owners against disposable
// PostgreSQL rows: who may invoice a repair, the paid sale with a stock part, work and a bought-in part, the link to the
// repair, one paid invoice per repair, and handing the device back only with it (or a manager's recorded reason).
const assert = require('node:assert/strict')
const { randomUUID, randomBytes } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')

assert(/test|check|store_experiences_/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable database required')
process.env.STORE_DELIVERY_KEY = randomBytes(32).toString('hex')
const db = new PrismaClient(), stamp = `repair-${Date.now().toString(36)}`
const users = [], roles = [], products = [], forms = [], sessions = [], orders = [], places = []
let viewer, shelfId
class SmsError extends Error {}
const sourceLoader = require('./connected-source-loader.cjs')
const mocks = {
  '@/platform/database/prisma': { db },
  'next-auth/jwt': { getToken: async () => viewer ? { uid: viewer.id, authAt: new Date().toISOString() } : null },
  '@/extensions/server/modules': { moduleGuard: async () => null, isModuleEnabled: async () => true },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }), clientIp: () => '127.0.0.1' },
  '@/modules/sms/server/sms': { notifyPhone: async () => {}, siteLink: async (route) => `http://site.invalid${route}`, requestOtp: async () => ({}), verifyOtp: async () => {}, SmsError },
  react: { ...require('react'), cache: (fn) => fn },
}
const load = sourceLoader(mocks)
const auditFault = { enabled: false }
const auditMock = {
  auditAdmin: async () => undefined,
  auditAdminStrict: async (input, client) => {
    const row = await client.auditLog.create({ data: { actorUserId: input.actor.id, actorEmail: input.actor.email, action: input.action, targetType: input.targetType, targetId: String(input.targetId ?? ''), requestId: stamp, ip: '127.0.0.1', metadata: JSON.stringify(input.metadata || {}) } })
    if (auditFault.enabled) throw Error('strict audit fault')
    return row
  },
}
const loadAuditFailure = sourceLoader({ ...mocks, '@/platform/audit/server': auditMock })
const definitions = load('src/modules/forms/domain/forms.ts')
const service = load('src/modules/forms/server/service.ts')
const counterApi = load('src/modules/store/server/http/counter-sales.ts')
const answersApi = load('src/modules/site/server/http/admin/forms/submissions/route.ts')
const answersApiAuditFailure = loadAuditFailure('src/modules/site/server/http/admin/forms/submissions/route.ts')
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
async function attachOrder(submissionId, orderId) {
  const response = await answersApi.PATCH(new NextRequest('http://site.invalid/api/admin/forms/submissions', { method: 'PATCH', headers: { Origin: 'http://site.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: submissionId, attachPaidServiceOrder: true, orderId }) }))
  return { status: response.status, body: await response.json() }
}
async function attachOrderWithAuditFailure(submissionId, orderId) {
  const response = await answersApiAuditFailure.PATCH(new NextRequest('http://site.invalid/api/admin/forms/submissions', { method: 'PATCH', headers: { Origin: 'http://site.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: submissionId, attachPaidServiceOrder: true, orderId }) }))
  return { status: response.status, body: await response.json() }
}
async function paidMixedOrder(customerId, serviceId, goodsId, { status = 'PAID', invoiceStatus = 'PAID', includeGoods = true, customerPhone = '' } = {}) {
  const lines = [{ line: 0, productId: serviceId, name: 'نصب سیستم‌عامل', kind: 'VIRTUAL', quantity: 1, unitPriceMinor: 1000n, totalMinor: 1000n, currency: 'IRT' }]
  let total = 1000n
  if (includeGoods) { lines.push({ line: 1, productId: goodsId, name: 'SSD', kind: 'PHYSICAL', quantity: 1, unitPriceMinor: 2000n, totalMinor: 2000n, currency: 'IRT' }); total += 2000n }
  const order = await db.order.create({ data: { userId: customerId, customerPhone, productId: goodsId, status, totalAmount: Number(total), totalMinor: total, currency: 'IRT', meta: JSON.stringify({ kind: 'product', serviceProductIds: [serviceId] }), lines: { create: lines } } })
  orders.push(order.id)
  await db.invoice.create({ data: { number: `INV-${stamp}-${order.id}`, userId: customerId, orderId: order.id, subtotal: Number(total), subtotalMinor: total, total: Number(total), totalMinor: total, currency: 'IRT', status: invoiceStatus } })
  return order.id
}
const sale = (who, submissionId, lines, workLines) => ({ requestId: randomUUID(), confirmed: true, packingConfirmed: true, sessionId: who.sessionId, method: 'CASH', customerName: 'علی رضایی', customerPhone: '', lines, repair: { submissionId, currency: 'IRT', work: workLines } })
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

  // Reuse an already-paid online bundle invoice for the repair without issuing another order or changing shipment state.
  const customer = await db.user.create({ data: { name: 'علی رضایی', email: `${stamp}-buyer@example.invalid`, phone: '09120000000', passwordHash: 'fixture-only' } })
  users.push(customer.id)
  const wrongCustomer = await db.user.create({ data: { name: 'مشتری دیگر', email: `${stamp}-other@example.invalid`, phone: '09121111111', passwordHash: 'fixture-only' } })
  users.push(wrongCustomer.id)
  const serviceProduct = await db.product.create({ data: { slug: `${stamp}-install`, sku: `${stamp}-install`, name: 'نصب و راه‌اندازی', kind: 'VIRTUAL', isService: true, active: true, price: 1000, priceMinor: 1000n, currency: 'IRT' } })
  const goodsProduct = await db.product.create({ data: { slug: `${stamp}-ssd-bundle`, sku: `${stamp}-ssd-bundle`, name: 'SSD همراه نصب', kind: 'PHYSICAL', active: true, price: 2000, priceMinor: 2000n, currency: 'IRT', stock: 5 } })
  products.push(serviceProduct.id, goodsProduct.id)
  const wrongOrderId = await paidMixedOrder(wrongCustomer.id, serviceProduct.id, goodsProduct.id)
  const wrongRepair = await repairRow(form.id, { userId: customer.id })
  viewer = manager
  assert.equal((await attachOrder(wrongRepair.id, wrongOrderId)).status, 403, 'a paid mixed order for another canonical user is refused')
  assert.equal((await db.formSubmission.findUniqueOrThrow({ where: { id: wrongRepair.id } })).repairOrderId, null)

  const unpaidOrderId = await paidMixedOrder(customer.id, serviceProduct.id, goodsProduct.id, { invoiceStatus: 'UNPAID' })
  const unpaidRepair = await repairRow(form.id, { userId: customer.id })
  assert.equal((await attachOrder(unpaidRepair.id, unpaidOrderId)).status, 404, 'an unpaid invoice is refused')

  const goodsOnlyOrderId = await paidMixedOrder(customer.id, serviceProduct.id, goodsProduct.id, { includeGoods: false })
  const goodsOnlyRepair = await repairRow(form.id, { userId: customer.id })
  assert.equal((await attachOrder(goodsOnlyRepair.id, goodsOnlyOrderId)).status, 409, 'a service-only order is not a goods+service bundle')

  const mixedOrderId = await paidMixedOrder(customer.id, serviceProduct.id, goodsProduct.id)
  const formsOnlyRepair = await repairRow(form.id, { userId: customer.id })
  viewer = handler
  assert.equal((await attachOrder(formsOnlyRepair.id, mixedOrderId)).status, 403, 'forms handlers also need orders.manage to attach a Store invoice')
  assert.equal((await db.formSubmission.findUniqueOrThrow({ where: { id: formsOnlyRepair.id } })).repairOrderId, null)
  const mixedRepair = await repairRow(form.id, { userId: customer.id })
  viewer = manager
  const attached = await attachOrder(mixedRepair.id, mixedOrderId)
  assert.equal(attached.status, 200, JSON.stringify(attached.body))
  assert.equal(attached.body.orderId, mixedOrderId)
  assert.equal((await db.formSubmission.findUniqueOrThrow({ where: { id: mixedRepair.id } })).repairOrderId, mixedOrderId)
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: mixedOrderId } })).status, 'PAID', 'linking does not change Store order or shipment state')
  assert.equal(await db.auditLog.count({ where: { action: 'forms.repair_order.attach', targetId: String(mixedRepair.id), actorUserId: manager.id } }), 1, 'the cross-domain link is strictly audited in its transaction')
  const duplicateRepair = await repairRow(form.id, { userId: customer.id })
  assert.equal((await attachOrder(duplicateRepair.id, mixedOrderId)).status, 409, 'one Store invoice cannot be attached to two repairs')
  assert.equal(await db.invoice.count({ where: { orderId: mixedOrderId } }), 1, 'linking reuses the existing single invoice')
  const guestOrderId = await paidMixedOrder(customer.id, serviceProduct.id, goodsProduct.id)
  const guestRepair = await repairRow(form.id, { userId: null })
  assert.equal((await attachOrder(guestRepair.id, guestOrderId)).status, 200, 'a guest repair may match only through the normalized customer mobile')
  const faultOrderId = await paidMixedOrder(customer.id, serviceProduct.id, goodsProduct.id)
  const faultRepair = await repairRow(form.id, { userId: customer.id })
  auditFault.enabled = true
  await assert.rejects(attachOrderWithAuditFailure(faultRepair.id, faultOrderId), /strict audit fault/)
  auditFault.enabled = false
  assert.equal((await db.formSubmission.findUniqueOrThrow({ where: { id: faultRepair.id } })).repairOrderId, null, 'audit failure rolls back the repair link')
  assert.equal(await db.auditLog.count({ where: { action: 'forms.repair_order.attach', targetId: String(faultRepair.id) } }), 0, 'audit failure rolls back the strict audit row')
  console.log('PASS Repair invoice: counter sale, repair eligibility and handover gates, plus audited attachment of an existing paid mixed goods/service order with canonical/normalized-mobile customer matching, permission/payment/content/uniqueness refusals, and unchanged Store shipment state')
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
