// Local browser smoke test: node --env-file=.env scripts/recent-views.browser.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')
const { existsSync } = require('node:fs')
const path = require('node:path')

process.env.DATABASE_URL = 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-recent-browser-${Date.now()}`
let userId = 0, productId = 0, browser

async function main() {
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only', name: 'Recent QA', role: 'ADMIN' } })
  userId = user.id
  const product = await db.product.create({ data: { slug: seed, name: 'Browser recent product — محصول آزمایشی با عنوان بسیار طولانی برای بررسی نمایش در موبایل و دسکتاپ', active: true } })
  productId = product.id
  const token = await encode({ token: { uid: String(userId), sub: String(userId), email: user.email, name: user.email, role: user.role, roleId: user.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  const chrome = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe')
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(chrome) ? chrome : undefined) })
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }, { name: 'theme', value: 'dark', url: 'http://127.0.0.1:3000' }])
  const page = await context.newPage()
  const [response] = await Promise.all([
    page.waitForResponse((result) => result.url().endsWith('/api/library/recent') && result.request().method() === 'POST', { timeout: 60000 }),
    page.goto(`http://127.0.0.1:3000/products/${seed}`, { waitUntil: 'domcontentloaded', timeout: 60000 }),
  ])
  assert.equal(response.status(), 200)
  assert.equal(await db.userRecentView.count({ where: { userId, itemType: 'product', itemId: productId } }), 1)
  await page.goto('http://127.0.0.1:3000/dashboard/recent', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByText('Browser recent product').first().waitFor()
  const color = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  assert.ok(rgb && Math.max(...rgb.slice(1).map(Number)) < 80, `expected dark history background, got ${color}`)
  await page.screenshot({ path: '.next-dev/recent-views-qa.png', fullPage: true })
  await page.waitForLoadState('load', { timeout: 60000 })
  assert.equal(await page.locator('.recent-card .ulib-items li').count(), 1)
  const grid = await page.locator('.recent-card .ulib-items').boundingBox()
  const item = await page.locator('.recent-card .ulib-items li').first().boundingBox()
  assert.ok(grid && item && item.width >= grid.width * .9, 'a single recent item should fill the available row')
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 844 })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `horizontal overflow at ${width}px`)
    if (width === 390) await page.screenshot({ path: '.next-dev/recent-views-mobile-dark.png' })
  }
  await context.addCookies([{ name: 'theme', value: 'light', url: 'http://127.0.0.1:3000' }])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('Browser recent product').first().waitFor()
  await page.screenshot({ path: '.next-dev/recent-views-mobile-light.png' })
  page.on('dialog', (dialog) => void dialog.accept())
  const [cleared] = await Promise.all([
    page.waitForResponse((result) => result.url().endsWith('/api/library/recent') && result.request().method() === 'DELETE'),
    page.locator('.cn-history-actions button').click(),
  ])
  assert.equal(cleared.status(), 200)
  assert.equal(await db.userRecentView.count({ where: { userId } }), 0)
  await page.getByRole('heading', { name: 'تاریخچهٔ شما هنوز خالی است' }).waitFor()
  await page.screenshot({ path: '.next-dev/recent-views-empty-light.png' })
  console.log('Recent views browser: private history, responsive dark/light UI and clear state OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (productId) await db.product.deleteMany({ where: { id: productId } })
  if (userId) await db.user.deleteMany({ where: { id: userId } })
  await db.$disconnect()
})
