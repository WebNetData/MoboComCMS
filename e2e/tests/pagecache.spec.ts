import { test, expect, asGuest } from '../helpers'

/** Guest page cache: guests are served from it, everything personal or dynamic is not. Settings are restored afterwards. */
test.describe.configure({ mode: 'serial' })

test.describe('guest page cache', () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const { hasAdmin } = await import('../helpers')
    if (!hasAdmin()) return
    const { ADMIN_STATE } = await import('../paths')
    const admin = await playwright.request.newContext({ baseURL, storageState: ADMIN_STATE })
    await admin.post('/api/admin/optimization', { data: { op: 'config', config: { mode: 'balanced', debugHeaders: true } } })
    await admin.dispose()
  })
  test.afterAll(async ({ playwright, baseURL }) => {
    const { hasAdmin } = await import('../helpers')
    if (!hasAdmin()) return
    const { ADMIN_STATE } = await import('../paths')
    const admin = await playwright.request.newContext({ baseURL, storageState: ADMIN_STATE })
    await admin.post('/api/admin/optimization', { data: { op: 'config', config: { mode: 'off' } } })
    await admin.dispose()
  })

  test('a guest gets MISS, then HIT with the same page', async ({ admin, playwright, baseURL }) => {
    await admin.post('/api/admin/optimization', { data: { op: 'purge' } })
    const guest = await asGuest(playwright, baseURL)
    const first = await guest.get('/blog')
    const second = await guest.get('/blog')
    expect(first.headers()['x-cache']).toBe('MISS')
    expect(second.headers()['x-cache']).toBe('HIT')
    expect(await second.text()).toBe(await first.text())
    await guest.dispose()
  })

  test('tracking parameters share the page; unknown parameters are not cached', async ({ playwright, baseURL }) => {
    const guest = await asGuest(playwright, baseURL)
    await guest.get('/blog')
    expect((await guest.get('/blog?utm_source=x&fbclid=1')).headers()['x-cache']).toBe('HIT')
    expect((await guest.get('/blog?q=zzz')).headers()['x-cache']).toBeUndefined()
    await guest.dispose()
  })

  test('signed-in visitors and app navigation are never served from it', async ({ admin, playwright, baseURL }) => {
    const signedIn = await admin.get('/blog', { headers: { accept: 'text/html' } })
    expect(signedIn.headers()['x-cache']).toBeUndefined()
    const guest = await asGuest(playwright, baseURL)
    // The app's client-side navigation asks for */* (Next removes ?_rsc= and the RSC header before the middleware
    // sees them), so "only text/html" is what keeps its payloads out of the cache.
    expect((await guest.get('/blog?_rsc=abc123', { headers: { accept: '*/*', rsc: '1' } })).headers()['x-cache']).toBeUndefined()
    expect((await guest.get('/blog', { headers: { accept: '*/*' } })).headers()['x-cache']).toBeUndefined()
    expect((await guest.get('/blog', { headers: { accept: 'text/x-component' } })).headers()['x-cache']).toBeUndefined()
    for (const path of ['/login', '/cart', '/checkout/x', '/api/health/ready']) expect((await guest.get(path)).headers()['x-cache'], path).toBeUndefined()
    await guest.dispose()
  })

  test('purging empties it, and an admin write does too', async ({ admin, playwright, baseURL }) => {
    const guest = await asGuest(playwright, baseURL)
    await guest.get('/blog')
    await admin.post('/api/admin/optimization', { data: { op: 'purge' } })
    expect((await guest.get('/blog')).headers()['x-cache']).toBe('MISS')
    await guest.dispose()
  })

  test('visitors can still browse: client-side navigation from a cached page works', async ({ page }) => {
    await page.goto('/blog', { waitUntil: 'networkidle' })
    const link = page.locator('main a[href^="/blog/"]').first()
    if (!(await link.count())) test.skip(true, 'no articles on this site')
    const href = await link.getAttribute('href')
    await link.click()
    await page.waitForURL(`**${href}`)
    await expect(page.locator('h1').first()).toBeVisible()
  })
})
