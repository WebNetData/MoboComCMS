// Owner CSS verification: real restored player UI + native Admin filter, not an audio playback claim.
const { chromium, expect } = require('@playwright/test'), assert = require('node:assert/strict')
async function main() {
  const fixture = JSON.parse(process.env.MOBOCOM_CHAT_FIXTURE || 'null')
  if (!fixture) throw Error('Owned local fixture required')
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ baseURL: 'http://localhost:3000', locale: 'fa-IR', viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { origin: 'http://localhost:3000' } })
    await context.addCookies([{ name: 'next-auth.session-token', value: fixture.token, url: 'http://localhost:3000' }])
    await context.addInitScript(() => localStorage.setItem('mu.session.v1', JSON.stringify({ queue: [{ id: 2147000001, slug: 'owned-queue-layout', title: 'عنوان بلند برای بررسی نمایش صف پخش موزیک', artist: 'هنرمند آزمایشی', artistSlug: 'owned-artist', cover: '', access: 'PUBLIC', hasHq: false, duration: 120 }], index: 0, time: 0 })))
    const page = await context.newPage()
    await page.goto('/music', { waitUntil: 'domcontentloaded', timeout: 180000 })
    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'dark']]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      await page.locator('.mu-player button[aria-label="صف پخش"]:visible').first().click()
      const queue = page.locator('.mu-queue')
      await expect(queue).toBeVisible()
      const close = queue.getByRole('button', { name: 'بستن صف پخش', exact: true })
      const dimensions = await close.evaluate(node => ({ width: getComputedStyle(node).width, height: getComputedStyle(node).height }))
      assert.equal(dimensions.width, '38px'); assert.equal(dimensions.height, '38px')
      assert.equal(await queue.locator('ol button > span:not(.mu-player-noart)').first().evaluate(node => getComputedStyle(node).display), 'grid')
      await close.click(); await expect(queue).toHaveCount(0)
    }
    await page.goto('/admin/chat', { waitUntil: 'domcontentloaded', timeout: 180000 })
    const select = page.getByRole('combobox', { name: 'وضعیت', exact: true })
    await expect(select).toBeVisible({ timeout: 30000 })
    const customized = await page.evaluate(() => CSS.supports('appearance', 'base-select'))
    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'dark']]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      assert.equal(await select.evaluate(node => getComputedStyle(node).colorScheme), theme)
      if (customized) assert.equal(await select.evaluate(node => getComputedStyle(node).appearance), 'base-select')
      await select.click(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
      await expect(select).toHaveValue('WAITING')
      await select.selectOption('BOT'); await expect(select).toHaveValue('BOT')
    }
    console.log(`Queue/select browser passed:1440 light/dark and390 dark, actual player queue layout/close and Admin native filter keyboard selection; base-select supported=${customized}. No audio playback claim.`)
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
