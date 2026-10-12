import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { test, expect, watchErrors } from '../helpers'
import { ADMIN_STATE } from '../paths'

test('business directory, moderated experience, representative response and responsive themes', async ({ admin, page, browser, request, baseURL }, testInfo) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'owned PostgreSQL fixture required')
  test.setTimeout(180_000)
  const db = new PrismaClient(), stamp = `e2e-business-${Date.now()}`
  const keys = ['extension.businesses.state.v1', 'extension.reviews.state.v1']
  const before = await db.setting.findMany({ where: { key: { in: keys } } })
  const set = (key: string, value: string) => db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  let id = 0
  const context = await browser.newContext({ baseURL, storageState: ADMIN_STATE, ignoreHTTPSErrors: true })
  const member = await context.newPage(), errors = watchErrors(page)
  const memberErrors = watchErrors(member)
  try {
    expect((await admin.patch('/api/admin/extensions', { data: { id: 'reviews', enabled: true } })).status()).toBe(200)
    expect((await admin.patch('/api/admin/extensions', { data: { id: 'businesses', enabled: true } })).status()).toBe(200)
    const profile = { name: 'فروشگاه تجربهٔ روشن', slug: stamp, kind: 'EXTERNAL', website: `https://${stamp}.example`, category: stamp, description: 'خرید آگاهانه با تجربه‌های واقعی کاربران و پاسخ‌گویی کسب‌وکار.', status: 'PUBLISHED' }
    const saved = await admin.post('/api/admin/businesses', { data: { action: 'profile.save', ...profile } })
    expect(saved.status(), await saved.text()).toBe(200); id = (await saved.json()).id
    expect((await request.post('/api/businesses', { headers: { Origin: baseURL! }, data: { action: 'review', businessId: id, rating: 5, body: 'Unauthorized guest experience' } })).status()).toBe(401)
    await page.goto(`/businesses?category=${stamp}`)
    await expect(page.getByTestId('business-directory')).toBeVisible()
    await page.getByRole('link', { name: profile.name, exact: true }).click()
    await expect(page.getByRole('heading', { name: profile.name, exact: true })).toBeVisible()
    await member.goto(`/businesses/${stamp}`)
    await member.getByLabel('چه تجربه‌ای داشتید؟').fill('سفارش با کیفیت مناسب و پشتیبانی محترمانه به دستم رسید.')
    await member.getByRole('button', { name: 'ثبت تجربهٔ خرید', exact: true }).click()
    await expect(member.getByRole('status')).toContainText('پس از بررسی')
    const review = await db.itemReview.findFirstOrThrow({ where: { itemType: 'business', itemId: id } })
    expect(review.status).toBe('PENDING'); expect(review.verified).toBe('')
    await page.reload()
    await expect(page.getByText(review.body, { exact: true })).toHaveCount(0)
    expect((await admin.post('/api/admin/businesses', { data: { action: 'approve', businessId: id, reviewId: review.id } })).status()).toBe(200)
    await page.reload(); await expect(page.getByText(review.body, { exact: true })).toBeVisible()
    expect((await admin.post('/api/admin/businesses', { data: { action: 'profile.save', ...profile, id, representativeId: review.userId, acknowledgeRepresentative: true } })).status()).toBe(200)
    await member.reload()
    await member.getByText('پاسخ کسب‌وکار به این تجربه', { exact: true }).click()
    await member.getByLabel('متن پاسخ').fill('از اعتماد شما سپاسگزاریم؛ برای بهبود کیفیت همراه شما هستیم.')
    await member.getByRole('button', { name: 'ثبت پاسخ', exact: true }).click()
    await expect(member.getByText('از اعتماد شما سپاسگزاریم؛ برای بهبود کیفیت همراه شما هستیم.', { exact: true })).toBeVisible()
    await member.goto(`/admin/businesses?edit=${id}`)
    await expect(member.getByLabel('نام کسب‌وکار', { exact: true })).toHaveValue(profile.name)
    for (const [theme, width] of [['light', 1440], ['dark', 1440], ['dark', 390]] as const) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`/businesses/${stamp}`)
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      await expect(page.getByRole('heading', { name: profile.name, exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${theme}/${width} fits viewport`).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`business-${theme}-${width}.png`), fullPage: true })
      if (process.env.E2E_AXE_PATH) {
        await page.evaluate(fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
        const violations = await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (selector: string, options: object) => Promise<{ violations: { id: string; impact: string }[] }> } }).axe
          return (await axe.run('[data-testid="business-profile"]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations
        })
        expect(violations).toEqual([])
      }
    }
    expect(memberErrors).toEqual([]); expect(errors).toEqual([])
  } finally {
    await context.close()
    try {
      if (id) {
        await db.itemReview.deleteMany({ where: { itemType: 'business', itemId: id } })
        await db.itemStat.deleteMany({ where: { itemType: 'business', itemId: id } })
        await db.auditLog.deleteMany({ where: { targetType: 'business', targetId: String(id), action: { startsWith: 'businesses.' } } })
        await db.businessProfile.deleteMany({ where: { id, slug: stamp } })
      }
      for (const key of keys) { const row = before.find(row => row.key === key); if (row) await set(key, row.value); else await db.setting.deleteMany({ where: { key } }) }
    } finally { await db.$disconnect() }
  }
})
