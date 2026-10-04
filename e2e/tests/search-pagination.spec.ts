import { test, expect } from '@playwright/test'

test('public search resets an invalid cursor and fits desktop and mobile', async ({ page, context, baseURL }) => {
  for (const [theme, width] of [['dark', 1440], ['dark', 360], ['light', 390]] as const) {
    await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }])
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/search?q=mobocom&cursor=invalid')
    await expect(page.locator('main.md-search-results')).toBeVisible()
    await expect(page.locator('.sr-page [role="status"]')).toContainText('صفحهٔ اول')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await expect(page.locator('.sr-form input[name="q"]')).toHaveValue('mobocom')
  }
})
