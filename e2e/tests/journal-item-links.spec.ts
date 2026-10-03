import { test, expect, hasAdmin } from '../helpers'
import { ADMIN_STATE } from '../paths'

test('Journal editor selects a product link without changing public page layout', async ({ browser, baseURL }) => {
  test.skip(!hasAdmin(), 'administrator credentials are required')
  const context = await browser.newContext({ baseURL, storageState: ADMIN_STATE })
  const page = await context.newPage()
  try {
    await page.route('**/api/admin/journal/link-products**', async (route) => {
      const q = new URL(route.request().url()).searchParams.get('q')
      const product = { id: 987654, name: 'محصول آزمایشی', nameEn: 'Sample product', slug: 'sample-product', active: true, approval: 'APPROVED' }
      await route.fulfill({ json: { matches: q === 'sample' ? [product] : [], selected: new URL(route.request().url()).searchParams.get('ids')?.includes(String(product.id)) ? [product] : [] } })
    })
    await page.goto('/admin/posts', { waitUntil: 'domcontentloaded' })
    await page.locator('.cms-workspace > div').first().locator('button.btn-primary').click()
    const search = page.locator('#post-product-search')
    await expect(search).toBeVisible()
    await search.fill('sample')
    await page.getByRole('button', { name: /Sample product \+|محصول آزمایشی \+/ }).click()
    await search.fill('')
    await expect(page.getByRole('button', { name: /Remove product Sample product|حذف محصول محصول آزمایشی/ })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('Journal product picker denies a guest', async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL })
  try {
    expect((await request.get('/api/admin/journal/link-products?q=sample')).status()).toBe(403)
  } finally {
    await request.dispose()
  }
})
