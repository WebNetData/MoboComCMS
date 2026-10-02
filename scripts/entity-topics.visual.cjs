// Local port 3000 visual QA: node --env-file=.env scripts/entity-topics.visual.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-entity-visual-${Date.now()}`
let studioId = 0, gameId = 0, softwareId = 0, categoryId = 0, threadId = 0, browser

async function main() {
  const admin = await db.user.findUniqueOrThrow({ where: { email: process.env.ADMIN_EMAIL } })
  const token = await encode({ token: { uid: String(admin.id), sub: String(admin.id), email: admin.email, role: admin.role, roleId: admin.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET, maxAge: 3600 })
  const studio = await db.studio.create({ data: { name: 'استودیوی آزمایشی جامعه', normalizedName: seed } })
  studioId = studio.id
  gameId = (await db.gameTitle.create({ data: { slug: `${seed}-game`, title: 'بازی آزمایشی جامعه', developer: studio.name, developerStudioId: studioId, publishedAt: new Date(Date.now() - 86_400_000) } })).id
  softwareId = (await db.softwareTitle.create({ data: { slug: `${seed}-software`, title: 'نرم‌افزار آزمایشی جامعه', developer: studio.name, developerStudioId: studioId, publishedAt: new Date(Date.now() - 86_400_000) } })).id
  categoryId = (await db.forumCategory.create({ data: { slug: seed, title: 'گفت‌وگوی جامعه' } })).id
  threadId = (await db.forumThread.create({ data: { categoryId, userId: admin.id, title: 'آیا این بازی روی ویندوز اجرا می‌شود؟', itemType: 'game', itemId: gameId, kind: 'QUESTION', postCount: 1, posts: { create: { userId: admin.id, content: 'پرسش آزمایشی دربارهٔ سازگاری بازی.', postNumber: 1 } } } })).id
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  const output = path.join(__dirname, '..', 'var')
  fs.mkdirSync(output, { recursive: true })
  for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
    await context.addCookies([{ name: 'theme', value: theme, url: 'http://127.0.0.1:3000' }, { name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }])
    const page = await context.newPage()
    for (const [kind, route] of [['game', `/games/${seed}-game`], ['software', `/software/${seed}-software#discussions`], ['studio', `/studios/${studioId}`], ['archive', `/forum/related/game/${gameId}`], ['compose', `/forum/new?item=game:${gameId}&kind=question`]]) {
      await page.goto(`http://127.0.0.1:3000${route}`, { waitUntil: 'networkidle', timeout: 60000 })
      if (kind === 'software') await page.getByRole('tab', { name: 'پرسش و گفت‌وگو' }).click()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      assert.ok(overflow <= 1, `${kind} ${theme} ${width} horizontal overflow ${overflow}`)
      if (['game', 'software', 'studio'].includes(kind)) {
        const section = page.locator('.er-section')
        assert.ok(await section.count(), `${kind} has related discussion section`)
        await section.screenshot({ path: path.join(output, `entity-topics-${kind}-${theme}-${width}.png`) })
      } else await page.screenshot({ path: path.join(output, `entity-topics-${kind}-${theme}-${width}.png`), fullPage: true })
    }
    await context.close()
  }
  console.log('Entity topics visual: game/software/studio previews, archive and composer in dark/light at 390/1440 without overflow')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (browser) await browser.close()
  if (threadId) await db.forumThread.deleteMany({ where: { id: threadId } })
  if (categoryId) await db.forumCategory.deleteMany({ where: { id: categoryId } })
  if (gameId) await db.gameTitle.deleteMany({ where: { id: gameId } })
  if (softwareId) await db.softwareTitle.deleteMany({ where: { id: softwareId } })
  if (studioId) await db.studio.deleteMany({ where: { id: studioId } })
  await db.$disconnect()
})
