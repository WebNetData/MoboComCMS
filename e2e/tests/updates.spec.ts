import { test, expect } from '../helpers'

/** Site updates: the status page works without a release feed, and nothing can be started without permission, confirmation or a safe version. */
test.describe('site updates', () => {
  test('administrators see the version and how the site can be updated', async ({ admin }) => {
    const r = await admin.get('/api/admin/updates')
    expect(r.ok()).toBeTruthy()
    const data = await r.json()
    expect(data.current.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(['systemd', 'hook', 'docker', 'manual']).toContain(data.environment.method)
    expect(data.migrations).toHaveProperty('available')
    expect(data.run.status).toBe('idle')
    // The feed may be unreachable (no internet, private repository): that is reported, never a crash.
    expect(typeof data.checkError).toBe('string')
    expect((await admin.get('/api/admin/updates?view=progress')).ok()).toBeTruthy()
  })

  test('starting an update needs confirmation, a known safe version and a supported host', async ({ admin }) => {
    const noBackup = await admin.post('/api/admin/updates', { data: { op: 'apply', ref: 'v9.9.9', backupConfirmed: false } })
    expect([400, 409]).toContain(noBackup.status())
    for (const ref of ['main', 'v1.0.0; rm -rf /', '--force']) {
      const bad = await admin.post('/api/admin/updates', { data: { op: 'apply', ref, backupConfirmed: true } })
      expect([400, 409], ref).toContain(bad.status())
    }
    expect((await admin.post('/api/admin/updates', { data: { op: 'hook' } })).status(), 'no deploy hook is configured').toBe(409)
    expect((await admin.post('/api/admin/updates', { data: { op: 'nope' } })).status()).toBe(400)
  })

  test('visitors cannot read or start anything', async ({ playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } })
    expect([401, 403]).toContain((await guest.get('/api/admin/updates')).status())
    expect([401, 403]).toContain((await guest.post('/api/admin/updates', { data: { op: 'apply', ref: 'v1.0.0', backupConfirmed: true } })).status())
    await guest.dispose()
  })

  test('the admin page renders', async ({ browser }) => {
    const { ADMIN_STATE } = await import('../paths')
    const context = await browser.newContext({ storageState: ADMIN_STATE })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/admin/updates', { waitUntil: 'networkidle', timeout: 180_000 })
    await expect(page.getByRole('heading', { name: 'به‌روزرسانی سایت', level: 1 })).toBeVisible()
    await expect(page.getByText('نسخهٔ نصب‌شده')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'مهاجرت‌های پایگاه داده' })).toBeVisible()
    expect(errors).toEqual([])
    await context.close()
  })
})
