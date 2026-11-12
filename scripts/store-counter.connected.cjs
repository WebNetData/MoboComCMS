const assert = require('node:assert/strict')
const { randomUUID, randomBytes } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')

assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable database required')
process.env.STORE_DELIVERY_KEY = randomBytes(32).toString('hex')
const db = new PrismaClient(), stamp = `counter-${Date.now().toString(36)}`
const users = [], roles = [], products = []
let viewer, moduleOn = true, failAudit = false, failPayment = false, failCode = false
db.$use(async (params, next) => {
  if (failPayment && params.model === 'Payment' && params.action === 'create') throw new Error('injected payment failure')
  const result = await next(params)
  if (failCode && params.model === 'ProductDigitalCode' && params.action === 'updateMany' && params.args.data.orderId) throw new Error('injected code failure')
  return result
})
let realAudit
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  'next-auth/jwt': { getToken: async () => viewer ? { uid: viewer.id, authAt: new Date().toISOString() } : null },
  '@/extensions/server/modules': { moduleGuard: async () => moduleOn ? null : Response.json({ error: 'off' }, { status: 404 }), isModuleEnabled: async () => moduleOn },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }) },
  '@/platform/audit/server': { auditAdminStrict: async (input, tx) => { if (failAudit && input.action === 'store.counter.sale') throw new Error('injected audit failure'); return realAudit.auditAdminStrict(input, tx) } },
  react: { ...require('react'), cache: (fn) => fn },
})
realAudit = load('src/platform/audit/server.ts')
const api = load('src/modules/store/server/http/counter-sales.ts')
const inventory = load('src/modules/catalog/server/inventory.ts')
const codes = load('src/modules/store/server/digital-codes.ts')
const digital = load('src/modules/catalog/server/digital-delivery.ts')
const stock = load('src/modules/catalog/server/code-stock.ts')
const orderOwner = load('src/modules/store/server/orders.ts')

async function user(label, permissions, role = 'ADMIN') {
  const assigned = permissions ? await db.role.create({ data: { name: `${stamp}-${label}`, permissions } }) : null
  if (assigned) roles.push(assigned.id)
  const row = await db.user.create({ data: { name: label, email: `${stamp}-${label}@example.invalid`, role, roleId: assigned?.id || null, passwordHash: 'fixture-only' } })
  users.push(row.id)
  return row
}
async function product(label, kind, stockCount = 5) {
  const row = await db.product.create({ data: { slug: `${stamp}-${label}`, sku: `${stamp}-${label}`, name: label, kind, active: true, price: 1000, priceMinor: 1000n, currency: 'IRT', stock: stockCount, digitalMode: kind === 'VIRTUAL' ? 'CODES' : 'MANUAL' } })
  products.push(row.id)
  return row
}
async function fill(productId, count, variantId = null) {
  for (let index = 0; index < count; index++) await db.productDigitalCode.create({ data: { productId, variantId, secret: digital.encryptDigitalDelivery(`${stamp}-gift-${productId}-${index}`), fingerprint: randomUUID() } })
  await db.$transaction((tx) => stock.syncCodeStock(tx, productId))
}
const line = (productId, quantity = 1, variantId = null) => ({ productId, quantity, variantId, expectedUnitMinor: '1000', inputs: {} })
const request = (lines, extra = {}) => ({ requestId: randomUUID(), confirmed: true, method: 'CASH', customerName: 'مشتری حضوری', customerPhone: '09123456789', lines, ...extra })
async function call(method, query = '', body) {
  const response = await api[method === 'GET' ? 'GET_counter' : 'POST_counter'](new NextRequest(`http://site.invalid/api/admin/store/counter${query}`, { method, headers: { Origin: 'http://site.invalid', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }))
  return { status: response.status, body: await response.json() }
}

async function main() {
  const manager = await user('manager', 'dashboard.view,orders.manage')
  const specialist = await user('specialist', 'dashboard.view,store.orders.handle')
  const customer = await user('buyer', null, 'USER')
  const gift = await product('gift', 'VIRTUAL'), physical = await product('physical', 'PHYSICAL', 10)
  await fill(gift.id, 8)
  viewer = manager
  const selection = await call('GET')
  assert.equal(selection.status, 200)
  assert.ok(!JSON.stringify(selection.body).includes(`${stamp}-gift-`), 'product search reveals no codes')
  const sale = request([line(gift.id, 2), line(physical.id, 3)])
  const created = await call('POST', '', sale)
  assert.equal(created.status, 200, JSON.stringify(created.body))
  const id = created.body.orderId
  const order = await db.order.findUniqueOrThrow({ where: { id }, include: { invoice: true, payments: true, productDelivery: true } })
  assert.equal(order.userId, null)
  assert.equal(order.createdById, manager.id)
  assert.equal(order.saleSource, 'COUNTER')
  assert.equal(order.totalMinor, 5000n)
  assert.equal(order.status, 'PAID')
  assert.equal(order.invoice.userId, null)
  assert.equal(order.invoice.saleSource, 'COUNTER')
  assert.equal(order.invoice.status, 'PAID')
  assert.equal(order.payments.length, 1)
  assert.equal(order.payments[0].amountMinor, 5000n)
  assert.equal(order.productDelivery.status, 'DELIVERED')
  assert.equal(await db.productDigitalCode.count({ where: { orderId: id } }), 2)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: gift.id } })).stock, 6)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: physical.id } })).stock, 7)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: physical.id } })).soldCount, 3)
  assert.equal(await db.inventoryReservation.count({ where: { orderId: id, status: 'CONSUMED' } }), 2)
  assert.equal(await db.auditLog.count({ where: { action: 'store.counter.sale', targetId: String(id) } }), 1)
  const replay = await call('POST', '', sale)
  assert.equal(replay.body.orderId, id)
  assert.equal(replay.body.replayed, true)
  assert.equal((await call('POST', '', { ...sale, customerName: 'changed' })).status, 409)
  assert.equal((await call('GET', `?request=${sale.requestId}`)).body.orderId, id)
  for (let attempt = 0; attempt < 2; attempt++) {
    const printed = await call('GET', `?order=${id}`)
    assert.equal(printed.status, 200)
    assert.equal(printed.body.receipt.cards.length, 2)
    assert.ok(printed.body.receipt.cards[0].items[0].value.startsWith(`${stamp}-gift-`))
  }
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: gift.id } })).stock, 6, 'reprinting takes no code')
  assert.equal((await orderOwner.adminOrder(id)).customer.name, 'مشتری حضوری')
  assert.ok((await orderOwner.adminOrders({ q: '09123456789' })).orders.some((row) => row.id === id), 'guest snapshots are searchable')
  const linked = await call('POST', '', request([line(gift.id)], { customerId: customer.id, method: 'CARD', reference: 'TEST-REF' }))
  assert.equal(linked.status, 200)
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: linked.body.orderId } })).userId, customer.id)
  assert.equal((await codes.buyerCodes(customer.id, linked.body.orderId)).length, 1)
  await assert.rejects(db.invoice.create({ data: { number: `${stamp}-wrong-buyer`, orderId: linked.body.orderId, userId: null, saleSource: 'COUNTER', subtotalMinor: 1n, totalMinor: 1n } }), /counter invoice must belong to the same counter buyer/)

  for (const [kind, setFailure] of [['audit', (value) => { failAudit = value }], ['payment', (value) => { failPayment = value }], ['code', (value) => { failCode = value }]]) {
    const before = await db.product.findUniqueOrThrow({ where: { id: gift.id } })
    const failed = request([line(gift.id)])
    setFailure(true)
    try { await assert.rejects(call('POST', '', failed), new RegExp(`injected ${kind} failure`)) } finally { setFailure(false) }
    assert.equal(await db.order.count({ where: { idempotencyKey: `counter:${manager.id}:${failed.requestId}` } }), 0)
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: gift.id } })).stock, before.stock)
  }
  const sameKey = request([line(physical.id)])
  const duplicates = await Promise.all([call('POST', '', sameKey), call('POST', '', sameKey)])
  assert.ok(duplicates.every((result) => result.status === 200))
  assert.equal(duplicates[0].body.orderId, duplicates[1].body.orderId)
  const last = await product('last', 'PHYSICAL', 1)
  const racing = await Promise.all([call('POST', '', request([line(last.id)])), call('POST', '', request([line(last.id)]))])
  assert.deepEqual(racing.map((result) => result.status).sort(), [200, 409])
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: last.id } })).stock, 0)
  const held = await product('held-code', 'VIRTUAL')
  await fill(held.id, 1)
  const online = await db.order.create({ data: { userId: customer.id, productId: held.id, totalAmount: 1000, totalMinor: 1000n, currency: 'IRT', lines: { create: { line: 0, productId: held.id, name: held.name, quantity: 1, unitPriceMinor: 1000n, totalMinor: 1000n, currency: 'IRT', kind: 'VIRTUAL' } } } })
  assert.equal((await inventory.reserveInventory({ orderId: online.id })).ok, true)
  assert.equal((await call('POST', '', request([line(held.id)]))).status, 409, 'online reservation owns the last code')
  await inventory.releaseInventoryReservation(online.id)
  assert.equal((await call('POST', '', request([line(held.id)]))).status, 200)

  assert.equal((await call('POST', '', request([line(physical.id)], { confirmed: false }))).status, 400)
  assert.equal((await call('POST', '', request([{ ...line(physical.id), expectedUnitMinor: '1' }]))).status, 409)
  for (const forbidden of [specialist, customer, null]) { viewer = forbidden; assert.equal((await call('POST', '', request([line(physical.id)]))).status, 403); assert.equal((await call('GET', `?order=${id}`)).status, 403) }
  viewer = manager; moduleOn = false
  assert.equal((await call('POST', '', request([line(physical.id)]))).status, 404)
  moduleOn = true
  await assert.rejects(db.order.create({ data: { userId: null, productId: physical.id, totalAmount: 1, totalMinor: 1n, currency: 'IRT' } }), /Order_counter_buyer_check/)
  console.log('PASS Store counter: guest/linked mixed sales, exact invoice/payment, stock/codes, audited reprint, replay/key conflict, same-key/last-unit races, online code hold, rollback after payment/code/audit faults, confirmation/price/permissions/module/DB guards')
}

main().finally(async () => {
  moduleOn = true; failAudit = failPayment = failCode = false
  const orders = await db.order.findMany({ where: { productId: { in: products } }, select: { id: true } })
  const ids = orders.map((row) => row.id)
  await db.payment.deleteMany({ where: { orderId: { in: ids } } })
  await db.invoice.deleteMany({ where: { orderId: { in: ids } } })
  await db.inventoryReservation.deleteMany({ where: { orderId: { in: ids } } })
  await db.orderLine.deleteMany({ where: { orderId: { in: ids } } })
  await db.orderEvent.deleteMany({ where: { orderId: { in: ids } } })
  await db.productDelivery.deleteMany({ where: { orderId: { in: ids } } })
  await db.productDigitalCode.deleteMany({ where: { productId: { in: products } } })
  await db.order.deleteMany({ where: { id: { in: ids } } })
  await db.product.deleteMany({ where: { id: { in: products } } })
  await db.auditLog.deleteMany({ where: { actorUserId: { in: users } } })
  await db.user.deleteMany({ where: { id: { in: users } } })
  await db.role.deleteMany({ where: { id: { in: roles } } })
  await db.$disconnect()
}).catch((error) => { console.error(error); process.exitCode = 1 })
