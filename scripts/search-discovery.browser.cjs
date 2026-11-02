// Read-only presentation/GET acceptance against the running local PostgreSQL-backed site.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { chromium, expect } = require('@playwright/test')
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
if (new URL(baseURL).hostname !== 'localhost') throw Error('Search presentation acceptance requires localhost')
const query = process.env.E2E_SEARCH_QUERY || 'mobocom'
const output = path.resolve(process.env.E2E_OUTPUT_DIR || '.mobocom/search-design/browser')
const searchForm = page => page.getByRole('search', { name: 'جست‌وجو در موبوکام', exact: true })
async function ready(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  assert.equal(response.status(), 200)
  await expect(page.locator('.mb-guest')).not.toHaveAttribute('data-loading', 'true')
  await page.evaluate(() => document.fonts.ready)
}
async function axe(page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  return page.evaluate(async () => (await window.axe.run(document.querySelector('main'), {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })))
}
async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true }), records = [], errors = []
  try {
    for (const theme of ['light', 'dark']) for (const width of [1440, 390, 320, 1920]) {
      const context = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL }])
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      for (const [state, url] of [
        ['start', '/search'], ['results', `/search?q=${encodeURIComponent(query)}`],
        ['empty', '/search?q=zznocontentqvw67219'], ['short', '/search?q=x'],
        ['cursor-reset', `/search?q=${encodeURIComponent(query)}&cursor=invalid`],
      ]) {
        await ready(page, url)
        await expect(page.locator('main h1')).toHaveCount(1)
        const form = searchForm(page)
        await expect(form.getByRole('searchbox')).toBeVisible()
        const geometry = await page.locator('main > .container').evaluate(el => ({ width: el.getBoundingClientRect().width, viewport: innerWidth, scroll: document.documentElement.scrollWidth }))
        assert.ok(geometry.scroll <= width + 1, `${state}/${theme}/${width} overflow`)
        const chromeWidth = await page.locator('.mb-header-bar').evaluate(el => el.getBoundingClientRect().width)
        assert.ok(Math.abs(geometry.width - chromeWidth) <= 1, `canonical header width: ${JSON.stringify(geometry)}/${chromeWidth}`)
        if (width >= 720) assert.ok(geometry.width >= width * .95 && geometry.width <= width * .98, 'wide desktop layout')
        assert.equal(await page.locator('html').getAttribute('data-theme'), theme)
        if (state === 'start') await expect(page.getByRole('heading', { name: 'برای شروع، کشف کنید' })).toBeVisible()
        if (state === 'empty') await expect(page.getByRole('region', { name: 'بدون نتیجه' })).toBeVisible()
        if (state === 'short') await expect(page.locator('#search-help')).toHaveText('دست‌کم دو حرف بنویسید.')
        if (state === 'results') assert.ok(await page.locator('main ol > li').count() > 0, 'query needs existing public fixture content')
        if (state === 'cursor-reset') await expect(page.locator('main [role="status"]')).toContainText('صفحهٔ اول')
        const violations = await axe(page)
        records.push({ state, theme, width, geometry, violations })
        fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(records, null, 2))
        assert.deepEqual(violations, [], `${state}/${theme}/${width} accessibility`)
        if ((width === 1440 || width === 390) && state !== 'cursor-reset' && state !== 'short') {
          await page.locator('main > .container').screenshot({ path: path.join(output, `${state}-${theme}-${width}.png`) })
        }
      }
      // Native keyboard submission, category selection, GET filters and clear recovery.
      await ready(page, '/search')
      const input = searchForm(page).getByRole('searchbox')
      await input.focus()
      const focus = await input.evaluate(el => ({ visible: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineStyle }))
      assert.equal(focus.visible, true); assert.notEqual(focus.outline, 'none')
      await input.fill(query); await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp('q=' + encodeURIComponent(query)))
      await expect(page.locator('main ol > li').first()).toBeVisible()
      const typeLink = page.getByRole('navigation', { name: 'نوع نتیجه', exact: true }).locator('a[href*="type="]').first()
      const typeURL = new URL(await typeLink.getAttribute('href'), baseURL)
      await typeLink.focus(); await page.keyboard.press('Enter')
      await expect(page).toHaveURL(typeURL.href)
      const advanced = page.locator('main summary').filter({ hasText: 'فیلترهای پیشرفته' })
      await advanced.focus(); await page.keyboard.press('Enter')
      await expect(advanced.locator('..')).toHaveAttribute('open', '')
      await page.getByLabel('مرتب‌سازی', { exact: true }).selectOption('newest')
      await page.getByRole('button', { name: 'اعمال فیلترها', exact: true }).click()
      await expect(page).toHaveURL(/sort=newest/)
      assert.equal(new URL(page.url()).searchParams.get('type'), typeURL.searchParams.get('type'))
      await page.getByRole('navigation', { name: 'محدودکردن نتیجه‌ها', exact: true }).getByRole('link', { name: 'رایگان', exact: true }).click()
      await expect(page).toHaveURL(/access=free/)
      await page.getByRole('link', { name: 'برداشتن فیلترها', exact: true }).click()
      await expect(page).not.toHaveURL(/sort=|access=/)
      assert.equal(new URL(page.url()).searchParams.get('q'), query)
      assert.equal(new URL(page.url()).searchParams.get('sort'), null)
      assert.equal(new URL(page.url()).searchParams.get('access'), null)
      assert.equal(new URL(page.url()).searchParams.get('type'), typeURL.searchParams.get('type'))
      const resultLink = page.locator('main ol h3 a').first(), resultURL = new URL(await resultLink.getAttribute('href'), baseURL)
      await resultLink.focus(); await page.keyboard.press('Enter')
      await expect(page).toHaveURL(resultURL.href)
      await ready(page, '/search')
      await page.getByRole('link', { name: 'ویندوز نرم‌افزار و ابزارهای کاربردی' }).focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/q=/)
      assert.equal(new URL(page.url()).searchParams.get('q'), 'ویندوز')
      await context.close()
      console.log(`${theme}/${width}: five states/axe, keyboard, type, sort, access, clear, result and suggestion navigation passed`)
    }
    assert.deepEqual(errors, [])
    console.log(`Search presentation: ${records.length} themed views, zero main axe violations or runtime errors; eight native GET/keyboard flows passed`)
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
