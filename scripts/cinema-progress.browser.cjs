// Local visual smoke test: node --env-file=.env scripts/cinema-progress.browser.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')
const { existsSync } = require('node:fs')
const path = require('node:path')

process.env.DATABASE_URL = 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-cinema-browser-${Date.now()}`
let userId = 0, titleId = 0, linkId = 0, browser

async function main() {
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  userId = user.id
  const title = await db.cinemaTitle.create({ data: { slug: seed, title: 'Continue watching browser test', status: 'PUBLISHED', access: 'PUBLIC' } })
  titleId = title.id
  const link = await db.mediaLink.create({ data: { ownerType: 'title', ownerId: titleId, kind: 'STREAM', url: 'https://example.invalid/watch.mp4' } })
  linkId = link.id
  const token = await encode({ token: { uid: String(userId), sub: String(userId), email: user.email, name: user.email, role: user.role, roleId: user.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  const chrome = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe')
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(chrome) ? chrome : undefined) })
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }, { name: 'theme', value: 'dark', url: 'http://127.0.0.1:3000' }])
  const page = await context.newPage()
  const response = await page.request.put('http://127.0.0.1:3000/api/cinema/progress', { data: { linkId, positionSeconds: 120, durationSeconds: 600 }, headers: { origin: 'http://127.0.0.1:3000' } })
  assert.equal(response.status(), 200)
  await page.goto('http://127.0.0.1:3000/cinema', { waitUntil: 'domcontentloaded', timeout: 60000 })
  const card = page.locator('.cn-continue-card').filter({ hasText: 'Continue watching browser test' })
  await card.waitFor()
  assert.match(await card.getAttribute('href'), new RegExp(`^/watch/${linkId}`))
  const color = await page.locator('.md-cinema').evaluate((element) => getComputedStyle(element).backgroundColor)
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  assert.ok(rgb && Math.max(...rgb.slice(1).map(Number)) < 80, `expected dark cinema background, got ${color}`)
  await page.screenshot({ path: '.next-dev/cinema-progress-qa.png', fullPage: true })
  await page.goto('http://127.0.0.1:3000/cinema/history', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForLoadState('load', { timeout: 60000 })
  await page.locator('.cn-history-grid .cn-continue-card').filter({ hasText: 'Continue watching browser test' }).waitFor()
  await page.screenshot({ path: '.next-dev/cinema-history-qa.png', fullPage: true })
  page.on('dialog', (dialog) => void dialog.accept())
  const [clearResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/cinema/history') && response.request().method() === 'DELETE', { timeout: 60000 }),
    page.locator('.cn-history-actions button').click(),
  ])
  assert.equal(clearResponse.status(), 200)
  assert.equal(await db.cinemaWatchProgress.count({ where: { userId } }), 0)
  console.log('Cinema browser: dark Continue Watching shelf, private history and clear action OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (linkId) await db.mediaLink.deleteMany({ where: { id: linkId } })
  if (titleId) await db.cinemaTitle.deleteMany({ where: { id: titleId } })
  if (userId) await db.user.deleteMany({ where: { id: userId } })
  await db.$disconnect()
})
