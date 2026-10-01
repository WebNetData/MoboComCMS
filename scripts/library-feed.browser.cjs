// Local visual smoke test: node --env-file=.env scripts/library-feed.browser.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')
const { existsSync } = require('node:fs')
const path = require('node:path')

process.env.DATABASE_URL = 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-library-browser-${Date.now()}`
let userId = 0, browser

async function main() {
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  userId = user.id
  await db.userMusicPlaylist.create({ data: { userId, title: 'Recent library browser playlist' } })
  await db.userCollection.create({ data: { ownerId: userId, title: 'Recent library browser collection', visibility: 'PRIVATE' } })
  const token = await encode({ token: { uid: String(userId), sub: String(userId), email: user.email, name: user.email, role: user.role, roleId: user.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  const chrome = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe')
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(chrome) ? chrome : undefined) })
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }, { name: 'theme', value: 'dark', url: 'http://127.0.0.1:3000' }])
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:3000/dashboard/library', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByText('Recent library browser playlist').first().waitFor()
  await page.getByText('Recent library browser collection').first().waitFor()
  const color = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  assert.ok(rgb && Math.max(...rgb.slice(1).map(Number)) < 80, `expected dark library background, got ${color}`)
  await page.screenshot({ path: '.next-dev/library-feed-qa.png', fullPage: true })
  console.log('Library browser: recent cross-domain items and dark background OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (userId) await db.user.deleteMany({ where: { id: userId } })
  await db.$disconnect()
})
