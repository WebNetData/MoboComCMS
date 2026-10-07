import { test, expect } from '../helpers'

/**
 * The sample plugin (examples/plugins/sample-feedback) works end to end when it is installed with
 * `npm run example:install -- plugin sample-feedback`. Without it these tests are skipped.
 */
test.describe.configure({ mode: 'serial' })

test.describe('sample plugin', () => {
  let installed = false

  test.beforeAll(async ({ playwright, baseURL }) => {
    const { hasAdmin } = await import('../helpers')
    if (!hasAdmin()) return
    const { ADMIN_STATE } = await import('../paths')
    const admin = await playwright.request.newContext({ baseURL, storageState: ADMIN_STATE, extraHTTPHeaders: { origin: baseURL! } })
    const list = await (await admin.get('/api/admin/extensions')).json()
    installed = (list.extensions || []).some((e: { manifest: { id: string } }) => e.manifest.id === 'sample-feedback')
    await admin.dispose()
  })
  test.afterAll(async ({ playwright, baseURL }) => {
    const { hasAdmin } = await import('../helpers')
    if (!hasAdmin() || !installed) return
    const { ADMIN_STATE } = await import('../paths')
    const admin = await playwright.request.newContext({ baseURL, storageState: ADMIN_STATE, extraHTTPHeaders: { origin: baseURL! } })
    await admin.post('/api/extensions/sample-feedback/reset')
    await admin.patch('/api/admin/extensions', { data: { id: 'sample-feedback', enabled: false } })
    await admin.dispose()
  })

  test('disabled: its API does not exist', async ({ admin, playwright, baseURL }) => {
    test.skip(!installed, 'sample plugin not installed')
    await admin.patch('/api/admin/extensions', { data: { id: 'sample-feedback', enabled: false } })
    const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } })
    expect((await guest.post('/api/extensions/sample-feedback/vote', { data: { path: '/', value: 'up' } })).status()).toBe(404)
    await guest.dispose()
  })

  test('enabled: votes are validated, counted per page, and only permitted people read them', async ({ admin, playwright, baseURL }) => {
    test.skip(!installed, 'sample plugin not installed')
    expect((await admin.patch('/api/admin/extensions', { data: { id: 'sample-feedback', enabled: true } })).ok()).toBeTruthy()
    await admin.post('/api/extensions/sample-feedback/reset')
    const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } })
    const vote = (data: unknown, ip: string) => guest.post('/api/extensions/sample-feedback/vote', { data, headers: { 'x-forwarded-for': ip } })

    expect((await vote({ path: '/blog', value: 'up' }, '10.1.0.1')).status()).toBe(200)
    expect((await vote({ path: '/blog?utm=1#x', value: 'down' }, '10.1.0.2')).status()).toBe(200)
    expect((await vote({ path: '/blog', value: 'up' }, '10.1.0.3')).status()).toBe(200)
    expect((await vote({ path: '//evil.com', value: 'up' }, '10.1.0.4')).status(), 'a bad path is stored as "/"').toBe(200)
    expect((await vote({ path: '/blog', value: 'maybe' }, '10.1.0.5')).status()).toBe(400)
    expect((await vote(null, '10.1.0.6')).status()).toBe(400)

    // Rate limit per address
    let limited = 0
    for (let i = 0; i < 25; i++) if ((await vote({ path: '/x', value: 'up' }, '10.1.9.9')).status() === 429) limited++
    expect(limited).toBeGreaterThan(0)

    expect([401, 403]).toContain((await guest.get('/api/extensions/sample-feedback/summary')).status())
    expect([401, 403]).toContain((await guest.post('/api/extensions/sample-feedback/reset')).status())
    const summary = await (await admin.get('/api/extensions/sample-feedback/summary')).json()
    const blog = summary.pages.find((p: { path: string }) => p.path === '/blog')
    expect(blog).toMatchObject({ up: 2, down: 1 })
    expect(summary.pages.find((p: { path: string }) => p.path === '/')?.up).toBe(1)
    await guest.dispose()
  })

  test('settings are validated by the plugin before they are saved', async ({ admin }) => {
    test.skip(!installed, 'sample plugin not installed')
    const bad = await admin.patch('/api/admin/extensions', { data: { id: 'sample-feedback', settings: { question: '   ' } } })
    expect(bad.ok()).toBeFalsy()
    const tooLong = await admin.patch('/api/admin/extensions', { data: { id: 'sample-feedback', settings: { thanks: 'x'.repeat(300) } } })
    expect(tooLong.ok()).toBeFalsy()
    expect((await admin.patch('/api/admin/extensions', { data: { id: 'sample-feedback', settings: { question: 'Was this useful?', thanks: 'Thanks!' } } })).ok()).toBeTruthy()
  })

  test('the widget shows on a public page, records a vote and thanks the visitor', async ({ page, admin }) => {
    test.skip(!installed, 'sample plugin not installed')
    await admin.patch('/api/admin/extensions', { data: { id: 'sample-feedback', enabled: true, settings: { question: 'Was this useful?', thanks: 'Thanks!' } } })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/blog', { waitUntil: 'networkidle', timeout: 180_000 })
    await expect(page.getByText('Was this useful?')).toBeVisible()
    await page.getByRole('button', { name: 'Yes' }).or(page.getByRole('button', { name: 'بله، مفید بود' })).click()
    await expect(page.getByText('Thanks!')).toBeVisible()
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByText('Thanks!'), 'the vote is remembered in the browser').toBeVisible()
    expect(errors).toEqual([])
  })
})

/** The sample theme (examples/themes/sample-editorial), installed with `npm run example:install -- theme sample-editorial`. */
test.describe('sample theme', () => {
  test('is selectable and renders its own header strip and footer note, then the site is restored', async ({ admin, playwright, baseURL }) => {
    const current = await (await admin.get('/api/admin/site')).json()
    test.skip(!(current.themes || []).some((t: { id: string }) => t.id === 'sample-editorial'), 'sample theme not installed')
    const original = current.config
    const saved = await admin.put('/api/admin/site', { data: { ...original, themeId: 'sample-editorial' } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    try {
      const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { accept: 'text/html' } })
      const html = await (await guest.get('/')).text()
      expect(html).toContain('ed-strip')
      expect(html).toContain('data-design="sample-editorial"')
      expect(html).toContain('ed-colophon')
      await guest.dispose()
    } finally {
      await admin.put('/api/admin/site', { data: original })
    }
  })
})
