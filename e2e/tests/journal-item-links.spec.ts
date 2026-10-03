import { test, expect, hasAdmin } from '../helpers'
import { ADMIN_STATE } from '../paths'

test('Journal editor links an entity of any type without changing public page layout', async ({ browser, baseURL }) => {
  test.skip(!hasAdmin(), 'administrator credentials are required')
  const context = await browser.newContext({ baseURL, storageState: ADMIN_STATE })
  const page = await context.newPage()
  try {
    await page.route('**/api/admin/journal/link-items**', async (route) => {
      const params = new URL(route.request().url()).searchParams
      const type = params.get('type') || 'product'
      const card = (id: number, title: string) => ({ type, id, title, url: `/${type}/${id}`, image: '' })
      const game = card(987654, 'Sample game')
      const q = params.get('q')
      await route.fulfill({ json: { matches: q === 'sample' && type === 'game' ? [game] : [], selected: (params.get('refs') || '').includes(`game:${game.id}`) ? [game] : [] } })
    })
    await page.goto('/admin/posts', { waitUntil: 'domcontentloaded' })
    await page.locator('.cms-workspace > div').first().locator('button.btn-primary').click()
    await page.locator('#post-item-type').selectOption('game')
    const search = page.locator('#post-item-search')
    await expect(search).toBeVisible()
    await search.fill('sample')
    await page.getByRole('button', { name: /Sample game \+/ }).click()
    await search.fill('')
    await expect(page.getByRole('button', { name: /Remove Sample game|حذف Sample game/ })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('Journal entity picker denies a guest', async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL })
  try {
    expect((await request.get('/api/admin/journal/link-items?type=game&q=sample')).status()).toBe(403)
    expect((await request.get('/api/admin/journal/link-products?q=sample')).status()).toBe(403)
  } finally {
    await request.dispose()
  }
})
