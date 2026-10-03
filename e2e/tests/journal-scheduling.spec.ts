import { test, expect, hasAdmin, watchErrors } from '../helpers'
import { ADMIN_STATE } from '../paths'

test('Journal editor exposes a local publication time and schedule review', async ({ browser, baseURL }) => {
  test.skip(!hasAdmin(), 'administrator credentials are required')
  const context = await browser.newContext({ baseURL, storageState: ADMIN_STATE })
  const page = await context.newPage()
  const errors = watchErrors(page)
  try {
    await page.goto('/admin/posts', { waitUntil: 'domcontentloaded' })
    await page.locator('.cms-workspace > div button.btn-primary').first().click()
    const publication = page.locator('input[type="datetime-local"]')
    await expect(publication).toBeVisible()
    const future = await page.evaluate(() => {
      const date = new Date(Date.now() + 7 * 86_400_000)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    })
    await publication.fill(future)
    await expect(publication).toHaveValue(future)
    await expect(page.getByRole('button', { name: /بازبینی و زمان‌بندی|Review & schedule/ })).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await context.close()
  }
})
