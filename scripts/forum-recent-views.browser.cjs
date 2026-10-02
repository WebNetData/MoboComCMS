// Local smoke test: node --env-file=.env scripts/forum-recent-views.browser.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')
const { existsSync } = require('node:fs')
const path = require('node:path')

process.env.DATABASE_URL = 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-forum-recent-${Date.now()}`
let userId = 0, browser
const categoryIds = []

async function topic(userId, access) {
  const category = await db.forumCategory.create({ data: { slug: `${seed}-${access.toLowerCase()}`, title: `${access} recent QA`, access, threadCount: 1, postCount: 1 } })
  categoryIds.push(category.id)
  return db.forumThread.create({ data: {
    categoryId: category.id, userId, title: `${access} recent topic QA`, status: 'VISIBLE', listed: true, postCount: 1,
    posts: { create: [{ userId, content: 'A public test discussion.', postNumber: 1 }] },
  } })
}

async function main() {
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only', role: 'ADMIN', name: 'Forum Recent QA' } })
  userId = user.id
  const publicTopic = await topic(userId, 'PUBLIC')
  const restrictedTopic = await topic(userId, 'MEMBERS')
  const token = await encode({ token: { uid: String(userId), sub: String(userId), email: user.email, name: user.name, role: user.role, roleId: user.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  const chrome = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe')
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(chrome) ? chrome : undefined) })
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }])
  const page = await context.newPage()

  const [recorded] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/library/recent') && response.request().method() === 'POST', { timeout: 60000 }),
    page.goto(`http://127.0.0.1:3000/forum/t/${publicTopic.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 }),
  ])
  assert.equal(recorded.status(), 200)
  assert.equal(await db.userRecentView.count({ where: { userId, itemType: 'thread', itemId: publicTopic.id } }), 1)
  await page.goto('http://127.0.0.1:3000/dashboard/recent', { waitUntil: 'domcontentloaded' })
  await page.getByText(publicTopic.title).first().waitFor()

  const [rejected] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/library/recent') && response.request().method() === 'POST', { timeout: 60000 }),
    page.goto(`http://127.0.0.1:3000/forum/t/${restrictedTopic.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 }),
  ])
  assert.equal(rejected.status(), 404)
  assert.equal(await db.userRecentView.count({ where: { userId, itemType: 'thread', itemId: restrictedTopic.id } }), 0)
  console.log('Forum recent views: public topic recorded, restricted topic excluded from private history OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (categoryIds.length) await db.forumCategory.deleteMany({ where: { id: { in: categoryIds } } })
  if (userId) await db.user.delete({ where: { id: userId } })
  await db.$disconnect()
})
