// Disposable local database + real application only. No checkout/payment/return response is stubbed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt')
const { chromium, expect: playwrightExpect } = require('@playwright/test')
const { fixtureTLS } = require('./e2e-fixture-tls.cjs')
const expect = playwrightExpect.configure({ timeout: 20_000 })
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3100'
const sessionCookie = new URL(baseURL).protocol === 'https:' ? '__Secure-next-auth.session-token' : 'next-auth.session-token'
if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || !['localhost', '127.0.0.1', 'e2e.mobocom.test'].includes(new URL(baseURL).hostname)) throw Error('DISPOSABLE_LOCAL_TEST_APP_REQUIRED')
if (!process.env.DATABASE_URL || !process.env.NEXTAUTH_SECRET || !process.env.STORE_DELIVERY_KEY) throw Error('TEST_DATABASE_AUTH_AND_DELIVERY_KEY_REQUIRED')
const db = new PrismaClient(), seed = `buyer-return-${Date.now()}`
const tls = fixtureTLS(baseURL)
let browser, admin, settings, product, buyer, role, orderRole, order
let customerPage
const contexts = []
async function identity(user) {
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id), sub: String(user.id), role: user.role, email: user.email, authAt: Date.now() } })
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { origin: baseURL } })
  await context.addCookies([{ name: sessionCookie, value: token, url: baseURL }])
  contexts.push(context)
  return context
}
async function json(response, expected = 200) {
  const body = await response.json()
  assert.equal(response.status(), expected, body.error || `unexpected response: ${response.status()}`)
  return body
}
async function main() {
  role = await db.role.create({ data: { name: seed, permissions: 'dashboard.view,cms.posts' } })
  orderRole = await db.role.create({ data: { name: `${seed}-orders`, permissions: 'dashboard.view,orders.manage' } })
  const users = await Promise.all(['buyer', 'other', 'admin', 'wrong-section', 'order-staff'].map(name => db.user.create({ data: {
    email: `${seed}-${name}@example.invalid`, passwordHash: 'fixture-not-a-password',
    ...(!['buyer', 'other'].includes(name) ? { role: 'ADMIN', totpEnabledAt: new Date(), ...(name === 'wrong-section' ? { roleId: role.id } : name === 'order-staff' ? { roleId: orderRole.id } : {}) } : {}),
  } })))
  buyer = users[0]
  product = await db.product.create({ data: { slug: seed, name: 'کارت آزمایشی مرجوعی', price: 10, priceMinor: 1000n, currency: 'USD', kind: 'VIRTUAL', stock: 0, approval: 'APPROVED' } })
  browser = await chromium.launch({ headless: true, args: tls.args, ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}) })
  const [customer, other, full, wrong, orderStaff] = await Promise.all(users.map(identity)); admin = full
  for (const context of [customer, other]) {
    const completed = await json(await context.request.post('/api/profile/completion', { data: { firstName: 'کاربر', lastName: 'آزمایشی' } }))
    assert.equal(completed.needsCompletion, false, 'customers complete the same required profile as real members')
  }
  settings = (await json(await admin.request.get('/api/admin/store/returns'))).settings
  await json(await admin.request.put('/api/admin/store/returns', { data: { settings: { ...settings, enabled: true, codeReturnDays: 7 } } }))
  await json(await admin.request.post('/api/admin/wallet', { data: { userId: buyer.id, amount: 50, description: seed } }))
  const pool = `/api/admin/store/products/${product.id}/codes`
  await json(await admin.request.post(pool, { data: { action: 'mode', mode: 'CODES' } }))
  const code = `MBC-${Date.now()}-FIRST`
  assert.equal((await json(await admin.request.post(pool, { data: { action: 'add', text: `${code}\nMBC-${Date.now()}-SECOND` } }))).added, 2)
  const page = await customer.newPage(), errors = []
  customerPage = page
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text().replace(/nonce-[A-Za-z0-9+/=]+/g, 'nonce-[redacted]')) })
  await page.goto(`/products/${product.slug}`, { waitUntil: 'domcontentloaded', timeout: 240_000 })
  const added = page.waitForResponse(r => new URL(r.url()).pathname === '/api/cart' && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'افزودن به سبد خرید', exact: true }).click()
  assert.equal((await added).status(), 200)
  await page.goto('/checkout/cart', { waitUntil: 'domcontentloaded', timeout: 240_000 })
  const pay = page.getByRole('button', { name: 'ثبت سفارش و پرداخت از کیف پول', exact: true })
  await expect(pay).toBeEnabled()
  const [checkout] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname === '/api/cart/checkout' && r.request().method() === 'POST', { timeout: 120_000 }),
    pay.click(),
  ])
  assert.equal(checkout.status(), 200)
  const placed = await checkout.json(), key = checkout.request().headers()['idempotency-key']
  assert.equal(placed.paid, true); assert.ok(key)
  order = await db.order.findUniqueOrThrow({ where: { id: placed.orderId }, include: { invoice: true, lines: true, payments: true } })
  assert.equal(order.userId, buyer.id); assert.equal(order.status, 'PAID'); assert.equal(order.provider, 'wallet')
  assert.equal(order.lines.length, 1); assert.equal(order.lines[0].unitPriceMinor, 1000n); assert.equal(order.lines[0].quantity, 1)
  assert.equal(order.invoice.status, 'PAID'); assert.equal(order.invoice.totalMinor, order.totalMinor)
  assert.equal(order.invoice.walletAppliedMinor, order.totalMinor)
  assert.equal((await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: buyer.id, currency: 'USD' } } })).balanceMinor, 5000n - order.totalMinor)
  const replay = await json(await customer.request.post('/api/cart/checkout', { headers: { 'idempotency-key': key }, data: {} }))
  assert.equal(replay.orderId, order.id); assert.equal(replay.replayed, true)
  assert.equal(await db.order.count({ where: { idempotencyKey: key } }), 1)
  assert.equal(await db.walletTx.count({ where: { userId: buyer.id, type: 'PURCHASE' } }), 1)
  await expect.poll(async () => (await db.productDelivery.findUnique({ where: { orderId: order.id } }))?.status, { timeout: 120_000 }).toBe('DELIVERED')
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 1)
  const privatePath = `/dashboard/orders/${order.id}`, returnPath = `/api/store/orders/${order.id}/returns`
  await page.goto(privatePath, { waitUntil: 'domcontentloaded', timeout: 240_000 })
  page.on('response', async response => {
    if (new URL(response.url()).pathname === returnPath && response.request().method() === 'GET') {
      const data = await response.json().catch(() => null)
      console.log('Browser return response:', JSON.stringify({ status: response.status(), eligibility: data?.eligibility || null }))
    }
  })
  await expect(page.locator('.sx-my-codes')).toContainText(code)
  const deniedPage = await other.request.get(privatePath), deniedHtml = await deniedPage.text()
  // App Router's streamed notFound response may already have status 200. It must
  // still render the noindex not-found outcome, with no private order or code.
  assert.ok([200, 404].includes(deniedPage.status()))
  if (deniedPage.status() === 200) assert.match(deniedHtml, /name="robots"[^>]+content="[^"]*noindex/)
  assert.ok(!deniedHtml.includes(code), 'another customer never receives the delivered secret')
  assert.ok(!deniedHtml.includes('sx-my-detail'), 'another customer never receives the private order view')
  assert.equal((await other.request.get(returnPath)).status(), 404)
  assert.equal((await wrong.request.get('/api/admin/store/returns')).status(), 403)
  assert.equal((await other.request.post(returnPath, { multipart: { kind: 'RETURN', reason: 'code_invalid' } })).status(), 404)
  const guest = await browser.newContext({ baseURL, ignoreHTTPSErrors: true }); contexts.push(guest)
  assert.equal((await guest.request.get(returnPath)).status(), 401)
  const eligibility = await json(await customer.request.get(returnPath))
  assert.equal(eligibility.eligibility.return, true, `return eligibility: ${JSON.stringify(eligibility.eligibility)}`)
  await page.getByRole('button', { name: 'درخواست مرجوعی کالا', exact: true }).click()
  await page.locator('.rp-reasons input[value="code_invalid"]').check()
  const [submitted] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname === returnPath && r.request().method() === 'POST'),
    page.locator('.rp-form').getByRole('button', { name: 'ثبت درخواست مرجوعی', exact: true }).click(),
  ])
  assert.equal(submitted.status(), 201)
  const request = await submitted.json(), staffPath = `/api/admin/store/returns/${request.id}`
  assert.equal(request.status, 'REQUESTED')
  assert.equal((await wrong.request.post(staffPath, { data: { action: 'refund' } })).status(), 403)
  await json(await orderStaff.request.post(staffPath, { data: { action: 'approve', note: seed } }))
  await json(await orderStaff.request.post(staffPath, { data: { action: 'refund', restock: true, note: seed } }))
  assert.equal((await orderStaff.request.post(staffPath, { data: { action: 'refund', restock: true } })).status(), 409)
  const refunded = await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } })
  assert.equal(refunded.status, 'REFUNDED'); assert.equal(refunded.refundMinor, order.totalMinor); assert.ok(refunded.walletTxId)
  assert.equal((await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: buyer.id, currency: 'USD' } } })).balanceMinor, 5000n)
  assert.equal(await db.walletTx.count({ where: { userId: buyer.id, type: 'REFUND' } }), 1)
  const old = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { invoice: true } })
  assert.equal(old.status, 'REFUNDED'); assert.equal(old.totalMinor, order.totalMinor); assert.equal(old.invoice.totalMinor, order.invoice.totalMinor)
  const returned = await db.productDigitalCode.findFirstOrThrow({ where: { orderId: order.id } })
  assert.ok(returned.returnedAt); assert.equal(returned.returnId, request.id)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 1, 'a read/returned code is never resold')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.rp-refund')).toBeVisible()
  await expect(page.locator('.rp')).toContainText('مبلغ این سفارش قبلاً کامل برگشت داده شده است.')
  await expect(page.locator('.rp')).not.toContainText('سفارش پرداخت‌نشده')
  await expect(page.locator('.sx-my-codes')).toHaveCount(0)
  const out = process.env.E2E_ARTIFACT_DIR || '.mobocom/buyer-return-results'; fs.mkdirSync(out, { recursive: true })
  for (const theme of ['light', 'dark']) {
    await customer.addCookies([{ name: 'theme', value: theme, url: baseURL }]); await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.rp-refund')).toBeVisible(); await page.screenshot({ path: path.join(out, `${theme}-1440.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(out, 'dark-390.png'), fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
  assert.deepEqual(errors, [])
  console.log('Real buyer return: wallet checkout/replay, encrypted-code delivery/privacy, customer return, staff approval/refund/replay, preserved amounts and voided code; light/dark/mobile passed')
}
async function cleanup() {
  await Promise.all(contexts.flatMap(context => context.pages()).map(page => page.close()))
  if (settings && admin) await json(await admin.request.put('/api/admin/store/returns', { data: { settings } }))
  const users = await db.user.findMany({ where: { email: { startsWith: `${seed}-` } }, select: { id: true } }), ids = users.map(u => u.id)
  const orders = await db.order.findMany({ where: { userId: { in: ids } }, select: { id: true } }), orderIds = orders.map(o => o.id)
  await db.productDigitalCode.deleteMany({ where: { productId: product?.id || -1 } })
  await db.returnRequest.deleteMany({ where: { userId: { in: ids } } }); await db.payment.deleteMany({ where: { orderId: { in: orderIds } } })
  await db.invoice.deleteMany({ where: { userId: { in: ids } } }); await db.walletTx.deleteMany({ where: { userId: { in: ids } } })
  await db.walletAccount.deleteMany({ where: { userId: { in: ids } } }); await db.inventoryReservation.deleteMany({ where: { orderId: { in: orderIds } } })
  await db.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } }); await db.productDelivery.deleteMany({ where: { orderId: { in: orderIds } } })
  await db.orderLine.deleteMany({ where: { orderId: { in: orderIds } } }); await db.order.deleteMany({ where: { id: { in: orderIds } } })
  await db.cart.deleteMany({ where: { userId: { in: ids } } }); await db.auditLog.deleteMany({ where: { actorUserId: { in: ids } } })
  if (product) await db.product.deleteMany({ where: { id: product.id, slug: seed } })
  await db.user.deleteMany({ where: { id: { in: ids }, email: { startsWith: `${seed}-` } } })
  if (role) await db.role.deleteMany({ where: { id: role.id, name: seed } })
  if (orderRole) await db.role.deleteMany({ where: { id: orderRole.id, name: `${seed}-orders` } })
}
main().catch(async error => {
  console.error(error.message); process.exitCode = 1
  if (customerPage && !customerPage.isClosed()) {
    console.error('Buyer page state:', JSON.stringify(await customerPage.evaluate(() => ({ path: location.pathname, returnPanel: document.querySelectorAll('.rp').length, returnActions: document.querySelectorAll('.rp-actions button').length }))))
    const out = process.env.E2E_ARTIFACT_DIR || '.mobocom/buyer-return-results'; fs.mkdirSync(out, { recursive: true })
    await customerPage.screenshot({ path: path.join(out, 'failed-buyer-page.png'), fullPage: true })
  }
}).finally(async () => {
  try { await cleanup() } catch (error) { console.error('Fixture cleanup failed:', error.message); process.exitCode = 1 }
  finally { await browser?.close(); await db.$disconnect() }
})
