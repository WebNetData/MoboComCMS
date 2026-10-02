// Local smoke test: node --env-file=.env scripts/store-variant-picker.browser.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { chromium } = require('playwright')
const { existsSync } = require('node:fs')
const path = require('node:path')

process.env.DATABASE_URL = 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-variant-picker-${Date.now()}`
let groupId = 0, categoryId = 0, productId = 0, browser

async function main() {
  const group = await db.productAttributeGroup.create({ data: { name: 'Variant picker QA', fields: JSON.stringify([
    { key: 'color', label: 'رنگ', labelEn: 'Color', kind: 'color', options: ['مشکی', 'سفید'], required: true, variant: true },
    { key: 'size', label: 'سایز', labelEn: 'Size', kind: 'select', options: ['S', 'M'], required: true, variant: true },
  ]) } })
  groupId = group.id
  const category = await db.productCategory.create({ data: { slug: `${seed}-category`, name: 'Variant QA', attributeGroupId: groupId } })
  categoryId = category.id
  const product = await db.product.create({ data: {
    slug: seed, name: 'کالای آزمایشی تنوع', categoryId, kind: 'PHYSICAL', currency: 'IRT', active: true, approval: 'APPROVED',
    price: 100000, priceMinor: 100000n, stock: 50,
    variants: { create: [
      { sku: `${seed}-black-s`, name: 'مشکی S', attributes: JSON.stringify({ color: 'مشکی', size: 'S' }), price: 100000, priceMinor: 100000n, stock: 0 },
      { sku: `${seed}-black-m`, name: 'مشکی M', attributes: JSON.stringify({ color: 'مشکی', size: 'M' }), price: 110000, priceMinor: 110000n, stock: 3 },
      { sku: `${seed}-white-s`, name: 'سفید S', attributes: JSON.stringify({ color: 'سفید', size: 'S' }), price: 120000, priceMinor: 120000n, stock: 2 },
    ] },
  } })
  productId = product.id

  const chrome = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe')
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(chrome) ? chrome : undefined) })
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
  await context.addCookies([{ name: 'theme', value: 'dark', url: 'http://127.0.0.1:3000' }])
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:3000/products/${seed}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const axes = page.locator('.sx-axis')
  await axes.first().waitFor({ timeout: 60000 })
  assert.match(await axes.nth(0).locator('legend').innerText(), /مشکی/)
  assert.match(await axes.nth(1).locator('legend').innerText(), /M/)

  const white = axes.nth(0).getByRole('button', { name: /رنگ: سفید/ })
  assert.match(await white.getAttribute('aria-label'), /گزینه‌های دیگر تغییر می‌کنند/)
  await white.click()
  await page.waitForFunction(() => document.querySelectorAll('.sx-axis legend')[1]?.textContent?.includes('S'), null, { timeout: 60000 })
  const black = axes.nth(0).getByRole('button', { name: /رنگ: مشکی/ })
  assert.match(await black.getAttribute('aria-label'), /ناموجود برای انتخاب فعلی/)
  assert.match(await black.getAttribute('class'), /is-out/)
  await black.click()
  await page.locator('.sx-unavailable').first().waitFor({ timeout: 60000 })
  await axes.nth(1).getByRole('button', { name: /سایز: M/ }).click()
  await page.waitForFunction(() => !document.querySelector('.sx-unavailable'), null, { timeout: 60000 })
  assert.match(await axes.nth(0).locator('legend').innerText(), /مشکی/)
  const color = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  assert.ok(rgb && Math.max(...rgb.slice(1).map(Number)) < 80, `expected dark background, got ${color}`)
  await page.screenshot({ path: '.next-dev/store-variant-picker-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 10000 })
  await page.screenshot({ path: '.next-dev/store-variant-picker-mobile.png', fullPage: true })
  console.log('Store variant picker browser: contextual availability, fallback, dark UI and mobile width OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (productId) await db.product.delete({ where: { id: productId } })
  if (categoryId) await db.productCategory.delete({ where: { id: categoryId } })
  if (groupId) await db.productAttributeGroup.delete({ where: { id: groupId } })
  await db.$disconnect()
})
