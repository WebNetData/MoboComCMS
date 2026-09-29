import { test, expect } from '@playwright/test'
import { watchErrors } from '../helpers'

// Pages every visitor can open. A section that the site owner switched off answers 404; a crash never is acceptable.
const CORE = ['/', '/login', '/register', '/forgot-password']
const SECTIONS = ['/blog', '/products', '/software', '/games', '/cinema', '/music', '/plans', '/forum']

for (const path of CORE) {
  test(`${path} opens without errors`, async ({ page }) => {
    const errors = watchErrors(page)
    const response = await page.goto(path, { waitUntil: 'networkidle' })
    expect(response?.status()).toBe(200)
    await expect(page.locator('body')).not.toBeEmpty()
    expect(errors, 'script errors on load').toEqual([])
  })
}

for (const path of SECTIONS) {
  test(`${path} does not crash`, async ({ page }) => {
    const errors = watchErrors(page)
    const response = await page.goto(path, { waitUntil: 'networkidle' })
    expect([200, 404], `status of ${path}`).toContain(response?.status())
    if (response?.status() === 200) expect(await page.locator('body').innerText()).not.toMatch(/Application error|Internal Server Error/)
    expect(errors, 'script errors on load').toEqual([])
  })
}

test('robots.txt and sitemap are served', async ({ request }) => {
  expect((await request.get('/robots.txt')).status()).toBe(200)
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  expect(await sitemap.text()).toContain('<urlset')
})

test('unknown addresses answer 404 with a page, not a crash', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist-e2e', { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(404)
})
