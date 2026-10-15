// Real local UI/API/browser evidence; run through the owned fixture runner (JWT is never logged).
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { chromium, expect } = require('@playwright/test')
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
if (new URL(baseURL).hostname !== 'localhost' || !process.env.MOBOCOM_CHAT_FIXTURE) throw Error('Owned localhost chat fixture required')
async function main() {
  const fixture = JSON.parse(process.env.MOBOCOM_CHAT_FIXTURE), browser = await chromium.launch({ headless: true })
  const errors = [], output = process.env.E2E_OUTPUT_DIR || '/tmp/chat-placement-evidence'
  fs.mkdirSync(output, { recursive: true })
  try {
    const staff = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { origin: baseURL } })
    await staff.addCookies([{ name: 'next-auth.session-token', value: fixture.token, url: baseURL }])
    const guest = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })
    const admin = await staff.newPage(), page = await guest.newPage()
    for (const view of [admin, page]) view.on('pageerror', error => errors.push(error.message))
    const enabled = await staff.request.patch('/api/admin/extensions', { data: { id: 'livechat', enabled: true } })
    assert.equal(enabled.status(), 200, 'enable existing plugin for owned test')
    assert.equal((await guest.request.put('/api/admin/chat', { headers: { origin: baseURL }, data: { settings: { places: [] } } })).status(), 403, 'guest cannot configure placement')
    assert.equal((await staff.request.put('/api/admin/chat', { data: { settings: null } })).status(), 400, 'invalid settings do not reset configuration')
    await admin.goto('/admin/chat', { waitUntil: 'domcontentloaded', timeout: 180000 })
    await admin.getByRole('button', { name: 'تنظیمات دستیار و ساعات کاری', exact: true }).click()
    const placements = admin.getByRole('group', { name: 'محل نمایش پشتیبانی آنلاین', exact: true })
    await expect(placements).toBeVisible({ timeout: 60000 })
    await placements.getByLabel('فقط بخش‌های انتخابی', { exact: true }).check()
    await placements.getByRole('button', { name: 'فقط فروشگاه', exact: true }).click()
    const save = async () => {
      const [response] = await Promise.all([admin.waitForResponse(response => response.url().endsWith('/api/admin/chat') && response.request().method() === 'PUT'), admin.getByRole('button', { name: /ذخیره.*تنظیمات|ذخیره/, exact: false }).last().click()])
      assert.equal(response.status(), 200)
    }
    await save()
    const settings = await (await staff.request.get('/api/admin/chat?view=settings')).json()
    assert.deepEqual(settings.settings.places, ['store'])
    const visit = async (route, visible) => {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await expect.poll(async () => (await page.request.get('/api/chat')).status(), { timeout: 30000 }).toBe(200)
      const projection = await (await page.request.get('/api/chat')).json()
      console.log('Placement check:', JSON.stringify({ route, expected: visible, places: projection.places }))
      const bubble = page.getByRole('button', { name: 'گفت‌وگوی آنلاین', exact: true })
      if (visible) await expect(bubble).toBeVisible({ timeout: 30000 })
      else { await page.waitForTimeout(1000); await expect(bubble).toHaveCount(0) }
    }
    await visit('/products', true)
    await page.getByRole('button', { name: 'گفت‌وگوی آنلاین', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'گفت‌وگوی آنلاین', exact: true })).toBeVisible()
    await visit('/music', false); await visit('/blog', false)
    await placements.getByRole('checkbox', { name: 'موزیک', exact: true }).check()
    await save(); await visit('/music', true); await visit('/games', false)
    await admin.reload({ waitUntil: 'domcontentloaded' })
    await admin.getByRole('button', { name: 'تنظیمات دستیار و ساعات کاری', exact: true }).click()
    await expect(placements.getByRole('checkbox', { name: 'موزیک', exact: true })).toBeChecked()
    await expect(placements.getByLabel('فروشگاه، سبد خرید و پرداخت', { exact: true })).toBeChecked()
    for (const [theme, width] of [['light', 1440], ['dark', 1440], ['dark', 390]]) {
      await admin.setViewportSize({ width, height: 1000 })
      await admin.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      await placements.scrollIntoViewIfNeeded()
      assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Admin layout fits viewport')
      await placements.screenshot({ path: path.join(output, `placements-${theme}-${width}.png`) })
      if (process.env.E2E_AXE_PATH) {
        await admin.evaluate(fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
        const violations = await admin.evaluate(async () => (await window.axe.run('fieldset[aria-describedby="chat-places-help"]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations)
        assert.deepEqual(violations, [])
      }
    }
    await placements.getByLabel('همهٔ صفحات سایت', { exact: true }).check()
    await save(); await visit('/music', true)
    // Restore the API value before final fixture cleanup, invalidating the running app's settings cache.
    const restore = await staff.request.put('/api/admin/chat', { data: { settings: { places: fixture.places } } })
    assert.equal(restore.status(), 200)
    assert.deepEqual(errors, [])
    console.log('Browser passed: store-only, selected store+music, excluded pages, reload persistence, all-pages compatibility,1440 light/dark and390 dark, scoped axe when supplied.')
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      const group = page.getByRole('group', { name: 'محل نمایش پشتیبانی آنلاین', exact: true })
      if (await group.count()) { await page.screenshot({ path: path.join(output, 'failure-admin.png') }); console.log('Placement controls on failure:', await group.innerText()) }
    }
    throw error
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
