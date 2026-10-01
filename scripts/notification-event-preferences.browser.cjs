// Local smoke test: node --env-file=.env scripts/notification-event-preferences.browser.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')
const { existsSync } = require('node:fs')
const path = require('node:path')

process.env.DATABASE_URL = 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const userIds = []
let browser

async function main() {
  const seed = `codex-event-pref-${Date.now()}`
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only', name: 'Event preferences QA', role: 'ADMIN' } })
  userIds.push(user.id)
  const other = await db.user.create({ data: { email: `${seed}-other@example.invalid`, passwordHash: 'test-only', name: 'Other member' } })
  userIds.push(other.id)
  await db.userNotificationMute.create({ data: { userId: other.id, kind: 'ORDER_STATUS', channel: 'push' } })

  const chrome = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe')
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(chrome) ? chrome : undefined) })
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
  const token = await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, name: user.name, role: user.role, roleId: user.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  await context.addCookies([{ name: 'theme', value: 'dark', url: 'http://127.0.0.1:3000' }, { name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }])
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:3000/dashboard/notifications/preferences', { waitUntil: 'domcontentloaded', timeout: 60000 })
  const search = page.getByPlaceholder(/مثلاً سفارش یا پاسخ|For example/)
  await search.waitFor({ timeout: 60000 })
  await search.fill('وضعیت سفارش')
  const toggle = page.getByRole('switch', { name: /وضعیت سفارش — اعلان مرورگر|Order status — Browser push/ })
  await toggle.waitFor({ timeout: 60000 })
  assert.equal(await toggle.isChecked(), true)

  const color = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  assert.ok(rgb && Math.max(...rgb.slice(1).map(Number)) < 80, `expected dark background, got ${color}`)

  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/inbox/preferences') && response.request().method() === 'PATCH', { timeout: 60000 })
  await toggle.click()
  assert.equal((await responsePromise).status(), 200)
  assert.equal(await db.userNotificationMute.count({ where: { userId: user.id, kind: 'ORDER_STATUS', channel: 'push' } }), 1)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await search.fill('وضعیت سفارش')
  await toggle.waitFor({ timeout: 60000 })
  assert.equal(await toggle.isChecked(), false)
  await page.screenshot({ path: '.next-dev/notification-event-preferences-qa.png', fullPage: true })

  const invalid = await page.evaluate(async () => {
    const response = await fetch('/api/inbox/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'ADMIN_ORDER', channel: 'push', enabled: false }) })
    return response.status
  })
  assert.equal(invalid, 400)
  const restorePromise = page.waitForResponse((response) => response.url().endsWith('/api/inbox/preferences') && response.request().method() === 'PATCH', { timeout: 60000 })
  await toggle.click()
  assert.equal((await restorePromise).status(), 200)
  assert.equal(await db.userNotificationMute.count({ where: { userId: user.id } }), 0)
  assert.equal(await db.userNotificationMute.count({ where: { userId: other.id } }), 1)
  await search.fill('')
  await page.locator('.np-table tbody tr').first().waitFor()
  assert.ok(await page.locator('.np-table tbody tr').count() > 10)
  await page.screenshot({ path: '.next-dev/notification-event-preferences-desktop.png' })
  for (const width of [1440, 768]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `horizontal overflow at ${width}px`)
    await page.screenshot({ path: `.next-dev/notification-event-preferences-${width}.png` })
  }
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `horizontal overflow at ${width}px`)
    await page.screenshot({ path: `.next-dev/notification-event-preferences-mobile-${width}.png` })
  }
  await context.addCookies([{ name: 'theme', value: 'light', url: 'http://127.0.0.1:3000' }])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.np-table tbody tr').first().waitFor()
  await page.screenshot({ path: '.next-dev/notification-event-preferences-light-mobile.png' })
  console.log('Notification preferences browser: owner scope, opt-out, restore, validation, dark/light and responsive UI OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } })
  await db.$disconnect()
})
