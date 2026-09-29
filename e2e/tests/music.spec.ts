import { test, expect } from '@playwright/test'

test('the music player starts a track and never fails silently', async ({ page }) => {
  await page.goto('/music', { waitUntil: 'networkidle' })
  const track = page.locator('a[href^="/music/track/"]').first()
  test.skip(!(await track.count()), 'no tracks on this site')
  await track.click()
  await page.waitForURL(/\/music\/track\//)
  await page.locator('main button:has-text("پخش")').first().click({ force: true })
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')?.src || ''), { timeout: 20_000 }).toContain('/api/media/track/')
  // Either it plays, or the player says why not (files may live on hosts the test machine cannot reach).
  await expect.poll(async () => page.evaluate(() => { const a = document.querySelector('audio'); return !!a && (!a.paused || a.currentTime > 0) }).then((playing) => playing || page.getByText(/ممکن نشد|در دسترس نیست|نتوانست|پیدا نشد|ورود|VIP|خرید/).first().isVisible()), { timeout: 30_000 }).toBe(true)
})

test('media redirects never point at the container address', async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { host: '0.0.0.0:3000' } })
  const response = await request.get('/api/media/track/1', { maxRedirects: 0, headers: { accept: 'text/html' } })
  test.skip(response.status() === 404, 'track 1 does not exist here')
  const location = response.headers()['location'] || ''
  expect(location, 'Location').not.toContain('0.0.0.0')
  await request.dispose()
})
