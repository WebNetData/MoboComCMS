import { test, expect, watchErrors } from '../helpers'
import { writeZip } from '../../src/modules/packages/domain/zip'

test('Solution Pack v2 previews all composition owners, detects stale review and replays its receipt', async ({ admin, browser, playwright, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1', 'requires a disposable database: applying creates a draft page and may create a role')
  const id = 'e2e-solution-v2-' + Date.now().toString(36)
  const slug = id + '-draft'
  const manifest = { id, name: id, version: '1.0.0', kind: 'plugin', runtime: 'declarative', solutionPack: {
    apiVersion: 2, modules: [{ id: 'block-editor' }], theme: { id: 'noir' },
    navigation: [{ label: 'خانه', href: '/' }], roles: ['form-specialist'],
    starterContent: [{ key: 'first-page', slug, title: 'صفحهٔ اولیهٔ آزمایشی', document: { version: 1, blocks: [{ id: 'owned-heading', type: 'content.heading', version: 1, props: { text: 'محتوای اولیه', level: 2 } }] } }],
  } }
  const context = await browser.newContext({ baseURL, storageState: await admin.storageState(), viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } })
  const page = await context.newPage(), errors = watchErrors(page)
  try {
    const upload = await admin.post('/api/admin/packages', { multipart: { file: { name: 'solution.zip', mimeType: 'application/zip', buffer: writeZip(new Map([['manifest.json', Buffer.from(JSON.stringify(manifest))]])) } } })
    expect(upload.status(), await upload.text()).toBe(200)
    expect((await guest.get('/api/admin/packages/' + id + '/solution')).status()).toBe(403)
    await page.goto('/admin/extensions', { waitUntil: 'domcontentloaded' })
    const panel = page.locator('.pm-card').filter({ has: page.locator('.xm-title small', { hasText: id }) }).locator('.pm-solution')
    await panel.getByRole('button', { name: 'بررسی پیکربندی', exact: true }).click()
    for (const title of ['قالب سایت', 'منوی اصلی', 'نقش‌های آماده', 'محتوای اولیه']) await expect(panel.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(panel.getByText(slug, { exact: true })).toBeVisible()
    const apply = panel.getByRole('button', { name: 'اعمال پیکربندی بررسی‌شده', exact: true })
    await expect(apply).toBeDisabled()
    await panel.getByRole('checkbox').check()
    const mutate = await admin.put('/api/admin/packages/' + id + '/files', { data: { path: 'stale.txt', content: 'review changed' } })
    expect(mutate.status(), await mutate.text()).toBe(200)
    const staleResponse = page.waitForResponse(response => response.url().endsWith('/' + id + '/solution') && response.request().method() === 'POST')
    await apply.click()
    expect((await staleResponse).status()).toBe(409)
    await expect(panel.getByRole('alert')).toBeVisible()
    await expect(apply).toBeDisabled()
    await panel.getByRole('button', { name: 'تازه‌کردن پیش‌نمایش' }).click()
    await panel.getByRole('checkbox').check()
    const appliedResponse = page.waitForResponse(response => response.url().endsWith('/' + id + '/solution') && response.request().method() === 'POST')
    await apply.click()
    const applied = await appliedResponse
    expect(applied.status(), await applied.text()).toBe(200)
    const receipt = (await applied.json()).receipt
    await expect(panel.getByText('پیکربندی با موفقیت ثبت شد.', { exact: true })).toBeVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await panel.getByRole('button', { name: 'بررسی پیکربندی', exact: true }).click()
    await expect(panel.getByText('این نسخه قبلاً اعمال شده است؛ تنظیمات فعلی دوباره تغییر نمی‌کنند.', { exact: true })).toBeVisible()
    expect((await (await admin.get('/api/admin/packages/' + id + '/solution')).json()).plan.receipt).toEqual(receipt)
    expect(errors).toEqual([])
  } finally {
    await guest.dispose()
    await context.close()
    await admin.delete('/api/admin/packages/' + id)
  }
})
