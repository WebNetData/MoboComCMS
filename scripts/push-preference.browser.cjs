// Local smoke test: node --env-file=.env scripts/push-preference.browser.cjs
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
  const user = await db.user.create({ data: { email: `codex-push-${Date.now()}@example.invalid`, passwordHash: 'test-only', name: 'Push preference QA', role: 'ADMIN' } })
  userId = user.id
  const chrome = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe')
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(chrome) ? chrome : undefined) })
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
  const token = await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, name: user.name, role: user.role, roleId: user.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  await context.addCookies([{ name: 'theme', value: 'dark', url: 'http://127.0.0.1:3000' }, { name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }])
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:3000/dashboard/profile', { waitUntil: 'domcontentloaded', timeout: 60000 })
  const toggle = page.getByRole('switch', { name: /دریافت اعلان حساب در مرورگر|Receive account notifications/ })
  await toggle.waitFor({ timeout: 60000 })
  assert.equal(await toggle.isChecked(), true)
  const color = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  assert.ok(rgb && Math.max(...rgb.slice(1).map(Number)) < 80, `expected dark background, got ${color}`)
  const responsePromise = page.waitForResponse((result) => result.url().endsWith('/api/profile') && result.request().method() === 'PATCH', { timeout: 60000 })
  await toggle.click()
  const response = await responsePromise
  assert.equal(response.status(), 200)
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: userId } })).pushAlerts, false)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await toggle.waitFor({ timeout: 60000 })
  assert.equal(await toggle.isChecked(), false)
  await page.screenshot({ path: '.next-dev/push-preference-qa.png', fullPage: true })
  console.log('Push preference browser: dark profile, persisted opt-out and reload OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (userId) await db.user.delete({ where: { id: userId } })
  await db.$disconnect()
})
