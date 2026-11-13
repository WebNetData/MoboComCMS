// Synthetic fixtures only. Never point this helper at the owner's database.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')

const database = new URL(process.env.DATABASE_URL || 'invalid:')
if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || !['postgres', 'localhost', '127.0.0.1'].includes(database.hostname) || !/^\/mobocom_store_mobile_[a-z0-9_]+$/.test(database.pathname)) throw Error('TASK_OWNED_POSTGRESQL_REQUIRED')
const target = process.env.STORE_MOBILE_FIXTURE_PATH
if (!target || !process.env.NEXTAUTH_SECRET) throw Error('EXPLICIT_PRIVATE_FIXTURE_PATH_AND_TEST_SECRET_REQUIRED')
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3114'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw Error('LOCAL_TEST_APP_REQUIRED')
const db = new PrismaClient()

async function seed() {
  if (await db.user.count() || await db.product.count()) throw Error('EMPTY_TASK_DATABASE_REQUIRED')
  const prefix = 'store-mobile-qa'
  // The normal installer requires an owner to exist; browsers still act only as the shoppers below.
  await db.user.create({ data: { email: `${prefix}-owner@example.invalid`, name: 'مدیر آزمایشی', role: 'ADMIN', passwordHash: 'not-a-login-password' } })
  const fields = [
    { key: 'color', label: 'رنگ', kind: 'color', options: ['مشکی', 'سفید'], required: true, variant: true },
    { key: 'memory', label: 'حافظه', kind: 'select', options: ['128', '256'], required: true, variant: true },
  ]
  const group = await db.productAttributeGroup.create({ data: { name: 'مشخصات گوشی آزمایشی', appliesTo: 'PHYSICAL', fields: JSON.stringify(fields) } })
  const category = await db.productCategory.create({ data: { name: 'گوشی‌های آزمایشی', slug: prefix, kind: 'PHYSICAL', attributeGroupId: group.id } })
  const brands = await Promise.all(['a', 'b'].map((suffix, index) => db.productBrand.create({ data: { name: `برند آزمایشی ${index + 1}`, slug: `${prefix}-${suffix}` } })))
  const users = await Promise.all(['buyer', 'foreign'].map(suffix => db.user.create({ data: { email: `${prefix}-${suffix}@example.invalid`, name: 'خریدار آزمایشی', phone: suffix === 'buyer' ? '09120000001' : '', smsAlerts: false, emailAlerts: false, pushAlerts: false, passwordHash: 'not-a-login-password', profileData: JSON.stringify({ firstName: 'خریدار', lastName: 'آزمایشی' }) } })))
  const product = await db.product.create({ data: {
    name: 'گوشی آزمایشی یک', slug: `${prefix}-phone`, categoryId: category.id, brandId: brands[0].id,
    kind: 'PHYSICAL', currency: 'IRT', price: 100000, priceMinor: 100000n, stock: 8, soldCount: 20,
    approval: 'APPROVED', variants: { create: [
      { sku: `${prefix}-black128`, name: 'مشکی 128', attributes: JSON.stringify({ color: 'مشکی', memory: '128' }), price: 110000, priceMinor: 110000n, stock: 6 },
      { sku: `${prefix}-white128`, name: 'سفید 128', attributes: JSON.stringify({ color: 'سفید', memory: '128' }), price: 120000, priceMinor: 120000n, stock: 2 },
      { sku: `${prefix}-black256`, name: 'مشکی 256', attributes: JSON.stringify({ color: 'مشکی', memory: '256' }), price: 130000, priceMinor: 130000n, stock: 0 },
    ] },
  }, include: { variants: true } })
  const other = await db.product.create({ data: { name: 'گوشی آزمایشی دو', slug: `${prefix}-phone-two`, categoryId: category.id, brandId: brands[1].id, kind: 'PHYSICAL', currency: 'IRT', price: 300000, priceMinor: 300000n, stock: 4, approval: 'APPROVED', variants: { create: { sku: `${prefix}-white256`, name: 'سفید 256', attributes: JSON.stringify({ color: 'سفید', memory: '256' }), price: 300000, priceMinor: 300000n, stock: 4 } } }, include: { variants: true } })
  const location = await db.stockLocation.findFirst({ where: { isDefault: true } }) || await db.stockLocation.create({ data: { name: 'انبار آزمایشی', isDefault: true, sellsOnline: true } })
  for (const row of [product, other]) for (const variant of row.variants) await db.locationStock.create({ data: { locationId: location.id, productId: row.id, variantId: variant.id, itemKey: `${row.id}:${variant.id}`, quantity: variant.stock } })
  await db.walletAccount.create({ data: { userId: users[0].id, currency: 'IRT', balanceMinor: 2000000n } })
  await db.walletTx.create({ data: { userId: users[0].id, currency: 'IRT', amount: 2000000, amountMinor: 2000000n, balanceAfter: 2000000, balanceAfterMinor: 2000000n, type: 'ADMIN_CREDIT', description: 'Synthetic test fixture credit' } })
  for (const [key, value] of Object.entries({ storeEnabled: 'true', 'store.delivery.v1': JSON.stringify({ enabled: false, pickup: { enabled: true, address: 'نشانی فروشگاه آزمایشی', instructions: 'فقط دادهٔ آزمایشی' } }) })) await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  const cookies = async user => [{ name: 'next-auth.session-token', value: await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id), sub: String(user.id), email: user.email, role: user.role, authAt: Date.now() } }), url: baseURL }]
  const variant = product.variants.find(row => row.sku.endsWith('black128'))
  const applied = { category: category.slug, kind: 'PHYSICAL', q: 'گوشی', sort: 'bestselling' }
  const fixture = {
    schemaVersion: 1, baseURL, buyerCookies: await cookies(users[0]), foreignCookies: await cookies(users[1]),
    category: { url: '/products?' + new URLSearchParams({ ...applied, page: '4' }), applied, brands: brands.map(row => row.slug), specs: [{ key: 'color', values: ['مشکی', 'سفید'] }, { key: 'memory', values: ['128', '256'] }], price: { min: 110000, max: 300000 }, initialPage: 4, zeroResult: { brand: brands[1].slug, key: 'color', value: 'مشکی' } },
    purchase: { productPath: '/products/' + product.slug, productSlug: product.slug, productId: product.id, buyerUserId: users[0].id, variantId: variant.id, variantName: variant.name, variantAxes: [{ label: 'رنگ', value: 'مشکی' }, { label: 'حافظه', value: '128' }], quantity: 2, unitMinor: String(variant.priceMinor), currency: 'IRT', walletBeforeMinor: '2000000', stock: variant.stock },
    orderView: '/dashboard/orders/{orderId}',
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(fixture), { mode: 0o600 })
  console.log('Created task-only category, variants, shopper accounts and synthetic wallet; private fixture written without disclosure')
}

async function verify() {
  const fixture = JSON.parse(fs.readFileSync(target, 'utf8'))
  const resultFile = process.argv[3]
  if (!resultFile) throw Error('BROWSER_RESULT_REQUIRED')
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
  const orderId = result.orderId || result.purchase?.orderId
  assert.ok(orderId, 'browser supplied the persisted order identity')
  const order = await db.order.findUniqueOrThrow({ where: { id: Number(orderId) }, include: { invoice: true, lines: true, payments: true } })
  const purchase = fixture.purchase
  assert.equal(order.userId, purchase.buyerUserId)
  assert.equal(order.status, 'PAID')
  assert.equal(order.invoice.status, 'PAID')
  assert.equal(order.lines.length, 1)
  assert.equal(order.lines[0].variantId, purchase.variantId)
  assert.equal(order.lines[0].quantity, purchase.quantity)
  assert.equal(order.lines[0].unitPriceMinor, BigInt(purchase.unitMinor))
  assert.equal(order.totalMinor, BigInt(purchase.unitMinor) * BigInt(purchase.quantity))
  assert.equal(order.invoice.totalMinor, order.totalMinor)
  assert.equal(await db.order.count({ where: { userId: purchase.buyerUserId } }), 1)
  assert.equal(await db.walletTx.count({ where: { userId: purchase.buyerUserId, type: 'PURCHASE' } }), 1)
  const wallet = await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: purchase.buyerUserId, currency: purchase.currency } } })
  assert.equal(wallet.balanceMinor, BigInt(purchase.walletBeforeMinor) - order.totalMinor)
  const stock = await db.productVariant.findUniqueOrThrow({ where: { id: purchase.variantId } })
  assert.equal(stock.stock, purchase.stock - purchase.quantity)
  console.log('PASS native PostgreSQL: one owned paid order/invoice, exact selected variant/quantity/amount, one wallet debit and exact remaining stock')
}

(async () => { if (process.argv[2] === 'seed') await seed(); else if (process.argv[2] === 'assert') await verify(); else throw Error('Expected seed or assert') })().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
