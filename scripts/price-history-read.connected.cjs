// Docker-local PostgreSQL/API/browser checks; restore settings and remove only namespaced fixtures.
const assert = require('node:assert/strict'), path = require('node:path')
const { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt'), { chromium } = require('playwright')
const db = new PrismaClient(), base = 'http://localhost:3000', seed = `phr${Date.now().toString(36)}`, key = 'store.merchandising.v1'
let product, foreign, admin, original, captured = false, browser
async function main() {
  original = await db.setting.findUnique({ where: { key } }); captured = true
  product = await db.product.create({ data: { slug: seed, name: 'محصول آزمایشی تاریخچه', active: true, approval: 'APPROVED', currency: 'IRT', price: 250000, priceMinor: 250000n } })
  foreign = await db.product.create({ data: { slug: `${seed}-foreign`, name: seed, active: true, approval: 'APPROVED' } })
  const variant = await db.productVariant.create({ data: { productId: product.id, sku: `${seed}-blue`, name: 'مدل آبی', price: 400000, priceMinor: 400000n, active: true } })
  const inactive = await db.productVariant.create({ data: { productId: product.id, sku: `${seed}-inactive`, name: 'inactive', active: false } })
  const other = await db.productVariant.create({ data: { productId: foreign.id, sku: `${seed}-other`, name: 'other', active: true } })
  const now = Date.now()
  await db.productPricePoint.createMany({ data: Array.from({ length: 125 }, (_, i) => ({ productId: product.id, variantId: 0, amountMinor: BigInt(200000 + i * 400), currency: 'IRT', recordedAt: new Date(now - (125 - i) * 60000) })) })
  await db.productPricePoint.createMany({ data: [
    { productId: product.id, variantId: 0, amountMinor: 999999n, currency: 'USD', recordedAt: new Date(now - 60000) },
    { productId: product.id, variantId: 0, amountMinor: 777777n, currency: 'IRT', recordedAt: new Date(now - 31 * 86400000) },
    { productId: product.id, variantId: 0, amountMinor: 888888n, currency: 'IRT', recordedAt: new Date(now + 86400000) },
    { productId: product.id, variantId: variant.id, amountMinor: 400000n, currency: 'IRT', recordedAt: new Date(now - 60000) },
  ] })
  admin = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only', role: 'ADMIN' } })
  const token = await encode({ token: { uid: String(admin.id), sub: String(admin.id), email: admin.email, role: admin.role, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  const save = async body => {
    const response = await fetch(base + '/api/admin/store/settings', { method: 'POST', headers: { cookie: `next-auth.session-token=${token}`, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) })
    assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).settings
  }
  const history = variantId => fetch(`${base}/api/products/${seed}/tabs?tab=price-history${variantId === undefined ? '' : `&variantId=${variantId}`}`, { signal: AbortSignal.timeout(60000) })
  await save({ showPriceHistory: false, priceHistoryDays: 30 }); assert.equal((await history()).status, 404)
  await save({ showPriceHistory: true, priceHistoryDays: 30 })
  const preserved = await save({ offerTitle: 'تست تنظیمات' }); assert.equal(preserved.showPriceHistory, true); assert.equal(preserved.priceHistoryDays, 30)
  assert.equal((await save({ priceHistoryDays: 999 })).priceHistoryDays, 30)
  assert.equal((await fetch(base + '/api/admin/store/settings', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: '{}' })).status, 403)
  const result = await (await history()).json()
  assert.equal(result.items.length, 120); assert.equal(result.truncated, true); assert.equal(result.currency, 'IRT'); assert.equal(result.days, 30)
  assert.equal(result.items[0].amountMinor, '202000'); assert.equal(result.items.at(-1).amountMinor, '249600')
  assert.ok(result.items.every((row, i) => !i || row.recordedAt >= result.items[i - 1].recordedAt))
  if (process.env.HURL_BIN) {
    const check = require('node:child_process').spawnSync(process.env.HURL_BIN, ['--test', '--variable', `base=${base}`, '--variable', `slug=${seed}`, 'docs/specs/product-price-history/history.hurl'], { encoding: 'utf8' })
    assert.equal(check.status, 0, check.stdout + check.stderr)
    console.log('Hurl product history public and invalid-variant scenarios passed.')
  }
  const selected = await (await history(variant.id)).json(); assert.equal(selected.items.length, 1); assert.equal(selected.items[0].amountMinor, '400000')
  for (const value of [inactive.id, other.id, '-1', '1.5', 'abc', '9007199254740992', '']) assert.equal((await history(value)).status, 404, `invalid variant ${value}`)
  await db.product.update({ where: { id: product.id }, data: { approval: 'PENDING' } }); assert.equal((await history()).status, 404)
  await db.product.update({ where: { id: product.id }, data: { approval: 'APPROVED' } })
  if (process.env.PRICE_HISTORY_SKIP_BROWSER === '1') { console.log('Price history PostgreSQL/API checks passed; browser explicitly skipped in this run.'); return }
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext(), page = await context.newPage()
  const tab = () => page.getByRole('tab', { name: 'تاریخچهٔ قیمت' })
  for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
    await context.addCookies([{ name: 'theme', value: theme, url: base }]); await page.setViewportSize({ width, height: 900 })
    await page.goto(`${base}/products/${seed}#store-tab-price-history`, { waitUntil: 'networkidle' })
    const visibleDeadline = Date.now() + 35000
    while (!await page.locator('.store-history-table').count() && Date.now() < visibleDeadline) {
      await page.waitForTimeout(1000); await page.reload({ waitUntil: 'networkidle' })
    }
    await page.locator('.store-history-table').waitFor(); assert.equal(await tab().getAttribute('aria-selected'), 'true')
    assert.equal(await page.locator('.store-history-table tbody tr').count(), 120)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme} ${width} overflow`)
    await page.locator('.store-history-select select').selectOption(String(variant.id))
    await page.waitForFunction(() => document.querySelectorAll('.store-history-table tbody tr').length === 1)
    assert.ok((await page.locator('.store-history-table').innerText()).includes('۴۰۰٬۰۰۰'))
    await page.locator('.store-tabs-section').screenshot({ path: path.join(__dirname, '..', '.mobocom', `price-history-${theme}-${width}.png`) })
    await tab().focus(); await page.keyboard.press('Home')
    await page.waitForFunction(() => document.getElementById('store-tab-description')?.getAttribute('aria-selected') === 'true')
  }
  await save({ showPriceHistory: false }); assert.equal((await history()).status, 404)
  // Existing settings caches in separate Next dev entrypoints converge within their 30-second TTL.
  const deadline = Date.now() + 35000
  do { await page.reload({ waitUntil: 'networkidle' }); if (!await tab().count()) break; await page.waitForTimeout(1000) } while (Date.now() < deadline)
  assert.equal(await tab().count(), 0)
  assert.equal(await db.productPricePoint.count({ where: { productId: product.id } }), 129)
  console.log('Price history PG/API: horizon/currency/future filtering, 120 bound/order, variant/public/settings gates, legacy settings and dark/light RTL 390/1440 browser checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (captured) { if (original) await db.setting.upsert({ where: { key }, create: { key, value: original.value }, update: { value: original.value } }); else await db.setting.deleteMany({ where: { key } }) }
  if (product) await db.product.delete({ where: { id: product.id } })
  if (foreign) await db.product.delete({ where: { id: foreign.id } })
  if (admin) await db.user.delete({ where: { id: admin.id } })
  await db.$disconnect()
})
