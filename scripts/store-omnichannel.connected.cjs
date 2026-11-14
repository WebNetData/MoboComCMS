// Native money/stock checks. Only external notifications, configuration and post-commit club/seller hooks are doubled.
const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto'), { PrismaClient } = require('@prisma/client')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable database required')
const configs = {}
const db = new PrismaClient(), stamp = `omni-${Date.now().toString(36)}`
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  '@/modules/settings/server': { readJsonSetting: async key => configs[key] || null, getSettings: async () => ({ brandName: 'QA', siteUrl: 'https://site.invalid' }) },
  '@/modules/notifications/server/inbox': { createInboxEvent: async () => null },
  '@/extensions/server/runtime': { emitExtensionEvent: async () => {} },
  '@/platform/observability/logger': { logEvent() {} },
  '@/modules/marketplace/server/marketplace': { reverseSellerShare: async () => {} },
  '@/modules/store/server/marketing': { counterClub: async () => {}, reverseOrderPoints: async () => {} },
})
const stock = load('src/modules/catalog/server/locations.ts'), inventory = load('src/modules/catalog/server/inventory.ts')
const registers = load('src/modules/store/server/counter-sales/register.ts'), sales = load('src/modules/store/server/counter-sales.ts'), returns = load('src/modules/store/server/returns.ts')
const actors = [], products = [], orders = [], places = [], shifts = [], promotions = []
const noop = async () => {}
const balance = async (productId, locationId) => (await db.locationStock.findFirst({ where: { productId, locationId } }))?.quantity ?? 0

;(async () => {
  const actor = await db.user.create({ data: { email: `${stamp}@example.invalid`, name: stamp, passwordHash: 'test-only', role: 'ADMIN' } }); actors.push(actor.id)
  const buyer = await db.user.create({ data: { email: `${stamp}-buyer@example.invalid`, name: 'خریدار آزمایشی', passwordHash: 'test-only' } }); actors.push(buyer.id)
  const home = await db.$transaction(tx => stock.defaultLocationId(tx))
  const shelf = await db.stockLocation.create({ data: { name: `${stamp}-shop`, kind: 'SHOP', sellsOnline: false } }); places.push(shelf.id)
  const session = await registers.openRegister({ requestId: randomUUID(), register: stamp, currency: 'IRT', openingCashMinor: '10000', locationId: shelf.id }, actor.id, noop); shifts.push(session.id)
  const product = await db.product.create({ data: { name: stamp, slug: stamp, sku: stamp, kind: 'PHYSICAL', active: true, approval: 'APPROVED', stock: 10, currency: 'IRT', price: 1000, priceMinor: 1000n } }); products.push(product.id)
  await db.$transaction(async tx => {
    await stock.adoptEditorStock(tx, product.id)
    await stock.transferStock(tx, { productId: product.id, variantId: null, from: home, to: shelf.id, quantity: 4 })
  })
  const sell = async extra => {
    const result = await sales.createCounterSale({ requestId: randomUUID(), confirmed: true, packingConfirmed: true, sessionId: session.id, method: 'CASH', lines: [{ productId: product.id, variantId: null, quantity: 2, expectedUnitMinor: '1000', inputs: {} }], ...extra }, actor.id, noop, noop)
    orders.push(result.orderId)
    return db.order.findUniqueOrThrow({ where: { id: result.orderId }, include: { invoice: true } })
  }
  const guest = await sell({})
  const lookup = await returns.counterReturnLookup(guest.invoice.number)
  assert.equal(lookup.hasAccount, false); assert.equal(lookup.lines[0].returnable, 2)
  assert.equal(await balance(product.id, shelf.id), 2); assert.equal(await balance(product.id, home), 6)
  const payload = { requestId: randomUUID(), orderId: guest.id, sessionId: session.id, refund: 'CASH', reason: 'exchange', lines: [{ line: 0, quantity: 1 }], expectedRefundMinor: '1000', confirmed: true, packingConfirmed: true, restock: true }
  await assert.rejects(returns.createCounterReturn(payload, actor.id, noop, async () => { throw Error('audit-fault') }), /audit-fault/)
  assert.equal(await db.returnRequest.count({ where: { orderId: guest.id } }), 0)
  assert.equal(await db.storeRegisterAdjustment.count({ where: { sessionId: session.id } }), 0)
  assert.equal(await balance(product.id, shelf.id), 2, 'a failed audit rolls back stock and money')
  const returned = await returns.createCounterReturn(payload, actor.id, noop, noop)
  assert.equal(returned.refundMinor, '1000'); assert.equal(await balance(product.id, shelf.id), 3)
  assert.equal(await balance(product.id, home), 6, 'the website warehouse was not restocked instead of the shop')
  assert.equal((await db.storeRegisterAdjustment.findFirstOrThrow({ where: { sessionId: session.id } })).amountMinor, -1000n)
  assert.equal(await db.walletTx.count({ where: { orderId: guest.id } }), 0, 'guest cash refunds never create wallet credit')
  assert.deepEqual(await returns.createCounterReturn(payload, actor.id, noop, noop), returned)
  await assert.rejects(returns.createCounterReturn({ ...payload, restock: false }, actor.id, noop, noop), error => error.code === 'REQUEST_CONFLICT')
  const second = { ...payload, requestId: randomUUID(), refund: 'CARD', reference: 'qa-refund', restock: false }
  const race = await Promise.allSettled([returns.createCounterReturn(second, actor.id, noop, noop), returns.createCounterReturn({ ...second, requestId: randomUUID() }, actor.id, noop, noop)])
  assert.equal(race.filter(row => row.status === 'fulfilled').length, 1, 'the remaining unit is refunded once across distinct requests')
  assert.equal(await balance(product.id, shelf.id), 3, 'a damaged return stays out of sellable stock')
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: guest.id } })).status, 'REFUNDED')
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: guest.invoice.id } })).status, 'REFUNDED')
  const row = await db.returnRequest.findUniqueOrThrow({ where: { id: returned.id } })
  await assert.rejects(db.returnRequest.update({ where: { id: row.id }, data: { refundMinor: 999n } }), /paid refund/)
  await assert.rejects(db.returnRequest.update({ where: { id: row.id }, data: { status: 'APPROVED' } }), /paid/)
  await db.returnRequest.update({ where: { id: row.id }, data: { refundedAt: new Date(Date.now() - 3_600_000) } })
  assert.deepEqual(await returns.recoverInterruptedRefunds(), { checked: 0, finished: 0, failed: 0 }, 'cash/card refunds do not enter wallet recovery')

  const online = await sell({ customerId: buyer.id })
  // The same invoice/order/stock owners represent an online purchase; channel does not alter return authorization or money.
  await db.order.update({ where: { id: online.id }, data: { saleSource: 'ONLINE' } })
  const walletPayload = { ...payload, requestId: randomUUID(), orderId: online.id, refund: 'WALLET', lines: [{ line: 0, quantity: 2 }], expectedRefundMinor: '2000' }
  await returns.createCounterReturn(walletPayload, actor.id, noop, noop)
  assert.equal((await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: buyer.id, currency: 'IRT' } } })).balanceMinor, 2000n)
  assert.equal(await balance(product.id, shelf.id), 3)
  const recheck = await returns.counterReturnResult(walletPayload.requestId, actor.id)
  assert.equal(recheck.refundMinor, '2000')
  // Shared coupons reserve the same global/customer capacity as the website and freeze the actual discounted amount.
  const promo = await db.promotion.create({ data: { code: `OMNI_${Date.now()}`, kind: 'PERCENT', percentBps: 1000, currency: 'IRT', salesChannel: 'BOTH', maxUses: 1, perUserLimit: 1 } }); promotions.push(promo.id)
  const discounted = { requestId: randomUUID(), sessionId: session.id, confirmed: true, packingConfirmed: true, method: 'CASH', customerId: buyer.id, discountCode: promo.code, expectedTotalMinor: '1800', lines: [{ productId: product.id, variantId: null, quantity: 2, expectedUnitMinor: '1000', inputs: {} }] }
  const quote = await sales.quoteCounterSale(discounted)
  assert.equal(quote.totalMinor, '1800'); assert.equal(quote.discountMinor, '200')
  await assert.rejects(sales.createCounterSale({ ...discounted, expectedTotalMinor: '2000' }, actor.id, noop, noop), error => error.code === 'PRICE_CHANGED')
  const couponSale = await sales.createCounterSale(discounted, actor.id, noop, noop); orders.push(couponSale.orderId)
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { orderId: couponSale.orderId } })).totalMinor, 1800n)
  assert.equal((await db.promotionRedemption.findUniqueOrThrow({ where: { orderId: couponSale.orderId } })).status, 'USED')
  assert.equal((await db.promotion.findUniqueOrThrow({ where: { id: promo.id } })).reservedCount, 1)
  await db.promotion.update({ where: { id: promo.id }, data: { active: false } })
  assert.equal((await sales.createCounterSale(discounted, actor.id, noop, noop)).orderId, couponSale.orderId, 'a retry retains the original price even after the campaign closes')
  const websiteOnly = await db.promotion.create({ data: { code: `WEB_${Date.now()}`, kind: 'PERCENT', percentBps: 1000, currency: 'IRT', salesChannel: 'ONLINE' } }); promotions.push(websiteOnly.id)
  await assert.rejects(sales.quoteCounterSale({ ...discounted, discountCode: websiteOnly.code }), error => error.code === 'PROMOTION_CHANNEL')
  const pricing = load('src/modules/store/server/pricing.ts'), history = load('src/modules/catalog/domain/price-history.ts')
  const special = await db.product.update({ where: { id: product.id }, data: { price: 800, priceMinor: 800n, compareAtMinor: 1000n, saleChannel: 'COUNTER' } })
  assert.equal(pricing.unitPrice(special, null, false).unitMinor, 1000n)
  assert.equal(pricing.unitPrice(special, null, false, new Date(), undefined, 'COUNTER').unitMinor, 800n)
  assert.equal(history.publicPriceObservations(special, [])[0].amountMinor, 1000n, 'shop-only offers do not become website price-drop notices')
  await db.product.update({ where: { id: product.id }, data: { price: 1000, priceMinor: 1000n, compareAtMinor: 0n } })
  // A paid counter shipment reserves the selected warehouse, not the shop shelf, and is not marked handed over.
  configs['store.delivery.v1'] = { enabled: false, feeRial: 5000, freeOverRial: 0 }
  const shipment = { locationId: home, address: { recipient: 'گیرنده آزمایشی', mobile: '09123456789', province: 'تهران', city: 'تهران', address: 'خیابان آزمایشی پلاک هفت واحد یک', postalCode: '1456789345' } }
  const shipped = { ...discounted, requestId: randomUUID(), discountCode: '', shipment, expectedTotalMinor: '2500' }
  const beforeShelf = await balance(product.id, shelf.id), beforeWarehouse = await balance(product.id, home)
  const shipQuote = await sales.quoteCounterSale(shipped)
  assert.equal(shipQuote.shippingMinor, '500'); assert.equal(shipQuote.totalMinor, '2500')
  const shipSale = await sales.createCounterSale(shipped, actor.id, noop, noop); orders.push(shipSale.orderId)
  const shipmentOrder = await db.order.findUniqueOrThrow({ where: { id: shipSale.orderId }, include: { invoice: true, productDelivery: true } })
  assert.equal(shipmentOrder.invoice.totalMinor, 2500n); assert.equal(shipmentOrder.status, 'PAID')
  assert.equal(shipmentOrder.productDelivery.status, 'PENDING'); assert.equal(shipmentOrder.productDelivery.deliveredAt, null)
  assert.equal(await balance(product.id, home), beforeWarehouse - 2); assert.equal(await balance(product.id, shelf.id), beforeShelf)
  assert.equal(JSON.parse(shipmentOrder.meta).shippingAddress.postalCode, shipment.address.postalCode)
  const cancel = await db.returnRequest.create({ data: { number: `${stamp}-cancel-shipping`, orderId: shipmentOrder.id, userId: buyer.id, kind: 'CANCEL', requestedMinor: 2500n, currency: 'IRT' } })
  await returns.refundReturn({ id: cancel.id, actorId: actor.id, restock: true })
  assert.equal(await balance(product.id, home), beforeWarehouse, 'cancelling a paid warehouse shipment returns its original allocation')
  assert.equal(await balance(product.id, shelf.id), beforeShelf)
  await registers.closeRegister({ sessionId: session.id, countedCashMinor: '12000', countedCardMinor: '0' }, actor.id, noop)
  assert.deepEqual(await returns.createCounterReturn(walletPayload, actor.id, noop, noop), recheck, 'retry after register close returns the committed receipt')
  console.log('omnichannel: shared coupon capacity/price quote/channel limits and warehouse shipment/cancellation;  cash/card/wallet, online/counter, atomic audit rollback, refund races/replay, local restock and recovery isolation passed')
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await db.returnRequest.deleteMany({ where: { orderId: { in: orders } } })
  await db.productDigitalCode.deleteMany({ where: { orderId: { in: orders } } })
  await db.walletTx.deleteMany({ where: { userId: { in: actors } } })
  await db.walletAccount.deleteMany({ where: { userId: { in: actors } } })
  await db.payment.deleteMany({ where: { invoice: { orderId: { in: orders } } } })
  await db.invoice.deleteMany({ where: { orderId: { in: orders } } })
  await db.storeTender.deleteMany({ where: { orderId: { in: orders } } })
  await db.storeRegisterAdjustment.deleteMany({ where: { sessionId: { in: shifts } } })
  await db.inventoryReservation.deleteMany({ where: { orderId: { in: orders } } })
  await db.productDelivery.deleteMany({ where: { orderId: { in: orders } } })
  await db.orderEvent.deleteMany({ where: { orderId: { in: orders } } })
  await db.orderLine.deleteMany({ where: { orderId: { in: orders } } })
  await db.promotionRedemption.deleteMany({ where: { orderId: { in: orders } } })
  await db.promotion.deleteMany({ where: { id: { in: promotions } } })
  await db.order.deleteMany({ where: { id: { in: orders } } })
  await db.storeRegisterSession.deleteMany({ where: { id: { in: shifts } } })
  await db.stockMovement.deleteMany({ where: { productId: { in: products } } })
  await db.locationStock.deleteMany({ where: { productId: { in: products } } })
  await db.stockLocation.deleteMany({ where: { id: { in: places } } })
  await db.product.deleteMany({ where: { id: { in: products } } })
  await db.user.deleteMany({ where: { id: { in: actors } } })
  await db.$disconnect()
})
