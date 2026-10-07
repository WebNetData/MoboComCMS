import { test, expect, asGuest } from '../helpers'

// A section in maintenance: visitors read the owner's notice in its place, the people who run it see it as it is.
// The section is put back as it was found.
test('a section in maintenance shows the owner\'s notice to visitors and itself to the admin', async ({ admin, playwright, baseURL, browser }) => {
  test.setTimeout(240_000)
  const before = await (await admin.get('/api/admin/maintenance')).json()
  const was = before.sections.find((section: { id: string }) => section.id === 'software')
  expect(was).toBeTruthy()
  const guest = await asGuest(playwright, baseURL)
  try {
    expect((await admin.put('/api/admin/maintenance', { data: { section: 'software', enabled: true, title: 'نرم‌افزارها در راه‌اند', message: 'خط یک\nخط دو <b>not markup</b>' } })).ok()).toBeTruthy()
    // The middleware keeps the state for five seconds.
    await expect.poll(async () => (await guest.get('/software')).status(), { timeout: 30_000 }).toBe(503)
    const closed = await guest.get('/software/browse')
    expect([closed.status(), closed.headers()['retry-after'], closed.headers()['x-robots-tag']]).toEqual([503, '3600', 'noindex'])
    const html = await closed.text()
    expect(html).toContain('نرم‌افزارها در راه‌اند')
    expect(html).toContain('&lt;b&gt;not markup&lt;/b&gt;')
    // Other sections and the home page are open, and so is the section's admin.
    expect((await guest.get('/')).status()).toBe(200)
    expect((await guest.get('/music')).status()).toBe(200)
    // The admin sees the section itself, with the strip that says visitors do not.
    const page = await (await browser.newContext({ baseURL, storageState: (await admin.storageState()) })).newPage()
    const response = await page.goto('/software', { waitUntil: 'domcontentloaded', timeout: 180_000 })
    expect(response?.status()).toBe(200)
    await expect(page.locator('.mnt-preview')).toContainText('حالت تعمیر')
    await expect(page.locator('.mnt-title')).toHaveCount(0)
    await page.close()
    // Only site settings may change it.
    expect([401, 403]).toContain((await guest.put('/api/admin/maintenance', { data: { section: 'software', enabled: false } })).status())
    // Opened again.
    expect((await admin.put('/api/admin/maintenance', { data: { section: 'software', enabled: false } })).ok()).toBeTruthy()
    await expect.poll(async () => (await guest.get('/software')).status(), { timeout: 30_000 }).toBe(200)
  } finally {
    await admin.put('/api/admin/maintenance', { data: { section: 'software', enabled: was.enabled, title: was.title, message: was.message } })
    await guest.dispose()
  }
})
