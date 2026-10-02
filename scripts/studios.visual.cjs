// Local port 3000 visual QA: node --env-file=.env scripts/studios.visual.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const suffix = Date.now()
const name = `استودیوی مشترک آزمایشی ${suffix}`
let studioId = 0, softwareId = 0, gameId = 0, browser

async function main() {
  const admin = await db.user.findUnique({ where: { email: process.env.ADMIN_EMAIL } })
  assert.ok(admin)
  const token = await encode({ token: { uid: String(admin.id), sub: String(admin.id), email: admin.email, name: admin.name, role: admin.role, roleId: admin.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET, maxAge: 3600 })
  const studio = await db.studio.create({ data: { name, normalizedName: name.toLowerCase(), logo: '/og.svg', summary: 'سازنده و ناشر محصولات بازی و نرم‌افزار در موبوکام.' } })
  studioId = studio.id
  softwareId = (await db.softwareTitle.create({ data: { slug: `codex-studio-software-${suffix}`, title: 'نرم‌افزار آزمایشی استودیو', developer: name, developerStudioId: studioId, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 86_400_000) } })).id
  gameId = (await db.gameTitle.create({ data: { slug: `codex-studio-game-${suffix}`, title: 'بازی آزمایشی استودیو', publisher: name, publisherStudioId: studioId, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 86_400_000) } })).id
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  const out = path.join(__dirname, '..', 'var')
  fs.mkdirSync(out, { recursive: true })
  for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
    await context.addCookies([{ name: 'theme', value: theme, url: 'http://127.0.0.1:3000' }, { name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }])
    const page = await context.newPage()
    for (const [kind, route] of [['directory', `/studios?q=${encodeURIComponent(name)}`], ['profile', `/studios/${studioId}`], ['admin', `/admin/studios?q=${encodeURIComponent(name)}`]]) {
      await page.goto(`http://127.0.0.1:3000${route}`, { waitUntil: 'networkidle', timeout: 60000 })
      if (kind === 'admin') { await page.getByPlaceholder('نام سازنده یا ناشر').fill(name); const row = page.locator('.sa-row.sa-repeat').filter({ hasText: name }); await row.waitFor(); await row.getByRole('button', { name: 'ویرایش' }).click() }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      assert.ok(overflow <= 1, `${theme} ${width} ${kind} horizontal overflow ${overflow}`)
      assert.ok((await page.locator('body').innerText()).includes(name), `${kind} displays studio name`)
      await page.screenshot({ path: path.join(out, `studios-${kind}-${theme}-${width}.png`), fullPage: true })
    }
    await context.close()
  }
  console.log('Studios visual: directory/profile/admin, dark/light, 390/1440, no horizontal overflow')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (browser) await browser.close()
  if (gameId) await db.gameTitle.deleteMany({ where: { id: gameId } })
  if (softwareId) await db.softwareTitle.deleteMany({ where: { id: softwareId } })
  if (studioId) await db.studio.deleteMany({ where: { id: studioId } })
  await db.$disconnect()
})
