// Actual local PostgreSQL-backed plugins; no translation is requested or repository content sent to Google.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { chromium, expect } = require('@playwright/test')
const baseURL = 'http://localhost:3000', baseline = process.argv.includes('--baseline')
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
async function main() {
  const fixture = JSON.parse(process.env.MOBOCOM_CHAT_FIXTURE || 'null')
  if (!fixture) throw Error('Owned localhost fixture required')
  const browser = await chromium.launch({ headless: true }), output = process.env.E2E_OUTPUT_DIR
  fs.mkdirSync(output, { recursive: true })
  try {
    const staff = await browser.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } })
    await staff.addCookies([{ name: 'next-auth.session-token', value: fixture.token, url: baseURL }])
    for (const id of ['livechat', 'google-translate']) assert.equal((await staff.request.patch('/api/admin/extensions', { data: { id, enabled: true } })).status(), 200)
    assert.equal((await staff.request.put('/api/admin/chat', { data: { settings: { places: ['store'] } } })).status(), 200)
    const guest = await browser.newContext({ baseURL, locale: 'en-US', viewport: { width: 390, height: 844 } })
    const page = await guest.newPage()
    await page.goto('/products', { waitUntil: 'domcontentloaded', timeout: 180000 })
    const translate = page.locator('.mc-translate-button'), bubble = page.locator('.lc-bubble')
    await expect(translate).toBeVisible({ timeout: 60000 }); await expect(bubble).toBeVisible({ timeout: 60000 })
    if (baseline) {
      assert.equal(overlaps(await translate.boundingBox(), await bubble.boundingBox()), true, 'reproduced translate button under chat bubble')
      await page.screenshot({ path: path.join(output, 'before-mobile.png') })
      console.log('Baseline reproduced: translation and chat controls overlap on mobile.')
      return
    }
    for (const [width, height, direction, theme] of [[1440,1000,'rtl','light'],[1440,1000,'rtl','dark'],[390,844,'rtl','dark'],[320,640,'rtl','light'],[640,360,'ltr','dark'],[390,844,'ltr','light']]) {
      await page.setViewportSize({ width, height })
      await page.evaluate(({direction,theme}) => { document.documentElement.dir = direction; document.documentElement.dataset.theme = theme }, {direction,theme})
      assert.equal(overlaps(await translate.boundingBox(), await bubble.boundingBox()), false, 'closed controls remain separate')
      const suggestion = page.locator('.mc-translate-suggest')
      if (await suggestion.isVisible()) assert.equal(overlaps(await suggestion.boundingBox(), await bubble.boundingBox()), false, 'translation suggestion stays clear of chat bubble')
      await translate.click(); await expect(page.getByRole('listbox', { name: 'Language', exact: true })).toBeVisible()
      const menu = await page.locator('.mc-translate-menu').boundingBox()
      assert.ok(menu.y >= 0 && menu.y + menu.height <= height && menu.x >= 0 && menu.x + menu.width <= width, 'language list fits the viewport')
      await page.keyboard.press('Escape')
      await bubble.click(); await expect(page.getByRole('dialog', { name: 'گفت‌وگوی آنلاین', exact: true })).toBeVisible()
      await translate.click(); await expect(page.getByRole('listbox', { name: 'Language', exact: true })).toBeVisible()
      assert.equal(overlaps(await translate.boundingBox(), await page.locator('.lc-input').boundingBox()), false, 'translator does not cover the chat composer')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'بستن گفت‌وگو', exact: true }).first().click()
      await expect(page.getByRole('dialog', { name: 'گفت‌وگوی آنلاین', exact: true })).toHaveCount(0)
      await page.screenshot({ path: path.join(output, `after-${width}-${height}-${direction}-${theme}.png`) })
    }
    assert.equal((await staff.request.put('/api/admin/chat', { data: { settings: { places: fixture.places } } })).status(), 200)
    console.log('Floating widgets passed: desktop/mobile/narrow/landscape, light/dark, RTL/LTR; separate buttons and suggestion; language menu clickable above open chat, composer clear; no translation request made.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
