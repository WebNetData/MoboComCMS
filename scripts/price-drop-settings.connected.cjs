// Docker-local authenticated Admin UI/API checks; preserve the original merchandising setting.
const assert = require('node:assert/strict'), path = require('node:path'), { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt'), { chromium } = require('playwright')
const db = new PrismaClient(), base = 'http://localhost:3000', key = 'store.merchandising.v1', seed = `pds${Date.now().toString(36)}`
let original, admin, browser, saved = false
async function main() {
  original = await db.setting.findUnique({ where: { key } }); saved = true
  admin = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only', role: 'ADMIN' } })
  const token = await encode({ token: { uid: String(admin.id), sub: String(admin.id), email: admin.email, role: admin.role, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  const post = async body => {
    const response = await fetch(base + '/api/admin/store/settings', { method: 'POST', headers: { cookie: `next-auth.session-token=${token}`, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).settings
  }
  assert.equal((await post({ priceDropNotifications: false })).priceDropNotifications, false)
  assert.equal((await post({ offerTitle: 'آزمایش حفظ تنظیمات' })).priceDropNotifications, false)
  assert.equal((await fetch(base + '/api/admin/store/settings', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ priceDropNotifications: true }) })).status, 403)
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext()
  await context.addCookies([{ name: 'next-auth.session-token', value: token, url: base }]); const page = await context.newPage()
  for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
    await context.addCookies([{ name: 'theme', value: theme, url: base }]); await page.setViewportSize({ width, height: 900 })
    await page.goto(base + '/admin/store/settings', { waitUntil: 'networkidle' })
    const checkbox = page.getByLabel('اعلان کاهش قیمت برای دنبال‌کنندگان محصول', { exact: true })
    await checkbox.waitFor(); assert.equal(await checkbox.isChecked(), false)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme}/${width} overflow`)
    await checkbox.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(__dirname, '..', '.mobocom', `price-drop-settings-${theme}-${width}.png`) })
  }
  const checkbox = page.getByLabel('اعلان کاهش قیمت برای دنبال‌کنندگان محصول', { exact: true })
  await checkbox.check()
  const saving = page.waitForResponse(response => response.url().endsWith('/api/admin/store/settings') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'ذخیره', exact: true }).click(); assert.equal((await saving).status(), 200)
  const settings = await post({}); assert.equal(settings.priceDropNotifications, true)
  await page.reload({ waitUntil: 'networkidle' }); assert.equal(await checkbox.isChecked(), true)
  console.log('Price-drop Admin setting: actual auth/API legacy omission/guest denial and save/reload; dark/light 390/1440 browser/no-overflow checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  if (saved) { if (original) await db.setting.upsert({ where: { key }, create: { key, value: original.value }, update: { value: original.value } }); else await db.setting.deleteMany({ where: { key } }) }
  if (admin) await db.user.delete({ where: { id: admin.id } })
  await db.$disconnect()
})
