const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'use a disposable PostgreSQL test database')
const stamp = `delivery-change-${Date.now()}`
const ids = { users: [], products: [], orders: [], addresses: [] }
let carrierFee = 130n
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  '@/modules/shipping/server/carriers': { checkoutCarrier: async () => ({ feeMinor: carrierFee }) },
  '@/modules/shipping/server/shipping': { getDeliverySettings: async () => ({ feeRial: 0, freeOverRial: 0 }) },
})
const service = load('src/modules/store/server/delivery-changes.ts')

async function main() {
  const manager = await db.user.create({ data: { email: `${stamp}-manager@example.invalid`, passwordHash: '!', role: 'ADMIN' } }); ids.users.push(manager.id)
  const buyer = await db.user.create({ data: { email: `${stamp}-buyer@example.invalid`, passwordHash: '!', role: 'CUSTOMER' } }); ids.users.push(buyer.id)
  const outsider = await db.user.create({ data: { email: `${stamp}-outsider@example.invalid`, passwordHash: '!', role: 'CUSTOMER' } }); ids.users.push(outsider.id)
  const product = await db.product.create({ data: { slug: stamp, name: 'Fixture product', kind: 'PHYSICAL', currency: 'IRT', priceMinor: 1000n, price: 1000, stock: 4 } }); ids.products.push(product.id)
  const [oldAddress, requestedAddress, foreignAddress] = await Promise.all([
    db.userAddress.create({ data: { userId: buyer.id, title: 'Old', recipient: 'Buyer One', mobile: '09123456789', province: 'تهران', city: 'Tehran', address: 'A sufficiently long old street', postalCode: '1345678901' } }),
    db.userAddress.create({ data: { userId: buyer.id, title: 'New', recipient: 'Buyer One', mobile: '09123456789', province: 'تهران', city: 'Tehran', address: 'A sufficiently long new street', postalCode: '1345678903' } }),
    db.userAddress.create({ data: { userId: outsider.id, title: 'Foreign', recipient: 'Other One', mobile: '09123456789', province: 'تهران', city: 'Tehran', address: 'A sufficiently long other street', postalCode: '1345678905' } }),
  ]); ids.addresses.push(oldAddress.id, requestedAddress.id, foreignAddress.id)
  const oldSnapshot = JSON.stringify({ recipient: oldAddress.recipient, phone: oldAddress.mobile, country: 'ایران', province: oldAddress.province, city: oldAddress.city, address: oldAddress.address, plaque: '', unit: '', postalCode: oldAddress.postalCode, lat: null, lng: null })
  const order = await db.order.create({ data: {
    userId: buyer.id, productId: product.id, status: 'PAID', saleSource: 'ONLINE', totalAmount: 1050, totalMinor: 1050n, currency: 'IRT',
    meta: JSON.stringify({ shippingMinor: '50', shipping: { carrierId: 'fixture' } }),
    lines: { create: { line: 0, productId: product.id, name: 'Fixture product', kind: 'PHYSICAL', quantity: 1, currency: 'IRT', unitPriceMinor: 1000n, totalMinor: 1000n } },
    productDelivery: { create: { status: 'PENDING', address: oldSnapshot } },
  } }); ids.orders.push(order.id)

  await assert.rejects(service.requestDeliveryChange({ orderId: order.id, userId: buyer.id, addressId: foreignAddress.id }), error => error.code === 'ADDRESS_NOT_FOUND')
  const created = await service.requestDeliveryChange({ orderId: order.id, userId: buyer.id, addressId: requestedAddress.id, reason: 'Please use the newer address' })
  assert.equal(created.status, 'REQUESTED')
  assert.equal(created.fromFeeMinor, '50')
  assert.equal(created.newFeeMinor, '130')
  assert.equal(created.oldAddress.address, oldAddress.address)
  assert(created.newAddress.address.includes(requestedAddress.address))
  await assert.rejects(service.requestDeliveryChange({ orderId: order.id, userId: buyer.id, addressId: oldAddress.id }), error => error.code === 'DELIVERY_CHANGE_PENDING')
  const scope = { actorId: manager.id, manager: true }
  const common = { orderId: order.id, changeId: created.id, expectedChangeUpdatedAt: created.updatedAt, action: 'approve', actorId: manager.id, scope, authorize: async () => {}, audit: async () => {} }
  await assert.rejects(service.decideDeliveryChange({ ...common, acknowledgeFeeDifference: false }), error => error.code === 'FEE_ACK_REQUIRED')
  const approved = await service.decideDeliveryChange({ ...common, acknowledgeFeeDifference: true })
  assert.equal(approved.status, 'APPROVED')
  const delivery = await db.productDelivery.findUniqueOrThrow({ where: { orderId: order.id } })
  assert(JSON.parse(delivery.address).address.includes(requestedAddress.address))
  const persistedOrder = await db.order.findUniqueOrThrow({ where: { id: order.id }, select: { totalMinor: true } })
  assert.equal(persistedOrder.totalMinor, 1050n, 'approval leaves the customer charge unchanged')

  const second = await service.requestDeliveryChange({ orderId: order.id, userId: buyer.id, addressId: oldAddress.id })
  carrierFee = 131n
  await assert.rejects(service.decideDeliveryChange({ ...common, changeId: second.id, expectedChangeUpdatedAt: second.updatedAt, acknowledgeFeeDifference: true }), error => error.code === 'STALE_QUOTE')
  const withdrawn = await service.withdrawDeliveryChange({ changeId: second.id, userId: buyer.id })
  assert.equal(withdrawn.ok, true)
  const state = await service.customerDeliveryChanges(order.id, buyer.id)
  assert.deepEqual(state.changes.map(change => change.status), ['WITHDRAWN', 'APPROVED'])
  console.log('Store delivery amendment PostgreSQL passed: address ownership, single-open request, immutable snapshots, fixed customer charge, explicit Store fee acknowledgement, stale carrier quote rejection, and withdrawal history')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (ids.orders.length) await db.orderDeliveryChange.deleteMany({ where: { orderId: { in: ids.orders } } })
  if (ids.orders.length) await db.orderEvent.deleteMany({ where: { orderId: { in: ids.orders } } })
  if (ids.orders.length) await db.productDelivery.deleteMany({ where: { orderId: { in: ids.orders } } })
  if (ids.orders.length) await db.orderLine.deleteMany({ where: { orderId: { in: ids.orders } } })
  if (ids.orders.length) await db.order.deleteMany({ where: { id: { in: ids.orders } } })
  if (ids.addresses.length) await db.userAddress.deleteMany({ where: { id: { in: ids.addresses } } })
  if (ids.products.length) await db.product.deleteMany({ where: { id: { in: ids.products } } })
  if (ids.users.length) await db.user.deleteMany({ where: { id: { in: ids.users } } })
  await db.$disconnect()
})
