// Local port 3000 visual QA: node --env-file=.env scripts/software-compatibility.visual.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const slug = `codex-compatibility-visual-${Date.now()}`
let softwareId = 0, releaseId = 0, browser

async function main() {
  const admin = await db.user.findUnique({ where: { email: process.env.ADMIN_EMAIL } })
  assert.ok(admin)
  const token = await encode({ token: { uid: String(admin.id), sub: String(admin.id), email: admin.email, name: admin.name, role: admin.role, roleId: admin.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET, maxAge: 3600 })
  const software = await db.softwareTitle.create({ data: { slug, title: 'برنامهٔ سازگاری آزمایشی', status: 'PUBLISHED', platforms: 'Windows, Linux', publishedAt: new Date(Date.now() - 86_400_000) } })
  softwareId = software.id
  const release = await db.softwareRelease.create({ data: { softwareId, version: '3.2.0', channel: 'STABLE', status: 'PUBLISHED', releasedAt: new Date(Date.now() - 86_400_000), requirements: 'RAM 16 GB و فضای دیسک 2 GB', changelog: '<p>بهبود عملکرد نسخهٔ ARM</p>', targets: { create: [{ platform: 'Windows', architecture: 'arm64', minVersion: '11', notes: 'تست چیدمان موبایل' }] } } })
  releaseId = release.id
  await db.mediaLink.create({ data: { ownerType: 'softwarerelease', ownerId: releaseId, label: 'نصب‌کنندهٔ ARM', url: 'https://example.invalid/arm64.exe', platform: 'Windows', architecture: 'arm64', checksum: 'a'.repeat(64) } })
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  const out = path.join(__dirname, '..', 'var')
  fs.mkdirSync(out, { recursive: true })
  for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
    await context.addCookies([{ name: 'theme', value: theme, url: 'http://127.0.0.1:3000' }, { name: 'next-auth.session-token', value: token, url: 'http://127.0.0.1:3000' }])
    const page = await context.newPage()
    for (const [kind, url] of [['public', `/software/${slug}`], ['archive', `/software/releases?software=${slug}`], ['detail', `/software/${slug}/releases/${releaseId}`], ['admin', `/admin/software/releases?softwareId=${softwareId}`]]) {
      await page.goto(`http://127.0.0.1:3000${url}`, { waitUntil: 'networkidle', timeout: 60000 })
      if (kind === 'admin') { await page.getByRole('button', { name: 'ویرایش' }).first().click(); await page.getByText('سازگاری این نسخه').waitFor() }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      assert.ok(overflow <= 1, `${theme} ${width} ${kind} horizontal overflow ${overflow}`)
      assert.ok(kind === 'admin' ? await page.locator('input[value="arm64"]').count() : (await page.locator('body').innerText()).includes('arm64'), `${kind} shows architecture`)
      await page.screenshot({ path: path.join(out, `software-compatibility-${kind}-${theme}-${width}.png`), fullPage: true })
    }
    await context.close()
  }
  console.log('Software compatibility visual: public/archive/detail/admin, dark/light, 390/1440, no horizontal overflow')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (browser) await browser.close()
  if (releaseId) await db.mediaLink.deleteMany({ where: { ownerType: 'softwarerelease', ownerId: releaseId } })
  if (softwareId) await db.softwareTitle.deleteMany({ where: { id: softwareId } })
  await db.$disconnect()
})
