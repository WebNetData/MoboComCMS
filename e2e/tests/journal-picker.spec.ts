import { test, expect, hasAdmin } from '../helpers'
import { ADMIN_STATE } from '../paths'

test('Journal settings can retain an older post found through archive search', async ({ browser, baseURL }) => {
  test.skip(!hasAdmin(), 'administrator credentials are required')
  const context = await browser.newContext({ baseURL, storageState: ADMIN_STATE })
  const page = await context.newPage()
  try {
    await page.route('**/api/admin/journal/settings', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch()
      const body = await response.json()
      body.settings.heroIds = []
      body.picker.posts = body.picker.posts.slice(0, 1)
      await route.fulfill({ response, json: body })
    })
    await page.route('**/api/admin/journal/picker**', async (route) => {
      const query = new URL(route.request().url()).searchParams.get('q')
      await route.fulfill({ json: { posts: query === 'legacy' ? [{ id: 999999, title: 'Legacy archive story', cover: '' }] : [] } })
    })
    await page.goto('/admin/journal/settings', { waitUntil: 'domcontentloaded' })
    const hero = page.locator('.sa-card:has(input[type="search"])').first()
    const search = hero.locator('input[type="search"]')
    await expect(search).toBeVisible()
    await search.fill('legacy')
    await expect(hero.locator('option[value="999999"]')).toBeAttached()
    await hero.locator('select').selectOption('999999')
    await hero.locator('.ga-line button').click()
    await search.fill('')
    await expect(hero.locator('.sa-rank b').first()).toHaveText('Legacy archive story')
  } finally {
    await context.close()
  }
})

test('Journal picker API finds a published post for an administrator', async ({ playwright, baseURL }) => {
  test.skip(!hasAdmin(), 'administrator credentials are required')
  const request = await playwright.request.newContext({ baseURL, storageState: ADMIN_STATE, extraHTTPHeaders: { origin: baseURL! } })
  try {
    const settingsResponse = await request.get('/api/admin/journal/settings')
    expect(settingsResponse.status()).toBe(200)
    const settings = await settingsResponse.json()
    const post = settings.picker.posts.find((item: { title: string }) => item.title.length >= 2)
    test.skip(!post, 'a published post is required')
    const response = await request.get(`/api/admin/journal/picker?q=${encodeURIComponent(post.title.slice(0, 2))}`)
    expect(response.status()).toBe(200)
    const result = await response.json()
    expect(result.posts.some((item: { id: number }) => item.id === post.id)).toBe(true)
  } finally {
    await request.dispose()
  }
})
