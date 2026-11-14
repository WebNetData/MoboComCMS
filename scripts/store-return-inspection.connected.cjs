// Native PostgreSQL check: production return, stock, sale, AuthZ and audit owners.
// Only external notification/emission boundaries are doubled; no .env is loaded.
const assert = require('node:assert/strict')
const { randomUUID, randomBytes } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')

assert(process.env.DATABASE_URL, 'DATABASE_URL must name a disposable PostgreSQL database')
const database = new URL(process.env.DATABASE_URL)
assert(['postgres:', 'postgresql:'].includes(database.protocol), 'PostgreSQL required')
assert(/test|check/i.test(database.pathname), 'disposable test/check database required')
process.env.STORE_DELIVERY_KEY = randomBytes(32).toString('hex')
process.env.NEXTAUTH_SECRET ||= randomBytes(32).toString('hex')

const db = new PrismaClient(), stamp = `return-inspection-${Date.now()}-${randomBytes(3).toString('hex')}`
const users = [], roles = [], products = [], ownLocations = []
let viewer, manager, cashier, buyer, otherBuyer, sessionId, shelf, quarantine, createdQuarantine = false
let failAuditAction = ''
db.$use(async (params, next) => {
  const result = await next(params)
  if (params.model === 'AuditLog' && params.action === 'create' && params.args.data.action === failAuditAction) throw new Error('injected strict audit failure')
  return result
})
class SmsError extends Error {}
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  react: { ...require('react'), cache: fn => fn },
  'next-auth/jwt': { getToken: async () => viewer ? { uid: String(viewer.id), authAt: new Date().toISOString() } : null },
  '@/extensions/server/modules': { moduleGuard: async () => null, isModuleEnabled: async () => true },
  '@/extensions/server/runtime': { emitExtensionEvent: async () => {} },
  '@/modules/automation/server/engine': { emitAutomation: async () => {} },
  '@/modules/notifications/server/inbox': { createInboxEvent: async () => null },
  '@/modules/sms/server/sms': { SmsError, siteLink: path => `http://site.invalid${path}`, notifyAdmins: async () => {}, notifyUserEvent: async () => null },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
})
const sales = load('src/modules/store/server/counter-sales.ts')
const returns = load('src/modules/store/server/returns.ts')
const locations = load('src/modules/catalog/server/locations.ts')
const { requirePerm } = load('src/modules/identity/server/access.ts')
const { auditAdminStrict } = load('src/platform/audit/server.ts')
const { StoreError } = load('src/modules/store/domain/store.ts')
const req = new NextRequest('http://site.invalid/api/admin/store/counter', { method: 'POST', headers: { Origin: 'http://site.invalid' } })

const authorize = async tx => {
  if (!await requirePerm(req, 'orders.manage', tx) && !await requirePerm(req, 'instore.sell', tx)) throw new StoreError('sale permission refused', 403)
}
const authorizeExchange = async tx => {
  if (!await requirePerm(req, 'orders.manage', tx)) throw new StoreError('exchange manager permission refused', 403)
}
const audit = action => (tx, id) => auditAdminStrict({ req, actor: viewer, action, targetType: action === 'store.return.inspect' ? 'return' : 'store', targetId: id }, tx)
const line = (product, quantity = 1, variantId = null) => ({ productId: product.id, variantId, quantity, expectedUnitMinor: product.priceMinor.toString(), inputs: {} })
const saleInput = (lines, extra = {}) => ({ requestId: randomUUID(), confirmed: true, packingConfirmed: true, method: 'CASH', sessionId, customerId: buyer.id, customerName: buyer.name, customerPhone: '', lines, ...extra })
const sell = input => sales.createCounterSale(input, viewer.id, authorize, audit('store.counter.sale'), authorizeExchange)
const returnInput = (orderId, quantity = 2, extra = {}) => ({ requestId: randomUUID(), orderId, sessionId, confirmed: true, refund: 'CASH', reason: 'exchange', restock: true, expectedRefundMinor: String(quantity * 1000), lines: [{ line: 0, quantity }], ...extra })
const takeReturn = input => returns.createCounterReturn(input, viewer.id, authorizeExchange, audit('store.counter.return'))
const inspectionInput = async (id, parts) => ({ id, actorId: manager.id, expectedUpdatedAt: (await returns.adminReturn(id)).inspection.updatedAt, lines: parts })
const healthy = (quantity = 1) => ({ line: 0, quantity, disposition: 'HEALTHY', approvedQuantity: quantity, destinationLocationId: shelf.id, note: 'intact unit verified' })
const damaged = (quantity = 1) => ({ line: 0, quantity, disposition: 'DAMAGED', approvedQuantity: 0, note: 'damaged unit stays in custody' })
const refusal = status => error => error instanceof StoreError && error.status === status

async function person(label, permissions) {
  const role = permissions ? await db.role.create({ data: { name: `${stamp}-${label}`, permissions } }) : null
  if (role) roles.push(role.id)
  const row = await db.user.create({ data: { email: `${stamp}-${label}@example.invalid`, name: `${stamp} ${label}`, passwordHash: 'fixture-only', role: permissions ? 'ADMIN' : 'USER', roleId: role?.id, ...(permissions ? { totpEnabledAt: new Date() } : {}) } })
  users.push(row.id)
  return row
}
async function product(label, stock = 8, currency = 'IRT', priceMinor = 1000n) {
  const row = await db.product.create({ data: { name: `${stamp} ${label}`, slug: `${stamp}-${label}`, sku: `${stamp}-${label}`, kind: 'PHYSICAL', active: true, approval: 'APPROVED', stock, currency, price: Number(priceMinor), priceMinor, digitalMode: 'MANUAL' } })
  products.push(row.id)
  return row
}
async function balance(productId, locationId, variantId = null) {
  return (await db.locationStock.findUnique({ where: { locationId_itemKey: { locationId, itemKey: locations.itemKey(productId, variantId) } } }))?.quantity || 0
}
async function gross(orderId) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { invoice: true, payments: { orderBy: { id: 'asc' } }, tenders: { orderBy: { id: 'asc' } } } })
  return {
    id: order.id, userId: order.userId, totalMinor: order.totalMinor, totalAmount: order.totalAmount, currency: order.currency,
    invoice: { id: order.invoice.id, number: order.invoice.number, subtotalMinor: order.invoice.subtotalMinor, discountMinor: order.invoice.discountMinor, taxMinor: order.invoice.taxMinor, totalMinor: order.invoice.totalMinor, paidAmountMinor: order.invoice.paidAmountMinor, walletAppliedMinor: order.invoice.walletAppliedMinor, currency: order.invoice.currency },
    payments: order.payments.map(row => ({ id: row.id, invoiceId: row.invoiceId, userId: row.userId, provider: row.provider, status: row.status, amountMinor: row.amountMinor, feeMinor: row.feeMinor, currency: row.currency })),
    tenders: order.tenders.map(row => ({ id: row.id, sessionId: row.sessionId, method: row.method, amountMinor: row.amountMinor })),
  }
}
async function snapshot() {
  const fixtureOrders = { createdById: { in: users } }
  return {
    products: await db.product.findMany({ where: { id: { in: products } }, orderBy: { id: 'asc' }, select: { id: true, stock: true, soldCount: true } }),
    stocks: await db.locationStock.findMany({ where: { productId: { in: products } }, orderBy: { id: 'asc' } }),
    movements: await db.stockMovement.findMany({ where: { productId: { in: products } }, orderBy: { id: 'asc' } }),
    orders: await db.order.findMany({ where: fixtureOrders, orderBy: { id: 'asc' }, select: { id: true, totalMinor: true, status: true, idempotencyKey: true } }),
    invoices: await db.invoice.findMany({ where: { order: fixtureOrders }, orderBy: { id: 'asc' } }),
    payments: await db.payment.findMany({ where: { order: fixtureOrders }, orderBy: { id: 'asc' } }),
    tenders: await db.storeTender.findMany({ where: { order: fixtureOrders }, orderBy: { id: 'asc' } }),
    returns: await db.returnRequest.findMany({ where: { order: fixtureOrders }, orderBy: { id: 'asc' } }),
    adjustments: await db.storeRegisterAdjustment.findMany({ where: { actorId: { in: users } }, orderBy: { id: 'asc' } }),
    audits: await db.auditLog.findMany({ where: { actorUserId: { in: users } }, orderBy: { id: 'asc' } }),
    packing: await db.orderPackingCheck.findMany({ where: { completedById: { in: users } }, orderBy: { orderId: 'asc' } }),
  }
}
async function unchanged(work, expected, label) {
  const before = await snapshot()
  await assert.rejects(work, expected, label)
  assert.deepEqual(await snapshot(), before, `${label}: transaction left no business, money, movement or audit changes`)
}

async function main() {
  manager = await person('manager', 'dashboard.view,orders.manage')
  cashier = await person('cashier', 'dashboard.view,instore.sell')
  buyer = await person('buyer')
  otherBuyer = await person('other-buyer')
  viewer = manager
  shelf = await db.stockLocation.create({ data: { name: `${stamp}-shelf`, kind: 'SHOP', sellsOnline: true } })
  ownLocations.push(shelf.id)
  if (!await db.stockLocation.count({ where: { isDefault: true } })) {
    const home = await db.stockLocation.create({ data: { name: `${stamp}-home`, isDefault: true, sellsOnline: true } })
    ownLocations.push(home.id)
  }
  const existingQuarantine = await db.stockLocation.findFirst({ where: { isQuarantine: true } })
  quarantine = await db.$transaction(async tx => tx.stockLocation.findUniqueOrThrow({ where: { id: await locations.quarantineLocationId(tx) } }))
  createdQuarantine = !existingQuarantine
  const opened = await sales.openRegister({ requestId: randomUUID(), register: stamp, currency: 'IRT', openingCashMinor: '0', locationId: shelf.id }, manager.id, audit('store.counter.register.open'))
  sessionId = Number(opened.id)
  // Legacy finite product + unlimited variant: stock is owned by the product pool.
  const original = await product('legacy-with-variant')
  const variant = await db.productVariant.create({ data: { productId: original.id, sku: `${stamp}-variant`, name: 'variant using product pool', priceMinor: 1000n, price: 1000, stock: -1 } })
  const replacement = await product('replacement', 20, 'IRT', 1500n)
  await db.$transaction(tx => locations.setLocationQuantity(tx, { productId: replacement.id, variantId: null, locationId: shelf.id, quantity: 20 }, 'INIT', { actorId: manager.id }))
  const sourceSale = await sell(saleInput([line(original, 2, variant.id)]))
  const sourceGross = await gross(sourceSale.orderId)
  assert.equal(sourceGross.totalMinor, 2000n)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: original.id } })).stock, 6)
  const refundBody = returnInput(sourceSale.orderId)
  // The counter composes refundReturn with the drawer, receipt, quarantine and strict audit.
  const refunded = await takeReturn(refundBody)
  const pending = await db.returnRequest.findUniqueOrThrow({ where: { id: refunded.id } })
  assert.equal(pending.status, 'REFUNDED')
  assert.equal(pending.inspectionStatus, 'PENDING')
  assert.equal(pending.refundMinor, 2000n)
  assert.equal(await balance(original.id, quarantine.id), 2, 'returned units use the product pool in quarantine')
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: original.id } })).stock, 6, 'receiving returned goods never increases sellable stock')
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock, -1)
  assert.equal((await db.storeRegisterAdjustment.findUniqueOrThrow({ where: { id: pending.registerAdjustmentId } })).amountMinor, -2000n)
  assert.deepEqual(await gross(sourceSale.orderId), sourceGross, 'refund preserves original gross invoice, payment and tender rows')
  const afterRefund = await snapshot()
  assert.equal((await takeReturn(refundBody)).id, refunded.id)
  assert.deepEqual(await snapshot(), afterRefund, 'counter-return replay cannot receive or pay twice')
  await unchanged(() => returns.refundReturn({ id: refunded.id, actorId: manager.id, restock: true, register: { sessionId } }), refusal(409), 'refunded return refuses another refund')

  // Quarantine is never a register shelf or an ordinary transfer/count/receipt destination.
  await unchanged(() => sales.openRegister({ requestId: randomUUID(), register: `${stamp}-quarantine`, currency: 'IRT', openingCashMinor: '0', locationId: quarantine.id }, manager.id, audit('store.counter.register.open')), refusal(404), 'quarantine register refused')
  await unchanged(() => db.$transaction(tx => locations.takeFromLocations(tx, { productId: original.id, variantId: variant.id, quantity: 1 }, { locationId: quarantine.id })), locations.OutOfStock, 'quarantine allocation refused')
  for (const input of [{ from: quarantine.id, to: shelf.id }, { from: shelf.id, to: quarantine.id }]) {
    await unchanged(() => db.$transaction(tx => locations.transferStock(tx, { productId: original.id, variantId: null, quantity: 1, ...input })), locations.LocationError, 'ordinary quarantine transfer refused')
  }
  await unchanged(() => db.$transaction(tx => locations.setLocationQuantity(tx, { productId: original.id, variantId: null, locationId: quarantine.id, quantity: 99 }, 'COUNT')), locations.LocationError, 'quarantine count bypass refused')
  await unchanged(() => db.$transaction(tx => locations.addAtLocation(tx, { productId: original.id, variantId: null, locationId: quarantine.id, quantity: 1 }, 'RECEIPT')), locations.LocationError, 'quarantine receipt bypass refused')

  const inspection = await inspectionInput(refunded.id, [healthy(), damaged()])
  await unchanged(() => returns.inspectReturn({ ...inspection, expectedUpdatedAt: new Date(Date.parse(inspection.expectedUpdatedAt) - 1000).toISOString() }, audit('store.return.inspect')), refusal(409), 'stale inspection refused')
  await unchanged(() => returns.inspectReturn({ ...inspection, lines: [healthy()] }, audit('store.return.inspect')), refusal(409), 'partial classification refused')
  await unchanged(() => returns.inspectReturn({ ...inspection, lines: [healthy(), { ...damaged(), approvedQuantity: 1 }] }, audit('store.return.inspect')), refusal(400), 'damaged approval refused')
  failAuditAction = 'store.return.inspect'
  try { await unchanged(() => returns.inspectReturn(inspection, audit('store.return.inspect')), /injected strict audit failure/, 'inspection strict-audit rollback') } finally { failAuditAction = '' }
  const inspected = await returns.inspectReturn(inspection, audit('store.return.inspect'))
  assert.equal(inspected.inspection.status, 'DISPOSED')
  assert.equal(inspected.inspection.segments.reduce((sum, part) => sum + part.quantity, 0), 2)
  assert.equal(inspected.inspection.segments.find(part => part.disposition === 'HEALTHY').approvedQuantity, 1)
  assert.equal(inspected.inspection.segments.find(part => part.disposition === 'DAMAGED').approvedQuantity, 0)
  assert.equal(await balance(original.id, quarantine.id), 1, 'damaged unit remains physically quarantined')
  assert.equal(await balance(original.id, shelf.id), 1, 'only healthy unit reaches the selling shelf')
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: original.id } })).stock, 7)
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock, -1, 'inspection preserves unlimited variant stock')
  const disposal = await db.stockMovement.findMany({ where: { productId: original.id, refType: 'return-inspection', refId: refunded.id }, orderBy: { id: 'asc' } })
  assert.equal(disposal.filter(row => row.reason === 'TRANSFER').length, 2)
  assert.equal(disposal.find(row => row.reason === 'ADJUST').delta, 0, 'damaged disposition records custody without deleting physical stock')
  assert.equal(await db.auditLog.count({ where: { action: 'store.return.inspect', targetId: String(refunded.id) } }), 1)
  await unchanged(() => returns.inspectReturn(inspection, audit('store.return.inspect')), refusal(409), 'inspection replay refused')
  assert.deepEqual(await gross(sourceSale.orderId), sourceGross)

  // Exchange is a complete new paid sale; it never nets away either sale's money records.
  const exchangeBody = saleInput([line(replacement)], { exchangeReturnId: refunded.id })
  await unchanged(() => sales.createCounterSale(exchangeBody, manager.id, authorize, audit('store.counter.sale')), refusal(403), 'exchange requires manager callback')
  const cashierShift = await sales.openRegister({ requestId: randomUUID(), register: `${stamp}-cashier`, currency: 'IRT', openingCashMinor: '0', locationId: shelf.id }, cashier.id, audit('store.counter.register.open'))
  viewer = cashier
  await unchanged(() => sell({ ...exchangeBody, sessionId: Number(cashierShift.id) }), refusal(403), 'cashier cannot link exchange')
  viewer = manager
  await unchanged(() => sell({ ...exchangeBody, requestId: randomUUID(), customerId: otherBuyer.id, customerName: otherBuyer.name }), refusal(409), 'exchange refuses different buyer')
  const foreignProduct = await product('foreign-currency', 3, 'USD')
  await db.$transaction(tx => locations.setLocationQuantity(tx, { productId: foreignProduct.id, variantId: null, locationId: shelf.id, quantity: 3 }, 'INIT'))
  const usdShift = await sales.openRegister({ requestId: randomUUID(), register: `${stamp}-usd`, currency: 'USD', openingCashMinor: '0', locationId: shelf.id }, manager.id, audit('store.counter.register.open'))
  await unchanged(() => sell(saleInput([line(foreignProduct)], { sessionId: Number(usdShift.id), exchangeReturnId: refunded.id })), refusal(409), 'exchange refuses different currency')
  failAuditAction = 'store.counter.sale'
  try { await unchanged(() => sell(exchangeBody), /injected strict audit failure/, 'exchange strict-audit rollback') } finally { failAuditAction = '' }
  assert.equal((await db.returnRequest.findUniqueOrThrow({ where: { id: refunded.id } })).replacementOrderId, null)
  const exchanged = await sell(exchangeBody), replacementGross = await gross(exchanged.orderId)
  assert.equal(exchanged.replayed, false)
  assert.equal((await db.returnRequest.findUniqueOrThrow({ where: { id: refunded.id } })).replacementOrderId, exchanged.orderId)
  assert.equal(replacementGross.totalMinor, 1500n, 'new sale keeps its entire price instead of subtracting the 2000 refund')
  assert.equal(replacementGross.invoice.totalMinor, 1500n)
  assert.equal(replacementGross.payments.reduce((sum, row) => sum + row.amountMinor, 0n), 1500n)
  assert.equal(replacementGross.tenders.reduce((sum, row) => sum + row.amountMinor, 0n), 1500n)
  assert.deepEqual(await gross(sourceSale.orderId), sourceGross)
  const afterExchange = await snapshot()
  assert.deepEqual(await sell(exchangeBody), { orderId: exchanged.orderId, replayed: true })
  assert.deepEqual(await snapshot(), afterExchange, 'exchange request replay makes no stock, money or audit rows')
  await unchanged(() => sell({ ...exchangeBody, requestId: randomUUID() }), refusal(409), 'second replacement link refused')
  await unchanged(() => sell({ ...exchangeBody, customerName: 'changed buyer snapshot' }), refusal(409), 'exchange request-key conflict refused')

  // Standalone refund owner also quarantines physical returns and preserves unlimited inventory.
  const unlimited = await product('unlimited', -1)
  const unlimitedSale = await sell(saleInput([line(unlimited)]))
  const direct = await db.returnRequest.create({ data: { number: `${stamp}-direct`, orderId: unlimitedSale.orderId, userId: buyer.id, kind: 'RETURN', status: 'APPROVED', requestedMinor: 1000n, currency: 'IRT', refundMethod: 'WALLET', lines: JSON.stringify([{ line: 0, quantity: 1 }]) } })
  await db.$transaction(async tx => {
    await returns.refundReturn({ id: direct.id, actorId: manager.id, restock: true }, tx)
    await audit('store.return.refund')(tx, direct.id)
  })
  assert.equal(await balance(unlimited.id, quarantine.id), 1)
  assert.equal(await db.$transaction(tx => locations.trackedItem(tx, unlimited.id, null)), null, 'quarantine alone does not turn unlimited items into tracked sellable inventory')
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: unlimited.id } })).stock, -1)
  await returns.inspectReturn(await inspectionInput(direct.id, [healthy()]), audit('store.return.inspect'))
  assert.equal(await balance(unlimited.id, quarantine.id), 0)
  assert.equal(await balance(unlimited.id, shelf.id), 1)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: unlimited.id } })).stock, -1, 'healthy inspection does not replace unlimited stock with a finite cache')
  const later = await product('received-after-refund')
  const laterSale = await sell(saleInput([line(later)]))
  const laterReturn = await takeReturn(returnInput(laterSale.orderId, 1, { restock: false }))
  const priorMoney = await gross(laterSale.orderId)
  let lateView = await returns.adminReturn(laterReturn.id)
  assert.equal(lateView.inspection.canReceive, true)
  const receiveInput = { id: laterReturn.id, actorId: manager.id, expectedUpdatedAt: lateView.inspection.updatedAt }
  failAuditAction = 'store.return.receive'
  try { await unchanged(() => returns.receiveReturnGoods(receiveInput, audit('store.return.receive')), /injected strict audit failure/, 'late receipt audit rollback') } finally { failAuditAction = '' }
  lateView = await returns.receiveReturnGoods(receiveInput, audit('store.return.receive'))
  assert.equal(lateView.inspection.status, 'PENDING'); assert.equal(await balance(later.id, quarantine.id), 1)
  await unchanged(() => returns.receiveReturnGoods(receiveInput, audit('store.return.receive')), refusal(409), 'late receipt replay')
  assert.deepEqual(await gross(laterSale.orderId), priorMoney, 'late receipt changes no money records')
  console.log('PASS Store return inspection PostgreSQL: real counter/standalone refunds, legacy product/variant and unlimited stock, quarantine custody/guarded allocation-register-transfer-count-receipt, complete mixed dispositions, stale/replay and late receipt refusal/rollback; manager-only same-buyer/currency exchange with independent gross invoices/payments/tenders and one replacement link')
}

async function cleanup() {
  failAuditAction = ''
  const ids = (await db.order.findMany({ where: { createdById: { in: users } }, select: { id: true } })).map(row => row.id)
  await db.returnRequest.deleteMany({ where: { orderId: { in: ids } } })
  await db.walletTx.deleteMany({ where: { userId: { in: users } } })
  await db.walletAccount.deleteMany({ where: { userId: { in: users } } })
  await db.stockMovement.deleteMany({ where: { productId: { in: products } } })
  await db.locationStock.deleteMany({ where: { productId: { in: products } } })
  for (const model of ['storeTender', 'payment', 'invoice', 'inventoryReservation', 'orderEvent', 'productDelivery', 'orderPackingCheck', 'orderLine']) await db[model].deleteMany({ where: { orderId: { in: ids } } })
  await db.order.deleteMany({ where: { id: { in: ids } } })
  await db.product.deleteMany({ where: { id: { in: products } } })
  await db.storeRegisterAdjustment.deleteMany({ where: { actorId: { in: users } } })
  await db.storeRegisterSession.deleteMany({ where: { cashierId: { in: users } } })
  await db.auditLog.deleteMany({ where: { actorUserId: { in: users } } })
  await db.userNotification.deleteMany({ where: { userId: { in: users } } })
  await db.user.deleteMany({ where: { id: { in: users } } })
  await db.role.deleteMany({ where: { id: { in: roles } } })
  await db.stockLocation.deleteMany({ where: { id: { in: ownLocations } } })
  if (createdQuarantine && quarantine && !await db.locationStock.count({ where: { locationId: quarantine.id } }) && !await db.storeRegisterSession.count({ where: { locationId: quarantine.id } })) await db.stockLocation.delete({ where: { id: quarantine.id } })
}
main().finally(async () => { try { await cleanup() } finally { await db.$disconnect() } }).catch(error => { console.error(error); process.exitCode = 1 })
