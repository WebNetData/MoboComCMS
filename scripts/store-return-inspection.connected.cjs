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
const ownForms = []
let priorRepairForm = null
let viewer, manager, cashier, buyer, otherBuyer, sessionId, shelf, quarantine, createdQuarantine = false
let repairForm
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
  '@/modules/forms/server/paid': { receiptCodes: () => ({}), revealSecrets: async () => [], sealSecrets: answers => ({ answers, secrets: '' }), tellSender: async () => {} },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
})
const sales = load('src/modules/store/server/counter-sales.ts')
const returns = load('src/modules/store/server/returns.ts')
const locations = load('src/modules/catalog/server/locations.ts')
const custody = load('src/modules/store/server/returns/custody.ts')
const warranties = load('src/modules/store/server/warranties.ts')
const warrantyDomain = load('src/modules/store/domain/warranty.ts')
const { TEMPLATES } = load('src/modules/forms/domain/forms.ts')
const formsCounter = load('src/modules/forms/server/counter.ts')
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
const warrantyAudit = (tx, id) => auditAdminStrict({ req, actor: viewer, action: 'store.warranty.create', targetType: 'store-warranty-device', targetId: id }, tx)
const warrantyUpdateAudit = (tx, id) => auditAdminStrict({ req, actor: viewer, action: 'store.warranty.update', targetType: 'store-warranty-device', targetId: id }, tx)
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
    custody: await db.returnCustodyResolution.findMany({ where: { returnRequest: { order: fixtureOrders } }, orderBy: { id: 'asc' } }),
    orderEvents: await db.orderEvent.findMany({ where: { order: fixtureOrders }, orderBy: { id: 'asc' } }),
    warranties: await db.storeWarrantyDevice.findMany({ where: { orderLine: { order: fixtureOrders } }, orderBy: { id: 'asc' } }),
    formSubmissions: await db.formSubmission.findMany({ where: { createdById: { in: users } }, orderBy: { id: 'asc' } }),
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

  // A manager's supplier-return decision releases exactly the damaged Q quantity through the existing stock ledger.
  const damagedSegmentIndex = inspected.inspection.segments.findIndex(part => part.disposition === 'DAMAGED')
  const damagedSegment = inspected.inspection.segments[damagedSegmentIndex]
  const custodyBefore = await returns.adminReturn(refunded.id)
  const custodyInput = { id: refunded.id, actorId: manager.id, segmentIndex: damagedSegmentIndex, action: 'SUPPLIER_RETURN', expectedUpdatedAt: new Date(custodyBefore.inspection.updatedAt), note: 'fixture manager confirmed supplier return', physicalReleaseConfirmed: true }
  const custodyAudit = (tx, id, status, resolution) => auditAdminStrict({ req, actor: viewer, action: 'store.return.custody.resolve', targetType: 'return-custody', targetId: id, metadata: { returnId: refunded.id, segmentIndex: damagedSegmentIndex, status, resolution } }, tx)
  failAuditAction = 'store.return.custody.resolve'
  try { await unchanged(() => custody.resolveReturnCustody(custodyInput, custodyAudit), /injected strict audit failure/, 'custody strict-audit rollback') } finally { failAuditAction = '' }
  assert.equal(await balance(original.id, quarantine.id), damagedSegment.quantity, 'failed custody resolution keeps the full segment in Q')
  const scrapped = await custody.resolveReturnCustody(custodyInput, custodyAudit)
  assert.equal(scrapped.status, 'SUPPLIER_RETURN')
  assert.equal(scrapped.resolution, 'SUPPLIER_RETURN')
  assert.equal(scrapped.quantity, damagedSegment.quantity)
  assert.equal(await balance(original.id, quarantine.id), 0, 'manager-confirmed scrap releases the physical segment from Q')
  assert.equal((await db.stockMovement.findMany({ where: { productId: original.id, refType: 'return-custody', refId: refunded.id } })).reduce((sum, row) => sum + row.delta, 0), -damagedSegment.quantity)
  assert.equal(await db.auditLog.count({ where: { action: 'store.return.custody.resolve', targetId: String(scrapped.id) } }), 1)
  await unchanged(() => custody.resolveReturnCustody(custodyInput, custodyAudit), refusal(409), 'terminal custody decision replay refused')

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
  buyer = await db.user.update({ where: { id: buyer.id }, data: { phone: '09120000001' } })
  otherBuyer = await db.user.update({ where: { id: otherBuyer.id }, data: { phone: '09120000002' } })
  const repairDefinition = TEMPLATES.find(item => item.id === 'mobile-repair').build()
  repairForm = await db.siteForm.findUnique({ where: { slug: 'mobile-repair' } })
  if (!repairForm) {
    repairForm = await db.siteForm.create({ data: { slug: repairDefinition.slug, title: repairDefinition.title, description: repairDefinition.description, fields: JSON.stringify(repairDefinition.fields), settings: JSON.stringify({ ...repairDefinition.settings, handlers: [manager.id] }), published: false, successText: repairDefinition.successText } })
    ownForms.push(repairForm.id)
  } else {
    priorRepairForm = { title: repairForm.title, description: repairForm.description, fields: repairForm.fields, settings: repairForm.settings, published: repairForm.published, successText: repairForm.successText }
    repairForm = await db.siteForm.update({ where: { id: repairForm.id }, data: { title: repairDefinition.title, description: repairDefinition.description, fields: JSON.stringify(repairDefinition.fields), settings: JSON.stringify({ ...repairDefinition.settings, handlers: [manager.id] }), published: false, successText: repairDefinition.successText } })
  }
  const later = await product('received-after-refund')
  const laterSerial = `${stamp}-serial`, laterImei = '359881234567890'
  const laterSale = await sell(saleInput([{ ...line(later), deviceIdentifiers: [{ serial: laterSerial, imei: laterImei }] }]))
  const laterLine = await db.orderLine.findFirstOrThrow({ where: { orderId: laterSale.orderId }, orderBy: { line: 'asc' } })
  const warrantyDraft = warrantyDomain.parseWarrantyDraft({ orderLineId: laterLine.id, unitIndex: 0, warrantyStartsAt: '2026-01-01', warrantyEndsAt: '2027-01-01', provider: 'Fixture vendor', conditions: 'Fixture staff-entered terms' })
  const warrantyInput = { ...warrantyDraft, orderId: laterSale.orderId, actorId: manager.id }
  failAuditAction = 'store.warranty.create'
  try { await unchanged(() => warranties.createWarrantyDevice(warrantyInput, warrantyAudit), /injected strict audit failure/, 'warranty create strict-audit rollback') } finally { failAuditAction = '' }
  const warrantyDevice = await warranties.createWarrantyDevice(warrantyInput, warrantyAudit)
  assert.equal(warrantyDevice.serial, laterSerial, 'warranty copies the immutable sale serial snapshot')
  assert.equal(warrantyDevice.imei, laterImei, 'warranty copies the immutable sale IMEI snapshot')
  assert.equal((await warranties.customerWarrantyDevices(buyer.id)).some(row => row.id === warrantyDevice.id), true)
  assert.equal((await warranties.customerWarrantyDevices(otherBuyer.id)).some(row => row.id === warrantyDevice.id), false, 'another canonical customer cannot read the warranty')
  assert.equal((await warranties.adminWarrantyDevices(laterSale.orderId)).lines[0].devices[0].warranty.id, warrantyDevice.id)
  await unchanged(() => warranties.createWarrantyDevice(warrantyInput, warrantyAudit), refusal(409), 'duplicate warranty unit refused')
  const staleWarrantyUpdate = { id: warrantyDevice.id, expectedUpdatedAt: new Date(warrantyDevice.updatedAt.getTime() - 1000), warrantyStartsAt: warrantyDevice.warrantyStartsAt, warrantyEndsAt: warrantyDevice.warrantyEndsAt, provider: 'Changed', conditions: 'Changed', actorId: manager.id }
  await unchanged(() => warranties.updateWarrantyDevice(staleWarrantyUpdate, warrantyUpdateAudit), refusal(409), 'stale warranty edit refused')
  const currentWarrantyUpdate = warrantyDomain.parseWarrantyUpdate({ expectedUpdatedAt: warrantyDevice.updatedAt.toISOString(), warrantyStartsAt: '2026-01-01', warrantyEndsAt: '2027-01-01', provider: 'Updated fixture vendor', conditions: 'Updated fixture conditions' })
  failAuditAction = 'store.warranty.update'
  try { await unchanged(() => warranties.updateWarrantyDevice({ ...currentWarrantyUpdate, id: warrantyDevice.id, actorId: manager.id }, warrantyUpdateAudit), /injected strict audit failure/, 'warranty update strict-audit rollback') } finally { failAuditAction = '' }
  const editedWarranty = await warranties.updateWarrantyDevice({ ...currentWarrantyUpdate, id: warrantyDevice.id, actorId: manager.id }, warrantyUpdateAudit)
  assert.equal(editedWarranty.provider, 'Updated fixture vendor')

  const repairValues = { name: buyer.name, mobile: buyer.phone, brand: 'اپل (آیفون)', model: 'Fixture phone', imei: laterImei, issue: 'سخت‌افزاری', description: 'Fixture repair issue', handover: 'حضوری می‌آورم', consent: true }
  const formSubmission = await formsCounter.staffSubmit(repairForm.id, { values: repairValues, storeWarrantyDeviceId: warrantyDevice.id }, { id: manager.id })
  const linkedForm = await db.formSubmission.findUniqueOrThrow({ where: { id: formSubmission.id } })
  assert.equal(linkedForm.storeWarrantyDeviceId, warrantyDevice.id, 'staff repair intake persists the warranty relation')
  assert.equal(linkedForm.userId, buyer.id, 'staff repair intake resolves to the same canonical buyer')
  await unchanged(() => formsCounter.staffSubmit(repairForm.id, { values: { ...repairValues, mobile: otherBuyer.phone }, storeWarrantyDeviceId: warrantyDevice.id }, { id: manager.id }), error => error?.status === 403, 'foreign customer cannot attach a warranty repair')
  await unchanged(() => formsCounter.staffSubmit(repairForm.id, { values: { ...repairValues, imei: '359881234567891' }, storeWarrantyDeviceId: warrantyDevice.id }, { id: manager.id }), error => error?.status === 409, 'repair intake refuses an IMEI mismatch')

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
  const damagedLate = await returns.inspectReturn(await inspectionInput(laterReturn.id, [damaged()]), audit('store.return.inspect'))
  const repairSegmentIndex = damagedLate.inspection.segments.findIndex(part => part.disposition === 'DAMAGED')
  const repairCustodyInput = { id: laterReturn.id, actorId: manager.id, segmentIndex: repairSegmentIndex, action: 'REPAIR', expectedUpdatedAt: new Date(damagedLate.inspection.updatedAt), note: 'fixture repair handoff', formSubmissionId: formSubmission.id, identityConfirmed: true, formsManager: false }
  const custodyAuditLater = (tx, id, status, resolution) => auditAdminStrict({ req, actor: viewer, action: 'store.return.custody.resolve', targetType: 'return-custody', targetId: id, metadata: { returnId: laterReturn.id, segmentIndex: repairSegmentIndex, status, resolution } }, tx)
  viewer = cashier
  await unchanged(() => custody.resolveReturnCustody({ ...repairCustodyInput, actorId: cashier.id }, custodyAuditLater), refusal(403), 'unassigned staff cannot claim a repair Form')
  viewer = manager
  const repairCustody = await custody.resolveReturnCustody(repairCustodyInput, custodyAuditLater)
  assert.equal(repairCustody.status, 'REPAIR')
  assert.equal(repairCustody.formSubmissionId, formSubmission.id)
  assert.equal(await balance(later.id, quarantine.id), 1, 'repair routing keeps the unit in quarantine')
  await db.formSubmission.update({ where: { id: formSubmission.id }, data: { stage: 'DONE' } })
  const restocked = await custody.resolveReturnCustody({ id: laterReturn.id, actorId: manager.id, segmentIndex: repairSegmentIndex, action: 'RESTOCK', expectedUpdatedAt: repairCustody.updatedAt, note: 'fixture health check passed', healthConfirmed: true, destinationLocationId: shelf.id, formsManager: false }, custodyAuditLater)
  assert.equal(restocked.status, 'RESTOCKED')
  assert.equal(restocked.resolution, 'RESTOCK')
  assert.equal(await balance(later.id, quarantine.id), 0)
  assert.equal(await balance(later.id, shelf.id), 1)
  await unchanged(() => custody.resolveReturnCustody({ id: laterReturn.id, actorId: manager.id, segmentIndex: repairSegmentIndex, action: 'RESTOCK', expectedUpdatedAt: restocked.updatedAt, note: 'replay', healthConfirmed: true, destinationLocationId: shelf.id, formsManager: false }, custodyAuditLater), refusal(409), 'terminal repaired custody replay refused')
  console.log('PASS Store return inspection PostgreSQL: refunds/quarantine and final supplier return; repair Form intake tied to sold IMEI and canonical customer, warranty snapshot/customer isolation/stale and audit rollback; repair custody stays in Q then Forms DONE + manager health confirmation restocks via the location ledger; exchanges and return audit/replay safeguards')
}

async function cleanup() {
  failAuditAction = ''
  const ids = (await db.order.findMany({ where: { createdById: { in: users } }, select: { id: true } })).map(row => row.id)
  await db.returnCustodyResolution.deleteMany({ where: { returnRequest: { orderId: { in: ids } } } })
  await db.formSubmission.deleteMany({ where: { createdById: { in: users } } })
  await db.storeWarrantyDevice.deleteMany({ where: { orderLine: { orderId: { in: ids } } } })
  if (priorRepairForm && repairForm) await db.siteForm.update({ where: { id: repairForm.id }, data: priorRepairForm })
  if (ownForms.length) await db.siteForm.deleteMany({ where: { id: { in: ownForms } } })
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
