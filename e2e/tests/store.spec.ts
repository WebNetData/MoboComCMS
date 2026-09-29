import { test, expect } from '@playwright/test'

test('a guest can add a product to the cart and see it there', async ({ page }) => {
  await page.goto('/products', { waitUntil: 'networkidle' })
  const card = page.locator('a[href^="/products/"]').first()
  test.skip(!(await card.count()), 'no products on this site')
  await card.click()
  await page.waitForURL(/\/products\/[^/]+$/)
  const add = page.getByRole('button', { name: /افزودن به سبد|add to cart/i }).first()
  test.skip(!(await add.count()), 'the first product cannot be bought (out of stock or a variant is required)')
  const added = page.waitForResponse((response) => /cart/.test(response.url()) && response.request().method() === 'POST', { timeout: 30_000 })
  await add.click()
  expect((await added).status()).toBeLessThan(400)
  await page.goto('/cart', { waitUntil: 'networkidle' })
  await expect(page.locator('main')).not.toContainText(/سبد.*خالی|cart is empty/i)
})

test('an unknown product is a 404', async ({ page }) => {
  expect((await page.goto('/products/no-such-product-e2e', { waitUntil: 'domcontentloaded' }))?.status()).toBe(404)
})
