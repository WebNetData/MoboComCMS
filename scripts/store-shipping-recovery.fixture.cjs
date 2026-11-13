// Explicitly isolated shipping fixtures; never use the installed site's database or credentials.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt')
const url = new URL(process.env.DATABASE_URL || 'invalid:')
if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || !['postgres', 'localhost', '127.0.0.1'].includes(url.hostname) || !/^\/mobocom_store_shipping_[a-z0-9_]+$/.test(url.pathname)) throw Error('TASK_OWNED_SHIPPING_DATABASE_REQUIRED')
const target = process.env.STORE_SHIPPING_FIXTURE_PATH, baseURL = process.env.E2E_BASE_URL || 'http://localhost:3115'
if (!target || !process.env.NEXTAUTH_SECRET || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname) || new URL(baseURL).port !== '3115') throw Error('PRIVATE_FIXTURE_PATH_TEST_SECRET_AND_LOCAL3115_REQUIRED')
const db = new PrismaClient()

async function seed() {
  if (await db.user.count() || await db.product.count()) throw Error('EMPTY_TASK_DATABASE_REQUIRED')
  const prefix = 'store-shipping-qa'
  const staff = await db.user.create({ data: { email: `${prefix}-staff@example.invalid`, name: 'کارمند آزمایشی', role: 'ADMIN', totpEnabledAt: new Date(), passwordHash: 'not-a-password', smsAlerts: false, emailAlerts: false, pushAlerts: false } })
  const [buyer, foreign] = await Promise.all(['buyer', 'foreign'].map(name => db.user.create({ data: { email: `${prefix}-${name}@example.invalid`, name: 'خریدار آزمایشی', phone: name === 'buyer' ? '09120000001' : '', passwordHash: 'not-a-password', profileData: JSON.stringify({ firstName: 'خریدار', lastName: 'آزمایشی' }), smsAlerts: false, emailAlerts: false, pushAlerts: false } })))
  const product = await db.product.create({ data: { slug: prefix, name: 'کالای ارسال آزمایشی', kind: 'PHYSICAL', currency: 'IRT', price: 110000, priceMinor: 110000n, stock: 8, weightGrams: 500, approval: 'APPROVED', variants: { create: { sku: prefix, name: 'مشکی 128', attributes: JSON.stringify({ color: 'مشکی', memory: '128' }), price: 110000, priceMinor: 110000n, stock: 8 } } }, include: { variants: true } })
  const variant = product.variants[0]
  const location = await db.stockLocation.findFirst({ where: { isDefault: true } }) || await db.stockLocation.create({ data: { name: 'انبار آزمایشی', isDefault: true, sellsOnline: true } })
  await db.locationStock.create({ data: { locationId: location.id, productId: product.id, variantId: variant.id, itemKey: `${product.id}:${variant.id}`, quantity: variant.stock } })
  await db.cart.create({ data: { userId: buyer.id, token: prefix + '-cart', lines: { create: { productId: product.id, variantKey: variant.id, quantity: 2 } } } })
  await db.walletAccount.create({ data: { userId: buyer.id, currency: 'IRT', balanceMinor: 2000000n } })
  await db.walletTx.create({ data: { userId: buyer.id, currency: 'IRT', amount: 2000000, amountMinor: 2000000n, balanceAfter: 2000000, balanceAfterMinor: 2000000n, type: 'ADMIN_CREDIT', description: 'Synthetic shipping fixture' } })
  const addresses = await Promise.all([
    { title: 'خانه آزمایشی', province: 'تهران', city: 'تهران', isDefault: true },
    { title: 'محل کار آزمایشی', province: 'مازندران', city: 'قائم‌شهر', isDefault: false },
  ].map((row, index) => db.userAddress.create({ data: { ...row, userId: buyer.id, recipient: 'گیرنده آزمایشی', mobile: '09120000001', address: `خیابان ساختگی آزمایشی، کوچه ${index + 1}`, plaque: String(index + 1), unit: '', postalCode: '1345678911' } })))
  const rate = value => ({ baseRial: value, perKgRial: 0, etaMin: 1, etaMax: 3 })
  const carrierSettings = { enabled: true, originProvince: 'تهران', originCity: 'تهران', packagingGrams: 200, defaultWeightGrams: 500, carriers: [
    { id: 'qa-standard', name: 'ارسال عادی آزمایشی', enabled: true, kind: 'post', pricing: 'zone', rates: { city: rate(200000), province: rate(300000), country: rate(400000) }, scheduled: false, trackingUrl: '', note: 'شرکت حمل ساختگی' },
    { id: 'qa-express', name: 'ارسال سریع آزمایشی', enabled: true, kind: 'express', pricing: 'flat', flatRial: 600000, scheduled: false, trackingUrl: '', note: 'شرکت حمل ساختگی' },
  ], freeRules: [{ id: 'qa-free', enabled: true, label: 'ارسال رایگان آزمایشی', minRial: 2000000, area: 'city', carrierIds: ['qa-standard'] }] }
  for (const [key, value] of Object.entries({ storeEnabled: 'true', 'store.delivery.v1': JSON.stringify({ enabled: false, pickup: { enabled: false } }), 'shipping.carriers.v1': JSON.stringify(carrierSettings) })) await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  const cookies = async user => [{ name: 'next-auth.session-token', url: baseURL, value: await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id), sub: String(user.id), role: user.role, email: user.email, authAt: Date.now() } }) }]
  const fixture = { schemaVersion: 1, fixtureprefix: prefix, baseURL, checkoutPath: '/checkout/cart', buyerCookies: await cookies(buyer), staffCookies: await cookies(staff), foreignCookies: await cookies(foreign), buyerUserId: buyer.id, staffUserId: staff.id, walletBeforeMinor: '2000000',
    product: { id: product.id, slug: product.slug, path: `/products/${product.slug}`, variantId: variant.id, variantName: variant.name, quantity: 2, unitMinor: '110000', currency: 'IRT', stock: 8 },
    addresses: addresses.map((row, index) => ({ ...row, ...(index === 0 ? { editTo: { province: 'اصفهان', city: 'اصفهان' }, quoteFeesMinor: { original: { 'qa-standard': '0', 'qa-express': '60000' }, edited: { 'qa-standard': '40000', 'qa-express': '60000' } } } : {}) })),
    carriers: { primary: 'qa-standard', secondary: 'qa-express', primaryName: 'ارسال عادی آزمایشی', secondaryName: 'ارسال سریع آزمایشی', localFee: 20000, countryFee: 40000, secondaryFee: 60000, freeLabel: 'ارسال رایگان آزمایشی' }, trackingCode: 'QA-SHIP-20261114', orderView: '/dashboard/orders/{orderId}', invoicePath: '/invoice/{invoiceNumber}', trackPath: '/track/{waybill}',
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(fixture), { mode: 0o600 })
  console.log('Created only synthetic shipping cart, addresses, carriers, wallet and staff; private session fixture not disclosed')
}

async function verify() {
  const fixture = JSON.parse(fs.readFileSync(target, 'utf8')), result = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
  const paid = result.purchase || result
  const row = await db.order.findUniqueOrThrow({ where: { id: Number(paid.orderId) }, include: { invoice: true, lines: true, payments: true, shipment: true, productDelivery: true } })
  assert.equal(row.userId, fixture.buyerUserId)
  assert.equal(row.status, 'PAID'); assert.equal(row.invoice.status, 'PAID')
  assert.equal(row.productDelivery.status, 'SHIPPED')
  assert.equal(row.lines.length, 1); assert.equal(row.lines[0].variantId, fixture.product.variantId)
  assert.equal(row.lines[0].quantity, 2); assert.equal(row.lines[0].unitPriceMinor, 110000n)
  const meta = JSON.parse(row.meta || '{}')
  const shipping = BigInt(fixture.addresses[0].quoteFeesMinor.edited[fixture.carriers.primary])
  assert.equal(String(paid.shippingMinor), String(shipping))
  assert.equal(paid.carrierId, fixture.carriers.primary)
  assert.equal(row.totalMinor, 220000n + shipping); assert.equal(row.invoice.totalMinor, row.totalMinor)
  assert.equal(meta.shipping.carrierId, fixture.carriers.primary)
  const address = JSON.parse(row.productDelivery.address)
  const receiver = JSON.parse(row.shipment.receiver)
  for (const snapshot of [address, receiver]) {
    assert.equal(snapshot.province, fixture.addresses[0].editTo.province)
    assert.equal(snapshot.city, fixture.addresses[0].editTo.city)
    assert.ok(snapshot.address.includes(fixture.addresses[0].address))
  }
  assert.equal(await db.order.count({ where: { userId: fixture.buyerUserId } }), 1)
  assert.equal(await db.walletTx.count({ where: { userId: fixture.buyerUserId, type: 'PURCHASE' } }), 1)
  const wallet = await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: fixture.buyerUserId, currency: 'IRT' } } })
  assert.equal(wallet.balanceMinor, 2000000n - row.totalMinor)
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: fixture.product.variantId } })).stock, 6)
  assert.ok(row.shipment, 'authorized staff created the shipment')
  assert.equal(row.shipment.trackingCode, fixture.trackingCode)
  assert.equal(row.shipment.waybill, paid.waybill || result.shipment?.waybill)
  console.log('PASS native shipping PostgreSQL: one paid order/invoice/debit after lost response and retry, exact variant/fee/amount/balance/stock, persisted shipment/tracking')
}

(async () => { if (process.argv[2] === 'seed') await seed(); else if (process.argv[2] === 'assert') await verify(); else throw Error('Expected seed or assert') })().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
