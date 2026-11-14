// Synthetic browser fixtures for an explicitly task-owned, disposable database.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt')
const url = new URL(process.env.DATABASE_URL || 'invalid:')
if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || !['postgres', 'localhost', '127.0.0.1'].includes(url.hostname) || !/^\/mobocom_store_bank_[a-z0-9_]+$/.test(url.pathname)) throw Error('TASK_OWNED_BANK_DATABASE_REQUIRED')
const target = process.env.STORE_BANK_FIXTURE_PATH, baseURL = process.env.NEXTAUTH_URL
if (!target || !process.env.NEXTAUTH_SECRET || !baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname) || new URL(baseURL).port !== '3116') throw Error('PRIVATE_FIXTURE_AND_LOCAL3116_REQUIRED')
const db = new PrismaClient()
async function seed() {
  await db.$transaction(async (db) => {
  if (await db.user.count() || await db.product.count() || await db.invoice.count()) throw Error('EMPTY_TASK_DATABASE_REQUIRED')
  const prefix = 'store-bank-qa'
  const user = (name, admin = false) => db.user.create({ data: { email: `${prefix}-${name}@example.invalid`, name: 'کاربر آزمایشی', phone: admin ? '' : '09120000001', passwordHash: 'not-a-password', role: admin ? 'ADMIN' : 'CUSTOMER', ...(admin ? { totpEnabledAt: new Date() } : {}), smsAlerts: false, emailAlerts: false, pushAlerts: false } })
  const staff = await user('staff', true), foreign = await user('foreign')
  const gateway = await db.gateway.create({ data: { name: 'بانک ملت آزمایشی', provider: 'MELLAT', apiKey: '10000001', accountUser: 'synthetic-terminal', secretKey: 'synthetic-password', fiat: 'IRR', currencies: 'IRR,IRT,TMN', active: true, isDefault: true } })
  const product = await db.product.create({ data: { slug: prefix, name: 'کالای پرداخت بانکی آزمایشی', kind: 'PHYSICAL', currency: 'IRT', price: 110000, priceMinor: 110000n, stock: 40, approval: 'APPROVED', variants: { create: { sku: prefix, name: 'مشکی128', price: 110000, priceMinor: 110000n, stock: 40 } } }, include: { variants: true } })
  const variant = product.variants[0]
  const location = await db.stockLocation.findFirst({ where: { isDefault: true } }) || await db.stockLocation.create({ data: { name: 'انبار آزمایشی', isDefault: true, sellsOnline: true } })
  await db.locationStock.create({ data: { locationId: location.id, productId: product.id, variantId: variant.id, itemKey: `${product.id}:${variant.id}`, quantity: 40 } })
  const secure = new URL(baseURL).protocol === 'https:'
  const cookies = async row => [{ name: secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token', secure, url: baseURL, value: await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(row.id), sub: String(row.id), role: row.role, email: row.email, authAt: Date.now() } }) }]
  const cases = []
  for (const [name, mode, surface, referenceId] of [['public-success', 'success', 'public', '777001'], ['dashboard-cancel', 'cancel', 'dashboard', '777002'], ['inquiry-success', 'inquiry', 'public', '777003'], ['uncertain', 'uncertain', 'public', '777004']]) {
    const buyer = await user(name)
    await db.cart.create({ data: { userId: buyer.id, token: `${prefix}-${name}`, lines: { create: { productId: product.id, variantKey: variant.id, quantity: 2 } } } })
    await db.walletAccount.create({ data: { userId: buyer.id, currency: 'IRT', balanceMinor: 0n } })
    cases.push({ name, mode, surface, referenceId, userId: buyer.id, cookies: await cookies(buyer), checkoutPath: surface === 'dashboard' ? '/dashboard/checkout' : '/checkout/cart', product: { id: product.id, variantId: variant.id, quantity: 2, unitMinor: '110000', variantName: variant.name } })
  }
  const baseline = await db.invoice.create({ data: { number: 'BANK-QA-BASELINE', userId: cases[0].userId, subtotal: 110000, subtotalMinor: 110000n, total: 110000, totalMinor: 110000n, currency: 'IRT', gatewayId: gateway.id, providerTxnId: 'BASELINEBANK0001', status: 'UNPAID' } })
  for (const status of ['VOID', 'REFUNDED', 'PAID']) await db.invoice.create({ data: { number: `BANK-QA-${status}`, userId: cases[0].userId, subtotal: 110000, subtotalMinor: 110000n, total: 110000, totalMinor: 110000n, currency: 'IRT', gatewayId: gateway.id, providerTxnId: `CLOSEDBANK${status}`, status, ...(status === 'PAID' || status === 'REFUNDED' ? { paidAt: new Date(), paidAmount: 110000, paidAmountMinor: 110000n } : {}) } })
  for (const [key, value] of Object.entries({ storeEnabled: 'true', 'store.delivery.v1': JSON.stringify({ enabled: false, pickup: { enabled: true, address: 'آدرس ساختگی آزمایشی', instructions: 'فقط آزمون محلی' } }) })) await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  const fixture = { schemaVersion: 1, baseURL, gatewayName: gateway.name, gatewayId: gateway.id, cases, staffCookies: await cookies(staff), foreignCookies: await cookies(foreign), baselineStartPath: `/api/payment/mellat/start?ref=${baseline.providerTxnId}`, closed: ['VOID', 'REFUNDED', 'PAID'].map(status => ({ status, startPath: `/api/payment/mellat/start?ref=CLOSEDBANK${status}`, invoicePath: `/invoice/BANK-QA-${status}` })) }
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(fixture), { mode: 0o600 })
  console.log('Created only synthetic bank checkout fixtures; private sessions not disclosed')
  }, { timeout: 30000 })
}
async function verify() {
  const fixture = JSON.parse(fs.readFileSync(target)), result = JSON.parse(fs.readFileSync(process.argv[3]))
  for (const item of fixture.cases) {
    const receipt = result.cases.find(row => row.name === item.name)
    assert.ok(receipt, `missing browser receipt ${item.name}`)
    const orders = await db.order.findMany({ where: { userId: item.userId }, include: { invoice: true, lines: true, payments: true, productDelivery: true } })
    assert.equal(orders.length, 1); const order = orders[0]
    assert.equal(order.id, receipt.orderId); assert.equal(order.invoice.number, receipt.invoiceNumber)
    assert.equal(order.totalMinor, 220000n); assert.equal(order.invoice.totalMinor, 220000n)
    assert.equal(order.lines.length, 1); assert.equal(order.lines[0].variantId, item.product.variantId)
    assert.equal(order.lines[0].quantity, 2); assert.equal(order.lines[0].unitPriceMinor, 110000n)
    const paid = item.mode === 'success' || item.mode === 'inquiry'
    assert.equal(order.status, paid ? 'PAID' : 'PENDING'); assert.equal(order.invoice.status, paid ? 'PAID' : 'UNPAID')
    assert.equal(order.invoice.paidAmountMinor, paid ? 220000n : 0n)
    assert.equal(await db.payment.count({ where: { orderId: order.id, status: 'CONFIRMED' } }), paid ? 1 : 0)
    assert.equal(await db.walletTx.count({ where: { userId: item.userId } }), 0)
    assert.equal((await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: item.userId, currency: 'IRT' } } })).balanceMinor, 0n)
    const reservations = await db.inventoryReservation.findMany({ where: { orderId: order.id } })
    assert.equal(reservations.length, 1); assert.equal(reservations[0].quantity, 2)
    assert.equal(reservations[0].variantId, item.product.variantId)
    assert.equal(reservations[0].status, paid ? 'CONSUMED' : 'HELD')
  }
  const product = fixture.cases[0].product
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 32)
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: product.variantId } })).stock, 32)
  assert.equal((await db.locationStock.findFirstOrThrow({ where: { productId: product.id, variantId: product.variantId } })).quantity, 32)
  console.log('PASS native bank browser receipts: one exact order per buyer, confirmed payment once, consumed/held reservations, exact product/variant/location stock32, unchanged wallets')
}
;(async () => { if (process.argv[2] === 'seed') await seed(); else if (process.argv[2] === 'assert') await verify(); else throw Error('Expected seed/assert') })().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
