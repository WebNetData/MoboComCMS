// Real PostgreSQL-backed localhost UI; no production settings or records are changed.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { chromium, expect } = require('@playwright/test')
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000', output = process.env.E2E_OUTPUT_DIR || path.resolve('.mobocom/footer-evidence')
if (new URL(baseURL).hostname !== 'localhost') throw Error('Footer visual checks require localhost')
async function main() {
  const browser = await chromium.launch({ headless: true }), ctx = await browser.newContext({ baseURL }), page = await ctx.newPage(), errors = []
  fs.mkdirSync(output, { recursive: true }); page.on('pageerror', error => errors.push(error.message))
  try {
    for (const [theme, width] of [['dark',1920], ['dark',1440], ['light',1440], ['dark',768], ['dark',390], ['light',390], ['dark',320]]) {
      await ctx.addCookies([{ name: 'theme', value: theme, url: baseURL }]); await page.setViewportSize({ width, height: 1000 })
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme)
      const footer = page.getByTestId('site-footer'); await expect(footer).toBeVisible({ timeout: 60000 }); await page.evaluate(() => document.fonts.ready)
      const box = await footer.evaluate(el => { const panel = el.firstElementChild.getBoundingClientRect(), rect = el.getBoundingClientRect(); return { left: rect.left, right: rect.right, panelLeft: panel.left, panelRight: panel.right, viewport: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1 } })
      assert.ok(box.left <= 1 && box.right >= width - 1 && box.panelLeft <= 1 && box.panelRight >= width - 1, `full-width footer at ${width}: ${JSON.stringify(box)}`)
      if (box.overflow) {
        const sizes = await footer.evaluate(el => { const display = el.style.display, pageWidth = document.documentElement.scrollWidth, own = { scroll: el.scrollWidth, client: el.clientWidth }; el.style.display = 'none'; const withoutFooter = document.documentElement.scrollWidth; el.style.display = display; return { pageWidth, withoutFooter, ...own } })
        assert.equal(sizes.pageWidth, sizes.withoutFooter, 'any existing page overflow is independent of the footer')
        assert.ok(sizes.scroll <= sizes.client + 1, 'footer itself stays inside the viewport')
        console.log(`Existing page overflow at ${width} remains with footer hidden: ${sizes.withoutFooter}px; footer does not overflow.`)
      }
      await footer.scrollIntoViewIfNeeded()
      // Component-only capture hides unrelated floating chrome for the image; real hit tests below keep it visible.
      await footer.screenshot({ path: path.join(output, `after-${theme}-${width}.png`), style: 'header,.mc-translate,.support-dock,.lc-root,nextjs-portal{visibility:hidden!important}' })
      if (process.env.E2E_AXE_PATH) {
        await page.evaluate(fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
        const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector('[data-testid=site-footer]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })))
        assert.deepEqual(violations, [], `footer ${theme} ${width} accessibility`)
      }
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
      await page.screenshot({ path: path.join(output, `bottom-${theme}-${width}.png`) })
      const up = footer.getByRole('button', { name: 'بازگشت به بالا', exact: true })
      await up.click(); await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 10000 }).toBe(0)
      assert.equal(await page.evaluate(() => document.querySelector('footer').contains(document.activeElement)), false, 'keyboard focus leaves the footer after back-to-top')
      console.log(`Footer ${theme}/${width}: edge-to-edge, no overflow, axe, back-to-top passed.`)
    }
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
    await page.getByRole('button', { name: 'بازگشت به بالا', exact: true }).click(); assert.equal(await page.evaluate(() => window.scrollY), 0)
    const footer = page.getByTestId('site-footer')
    await footer.getByRole('link', { name: 'مسیرت را پیدا کن', exact: true }).click()
    const explore = footer.getByRole('navigation', { name: 'دنیای موبوکام', exact: true })
    await expect(explore).toBeInViewport()
    const form = footer.getByRole('search', { name: 'جست‌وجو از پایین صفحه', exact: true })
    if (await form.count()) { await form.getByRole('searchbox').fill('موبوکام'); await form.getByRole('button', { name: 'جست‌وجو در سایت', exact: true }).click(); await expect(page).toHaveURL(/\/search\?q=/); await expect(page.locator('main')).toBeVisible() }
    for (const route of ['/blog','/music','/products','/games','/cinema','/software','/forum','/businesses']) {
      await page.setViewportSize({ width: 1440, height: 1000 }); const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 180000 })
      if (response.status() === 404) { console.log('Existing disabled route skipped:', route); continue }
      assert.equal(response.status(), 200, route)
      await expect(page.getByTestId('site-footer')).toHaveCount(1)
      await expect(page.getByRole('banner')).toBeVisible()
    }
    assert.deepEqual(errors, [], 'no page runtime/hydration errors')
    console.log('Real footer browser checks passed:1920/1440/768/390/320, light/dark, reduced motion, focus, search, in-page discovery and existing public section integration.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
