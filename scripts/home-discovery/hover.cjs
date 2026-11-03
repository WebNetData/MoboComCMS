const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { expect } = require('@playwright/test')

/** Read-only coverage for the existing homepage's hover, focus and motion preferences. */
module.exports = async function hoverChecks(browser, { baseURL, output, errors }) {
  const results = []
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' })
    await context.addCookies([{ name: 'theme', value: theme, url: baseURL }])
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.mb-guest')).not.toHaveAttribute('data-loading', 'true', { timeout: 30000 })
      await page.evaluate(() => document.fonts.ready)
      assert.doesNotMatch(await page.locator('main').innerText(), /MoboCom\s+Universe/i, 'requested English label removed')
      assert.ok(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches))
      const feature = page.locator('.muv-feature')
      await feature.hover()
      await expect.poll(() => feature.locator('img').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).a)).toBeGreaterThan(1)
      await page.screenshot({ caret: 'initial', path: path.join(output, `hover-${theme}-hero.png`), animations: 'disabled' })
      const cards = []
      for (const selector of ['.muv-service', '.muv-highlight', '.mvl-store .mbx-product', '.mvl-community .mbx-post', '.mvl-journal .mbx-article:not(.is-lead)']) {
        const card = page.locator(selector).first()
        await page.mouse.move(0, 0)
        const before = await card.evaluate(el => ({ top: el.offsetTop, height: el.offsetHeight }))
        await card.hover()
        await expect.poll(() => card.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).f)).toBeLessThan(0)
        assert.deepEqual(await card.evaluate(el => ({ top: el.offsetTop, height: el.offsetHeight })), before, 'hover does not alter document layout')
        await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
        const violations = await card.evaluate(async el => (await window.axe.run(el, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })))
        assert.deepEqual(violations, [], `hovered ${theme}/${selector} card accessibility`)
        cards.push(selector)
      }
      const service = page.locator('.muv-service').first()
      await page.mouse.move(0, 0); await service.focus()
      assert.equal(await service.evaluate(el => getComputedStyle(el).outlineStyle), 'solid')
      await expect.poll(() => service.evaluate(el => Number(getComputedStyle(el, '::before').opacity))).toBe(1)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await service.hover()
      assert.equal(await service.evaluate(el => getComputedStyle(el).transform), 'none')
      await feature.hover()
      assert.equal(await feature.locator('img').evaluate(el => getComputedStyle(el).transform), 'none')
      await page.mouse.move(0, 0)
      await expect.poll(() => page.locator('main').evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length)).toBe(0)
      results.push({ theme, cards, hoveredCardAxe: 0, layoutStable: true, keyboardFocus: true, reducedMotion: true })
      console.log(`${theme}: real hover, stable layout, hover axe, keyboard focus and reduced motion passed`)
    } finally { await context.close() }
  }
  const touch = await browser.newContext({ baseURL, viewport: { width: 390, height: 1000 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' })
  try {
    const page = await touch.newPage(); await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mb-guest')).not.toHaveAttribute('data-loading', 'true', { timeout: 30000 })
    assert.ok(await page.evaluate(() => matchMedia('(hover: none)').matches))
    const product = page.locator('.mvl-store .mbx-product').first()
    await expect(product.locator('.mbx-product-foot')).toBeVisible()
    assert.equal(await product.evaluate(el => getComputedStyle(el).transform), 'none')
    const faq = page.locator('.mvl-faq summary').first(); await faq.tap()
    await expect(faq.locator('..')).toHaveAttribute('open', '')
    results.push({ touch: true, actionsAvailableWithoutHover: true, nativeFaqTap: true })
    console.log('Touch viewport: actions available without hover; native FAQ tap passed')
  } finally { await touch.close() }
  fs.writeFileSync(path.join(output, 'hover-checks.json'), JSON.stringify(results, null, 2))
}
