// Local smoke test: node --env-file=.env scripts/inbox-filter.browser.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')
const { existsSync } = require('node:fs')
const path = require('node:path')

process.env.DATABASE_URL = 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
let userId = 0, browser

async function main() {
  const seed = `codex-inbox-${Date.now()}`
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only', name: 'Inbox filter QA', role: 'ADMIN' } })
  userId = user.id
  await db.userNotification.createMany({ data: Array.from({ length: 36 }, (_, n) => ({
    userId, kind: 'TEST', dedupeKey: `${seed}:${n}`, titleEn: `Notice ${n}`, titleFa: `اعلان ${n}`,
    href: '/dashboard/notifications', readAt: n >= 34 ? new Date() : null,
  })) })
  const chrome = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe')
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(chrome) ? chrome : undefined) })
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
  const token = await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, name: user.name, role: user.role, roleId: user.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  await context.addCookies([{ name: 'theme', value: 'dark', url: 'http://127.0.0.1:3000' }, { name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }])
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:3000/dashboard/notifications', { waitUntil: 'domcontentloaded', timeout: 60000 })
  const rows = page.locator('article.card')
  await rows.first().waitFor({ timeout: 60000 })
  assert.equal(await rows.count(), 30)
  await page.screenshot({ path: '.next-dev/inbox-populated-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await page.screenshot({ path: '.next-dev/inbox-populated-mobile.png' })
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `horizontal overflow at ${width}px`)
  }
  await page.setViewportSize({ width: 1365, height: 900 })
  const color = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  assert.ok(rgb && Math.max(...rgb.slice(1).map(Number)) < 80, `expected dark background, got ${color}`)

  await page.getByRole('button', { name: /خوانده‌نشده|Unread/ }).click()
  await rows.first().waitFor({ timeout: 60000 })
  assert.equal(await rows.count(), 30)
  await page.getByRole('button', { name: /نمایش بیشتر|Load more/ }).click()
  await page.waitForFunction(() => document.querySelectorAll('article.card').length === 34, null, { timeout: 60000 })
  assert.equal(await rows.count(), 34)
  await rows.first().getByRole('button', { name: /خواندم|Mark read/ }).click()
  await page.waitForFunction(() => document.querySelectorAll('article.card').length === 33, null, { timeout: 60000 })
  assert.equal((await db.userNotification.count({ where: { userId, readAt: null } })), 33)
  await page.getByRole('button', { name: /خواندن همه|Mark all read/ }).click()
  await page.waitForFunction(() => document.querySelectorAll('article.card').length === 0, null, { timeout: 60000 })
  assert.equal((await db.userNotification.count({ where: { userId, readAt: null } })), 0)
  await page.waitForFunction(() => document.querySelectorAll('.badge-amber[aria-label$="unread notifications"]').length === 0, null, { timeout: 60000 })
  await page.screenshot({ path: '.next-dev/inbox-filter-qa.png', fullPage: true })
  await context.addCookies([{ name: 'theme', value: 'light', url: 'http://127.0.0.1:3000' }])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /خوانده‌نشده|Unread/ }).click()
  await page.locator('.nc-empty').waitFor()
  await page.screenshot({ path: '.next-dev/inbox-empty-light-mobile.png' })
  console.log('Inbox browser: dark/light responsive page, unread pagination and mark-read filtering OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (userId) await db.user.delete({ where: { id: userId } })
  await db.$disconnect()
})
