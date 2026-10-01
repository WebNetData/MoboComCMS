// Local browser smoke test: node --env-file=.env scripts/review-pagination.browser.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { chromium } = require('playwright')
const { existsSync } = require('node:fs')
const path = require('node:path')

process.env.DATABASE_URL = 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-review-browser-${Date.now()}`
let softwareId = 0, browser
const userIds = []

async function main() {
  const software = await db.softwareTitle.create({ data: { slug: seed, title: 'Paged review test' } })
  softwareId = software.id
  for (let n = 0; n < 12; n++) {
    const user = await db.user.create({ data: { email: `${seed}-${n}@example.invalid`, passwordHash: 'test-only', name: `Reviewer ${n + 1}` } })
    userIds.push(user.id)
  }
  await db.itemReview.createMany({ data: userIds.map((userId, n) => ({ itemType: 'software', itemId: softwareId, userId, rating: 5, body: `Review number ${n + 1} is long enough to display.`, status: 'APPROVED' })) })

  const chrome = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe')
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(chrome) ? chrome : undefined) })
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
  await context.addCookies([{ name: 'theme', value: 'dark', url: 'http://127.0.0.1:3000' }])
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:3000/software/${seed}#reviews`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('#reviews .rv-list li').first().waitFor({ timeout: 60000 })
  assert.equal(await page.locator('#reviews .rv-list li').count(), 10)
  const color = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  assert.ok(rgb && Math.max(...rgb.slice(1).map(Number)) < 80, `expected dark background, got ${color}`)
  const [response] = await Promise.all([
    page.waitForResponse((result) => result.url().includes('/api/engage?') && result.url().includes('page=2'), { timeout: 60000 }),
    page.locator('#reviews .rv-more').click(),
  ])
  assert.equal(response.status(), 200)
  assert.equal(await page.locator('#reviews .rv-list li').count(), 12)
  assert.equal(await page.locator('#reviews .rv-more').count(), 0)
  await page.screenshot({ path: '.next-dev/review-pagination-qa.png', fullPage: true })
  console.log('Review pagination browser: dark item page and second approved review page OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (softwareId) {
    await db.itemReview.deleteMany({ where: { itemType: 'software', itemId: softwareId } })
    await db.softwareTitle.deleteMany({ where: { id: softwareId } })
  }
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } })
  await db.$disconnect()
})
