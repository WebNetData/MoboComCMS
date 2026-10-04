// Local PostgreSQL purchase evidence; no payment/provider calls, owned fixtures removed.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), seed = `fbt-${Date.now()}`, users = [], products = [], orders = [], now = new Date()
let settingsBefore, settingsRead = false, admin, browser
async function publicChecks() {
  const { encode } = require('next-auth/jwt'), { chromium } = require('playwright'), path = require('node:path')
  const base = 'http://localhost:3000', key = 'store.merchandising.v1'
  settingsBefore = await db.setting.findUnique({ where: { key } }); settingsRead = true
  admin = await db.user.create({ data: { email: `${seed}-admin@example.invalid`, passwordHash: 'test-only', role: 'ADMIN', totpEnabledAt: new Date() } })
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(admin.id), sub: String(admin.id), email: admin.email, role: admin.role, authAt: Date.now() } })
  const post = async (body, auth = true) => fetch(base + '/api/admin/store/settings', { method: 'POST', headers: { origin: base, 'content-type': 'application/json', ...(auth ? { cookie: `next-auth.session-token=${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) })
  const save = async body => { const response = await post(body); assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).settings }
  assert.equal((await post({ showFrequentlyBoughtTogether: true }, false)).status, 403)
  const url = base + `/api/products/${products[0].slug}/tabs?tab=frequently-bought`
  await save({ showFrequentlyBoughtTogether: false })
  assert.equal((await fetch(url)).status, 404)
  await save({ showFrequentlyBoughtTogether: true, frequentlyBoughtDays: 90, frequentlyBoughtMinimumBuyers: 3 })
  assert.equal((await save({})).showFrequentlyBoughtTogether, true)
  const response = await fetch(url); assert.equal(response.status, 200)
  const json = await response.json(); assert.deepEqual(json.items.map(row => row.id), [products[1].id])
  assert.deepEqual(Object.keys(json.items[0]).sort(), ['id', 'image', 'name', 'nameEn', 'slug'])
  if (process.env.HURL_BIN) {
    const { spawn } = require('node:child_process')
    await new Promise((resolve, reject) => {
      const child = spawn(process.env.HURL_BIN, ['--test', '--variable', `base_url=${base}`, '--variable', `slug=${products[0].slug}`, '--variable', `target_id=${products[1].id}`, '--variable', `target_slug=${products[1].slug}`, 'docs/specs/store-product-relationships/frequently-bought.hurl'], { stdio: 'inherit' })
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`Hurl exited ${code}`)))
    })
  }
  await save({ frequentlyBoughtMinimumBuyers: 4 }); assert.deepEqual((await (await fetch(url)).json()).items, [])
  await save({ frequentlyBoughtMinimumBuyers: 3 })
  await db.product.update({ where: { id: products[0].id }, data: { approval: 'PENDING' } }); assert.equal((await fetch(url)).status, 404)
  await db.product.update({ where: { id: products[0].id }, data: { approval: 'APPROVED' } })
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ locale: 'fa-IR', timezoneId: 'Asia/Tehran' }), page = await context.newPage()
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: base }])
  await page.goto(base + '/admin/store/settings', { waitUntil: 'domcontentloaded', timeout: 60000 })
  const checkbox = page.getByLabel('نمایش محصولات خریداری‌شده همراه هم', { exact: true })
  await checkbox.waitFor({ timeout: 60000 })
  assert.equal(await checkbox.isChecked(), true)
  await checkbox.uncheck()
  const saving = page.waitForResponse(response => response.url().endsWith('/api/admin/store/settings') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'ذخیره', exact: true }).click(); assert.equal((await saving).status(), 200)
  await page.reload({ waitUntil: 'domcontentloaded' }); await checkbox.waitFor(); assert.equal(await checkbox.isChecked(), false)
  await save({ showFrequentlyBoughtTogether: true })
  for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
    await context.addCookies([{ name: 'theme', value: theme, url: base }]); await page.setViewportSize({ width, height: 900 })
    const deadline = Date.now() + 45000
    do {
      await page.goto(base + `/products/${products[0].slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      if (await page.getByRole('tab', { name: 'خریداری‌شده همراه هم', exact: true }).count()) break
      await page.waitForTimeout(1000)
    } while (Date.now() < deadline)
    const tab = page.getByRole('tab', { name: 'خریداری‌شده همراه هم', exact: true })
    await tab.click(); const card = page.locator('.store-related-card').filter({ hasText: products[1].name }); await card.waitFor()
    assert.equal(await tab.getAttribute('aria-selected'), 'true')
    assert.equal(await card.getAttribute('href'), `/products/${products[1].slug}`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme}/${width}: overflow`)
    await tab.focus(); await page.keyboard.press('Home'); assert.equal(await page.getByRole('tab', { name: 'توضیحات', exact: true }).getAttribute('aria-selected'), 'true')
    await tab.click(); await page.locator('.store-tab-panel').screenshot({ path: path.join('.mobocom', `frequently-bought-${theme}-${width}.png`) })
  }
  await save({ frequentlyBoughtMinimumBuyers: 4 })
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('tab', { name: 'خریداری‌شده همراه هم', exact: true }).click()
  await page.locator('.store-panel-empty').filter({ hasText: 'موردی یافت نشد.' }).waitFor()
  await save({ frequentlyBoughtMinimumBuyers: 3 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  let attempt = 0, release
  const hold = new Promise(resolve => { release = resolve })
  await page.route('**/api/products/*/tabs?tab=frequently-bought*', async route => {
    if (++attempt === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"injected unavailable"}' })
    else { await hold; await route.continue() }
  })
  await page.getByRole('tab', { name: 'خریداری‌شده همراه هم', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'این بخش بارگذاری نشد.' }).waitFor()
  await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click()
  await page.locator('.store-loading').waitFor(); release()
  await page.locator('.store-related-card').filter({ hasText: products[1].name }).waitFor()
  await page.unroute('**/api/products/*/tabs?tab=frequently-bought*')
  await save({ showFrequentlyBoughtTogether: false }); assert.equal((await fetch(url)).status, 404)
  console.log('Actual co-purchase API/Admin auth, omission, save/reload, threshold, publication, pause/privacy and RTL dark/light390/1440 product/browser/keyboard/empty/error/loading/retry checks passed')
}
const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync('src/modules/recommendations/server/product-purchases.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
new Function('require', 'module', 'exports', code)(name => { if (name === '@/platform/database/prisma') return { db }; throw Error(name) }, mod, mod.exports)
async function order(user, target, options = {}) {
  const row = await db.order.create({ data: { userId: user.id, totalAmount: 2, totalMinor: 200n, status: options.status || 'PAID', createdAt: options.at || now } }); orders.push(row.id)
  await db.invoice.create({ data: { number: `${seed}-${row.id}`, orderId: row.id, userId: user.id, status: options.invoice || 'PAID', totalMinor: 200n } })
  await db.orderLine.createMany({ data: [
    { orderId: row.id, line: 0, productId: products[0].id, name: seed, quantity: options.sourceZero ? 0 : 1, totalMinor: options.sourceFree ? 0n : 100n, sellerStatus: options.sourceCancelled ? 'CANCELLED' : '' },
    { orderId: row.id, line: 1, productId: target.id, name: seed, quantity: options.zero ? 0 : 1, totalMinor: options.free ? 0n : 100n, sellerStatus: options.cancelled ? 'CANCELLED' : '' },
    { orderId: row.id, line: 2, productId: target.id, name: seed, quantity: options.zero ? 0 : 1, totalMinor: options.free ? 0n : 100n, sellerStatus: options.cancelled ? 'CANCELLED' : '' },
  ] })
  if (options.returned) await db.returnRequest.create({ data: { number: `${seed}-return-${row.id}`, orderId: row.id, userId: user.id, status: 'APPROVED' } })
}
async function main() {
  for (let i = 0; i < 3; i++) users.push(await db.user.create({ data: { email: `${seed}-${i}@example.invalid`, passwordHash: 'test-only' } }))
  for (let i = 0; i < 10; i++) products.push(await db.product.create({ data: { slug: `${seed}-${i}`, name: `${seed}-${i}`, price: 1, priceMinor: 100n, approval: i === 3 ? 'PENDING' : 'APPROVED' } }))
  for (const user of users) {
    await order(user, products[1]); await order(user, products[1])
    await order(user, products[3]); await order(user, products[4], { zero: true }); await order(user, products[5], { cancelled: true })
    await order(user, products[6], { status: 'PENDING' }); await order(user, products[7], { at: new Date(now.getTime() - 400 * 86400000) })
    await order(user, products[8], { returned: true }); await order(user, products[9], { invoice: 'REFUNDED' })
  }
  for (let i = 0; i < 5; i++) await order(users[0], products[2])
  for (const user of users.slice(1)) for (const options of [{ sourceCancelled: true }, { sourceZero: true }, { sourceFree: true }, { free: true }]) await order(user, products[2], options)
  await order(users[1], products[2], { at: new Date(now.getTime() + 86400000) }); await order(users[2], products[2], { at: new Date(now.getTime() + 86400000) })
  const read = mod.exports.frequentlyBoughtProductIds
  assert.deepEqual(await read(products[0].id, { days: 90, minimumBuyers: 3 }, now), [products[1].id])
  assert.deepEqual(await read(products[0].id, { days: 90, minimumBuyers: 4 }, now), [])
  assert.deepEqual(await read(products[1].id, { days: 90, minimumBuyers: 3 }, now), [products[0].id])
  if (process.env.FBT_BROWSER === '1') await publicChecks()
  console.log('Real PostgreSQL co-purchases: same-order, distinct buyers, duplicate lines/orders, private/zero/cancelled/unpaid/refunded/returned/old/future exclusions and threshold passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await browser?.close()
    if (settingsRead) { const key = 'store.merchandising.v1'; if (settingsBefore) await db.setting.upsert({ where: { key }, create: { key, value: settingsBefore.value }, update: { value: settingsBefore.value } }); else await db.setting.deleteMany({ where: { key } }) }
    await db.returnRequest.deleteMany({ where: { orderId: { in: orders } } })
    await db.invoice.deleteMany({ where: { orderId: { in: orders } } })
    await db.order.deleteMany({ where: { id: { in: orders } } })
    await db.product.deleteMany({ where: { id: { in: products.map(row => row.id) } } })
    await db.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } })
    if (admin) await db.user.delete({ where: { id: admin.id } })
  } finally { await db.$disconnect() }
})
