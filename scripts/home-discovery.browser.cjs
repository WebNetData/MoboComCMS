// Read-only local acceptance for the MoboCom homepage presentation.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { chromium, expect } = require('@playwright/test')
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
if (new URL(baseURL).hostname !== 'localhost') throw Error('Homepage acceptance requires localhost')
const output = path.resolve(process.env.E2E_OUTPUT_DIR || '.mobocom/home-design/browser')
const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3
async function themePalette(page, theme) {
  const palette = await page.evaluate(() => ['main', '.muv-service', '.mbx-product', '.mbx-article:not(.is-lead)', '.mb-feature', '.mb-faq-list details', '.mb-about-panel', '.mbx-composer', '.mbx-tabs'].map(selector => {
    const element = document.querySelector(selector), style = getComputedStyle(element)
    let painted = element, background = style.backgroundColor
    while (background === 'rgba(0, 0, 0, 0)' && painted.parentElement) {
      painted = painted.parentElement
      background = getComputedStyle(painted).backgroundColor
    }
    return { selector, background, text: style.color }
  }))
  for (const color of palette) {
    assert.ok(theme === 'light' ? luminance(color.background) > 180 : luminance(color.background) < 100, `actual ${theme} surface ${color.selector}: ${color.background}`)
    assert.ok(theme === 'light' ? luminance(color.text) < 150 : luminance(color.text) > 170, `actual ${theme} text ${color.selector}: ${color.text}`)
  }
  return palette
}
async function lowerInteractions(page, theme, width) {
  const inputs = page.locator('.mvl-media .mbx-tab-input'), panels = []
  await inputs.first().focus()
  for (let i = 0; i < await inputs.count(); i++) {
    const input = page.locator('.mvl-media .mbx-tab-input:checked'), id = await input.getAttribute('id')
    await expect(page.locator(`label[for="${id}"]`)).toBeInViewport()
    await expect(page.locator('.mvl-media .mbx-tab-panel:visible')).toHaveCount(1)
    assert.ok(await page.locator('.mvl-media .mbx-tab-panel:visible a.mbx-poster').count() > 0)
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
    const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector('.mvl-media'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => v.id))
    assert.deepEqual(violations, [])
    panels.push({ id, violations })
    await page.keyboard.press('ArrowRight')
  }
  const lastProduct = page.locator('.mvl-store .mbx-product').last()
  await lastProduct.focus()
  await expect(lastProduct).toBeInViewport()
  const footer = lastProduct.locator('.mbx-product-foot')
  await expect(footer).toBeInViewport()
  const visiblePrice = await footer.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) })
  assert.ok(visiblePrice, 'last product price/action are painted and unobscured')
  const faq = page.locator('.mvl-faq summary').first()
  await faq.focus(); await page.keyboard.press('Enter')
  await expect(faq.locator('..')).toHaveAttribute('open', '')
  await expect(faq.locator('..').locator('p')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(faq.locator('..')).not.toHaveAttribute('open', '')
  console.log(`${theme}/${width}: all media choices/axe, final product price and keyboard FAQ passed`)
  return { theme, width, panels, visibleLastProductPrice: visiblePrice, keyboardFaq: true }
}
async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' })
  const page = await context.newPage(), errors = [], results = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  try {
    await expect.poll(async () => { try { return (await fetch(baseURL)).status } catch { return 0 } }, { timeout: 180000 }).toBe(200)
    for (const width of [1440, 390, 320, 1920]) for (const theme of ['light', 'dark']) {
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL }])
      await page.setViewportSize({ width, height: 1000 })
      const response = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 180000 })
      assert.equal(response.status(), 200)
      await expect(page.locator('.muv-hero')).toBeVisible()
      await expect(page.locator('.mb-guest')).not.toHaveAttribute('data-loading', 'true', { timeout: 30000 })
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme)
      await page.evaluate(() => document.fonts.ready)
      const layout = await page.evaluate(() => {
        const hero = document.querySelector('.muv-hero').getBoundingClientRect()
        return { scrollWidth: document.documentElement.scrollWidth, width: innerWidth, hero: { left: hero.left, right: hero.right, width: hero.width }, titles: [...document.querySelectorAll('main h1')].length }
      })
      assert.ok(layout.scrollWidth <= width + 1, `overflow: ${JSON.stringify(layout)}`)
      assert.equal(layout.titles, 1)
      const palette = await themePalette(page, theme)
      assert.equal(await page.locator('.uv-sculpture').count(), 0, 'the rejected spatial prototype is removed')
      const headerWidth = await page.locator('.mb-header-bar').evaluate(el => el.getBoundingClientRect().width)
      assert.ok(Math.abs(layout.hero.width - headerWidth) <= 1, 'homepage follows canonical header width')
      const lower = await page.locator('.mvl-section').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { width: r.width, top: r.top, bottom: r.bottom } }))
      for (const [i, section] of lower.entries()) {
        assert.ok(Math.abs(section.width - headerWidth) <= 1, 'lower sections retain the canonical wide layout')
        if (i) assert.ok(section.top >= lower[i - 1].bottom, 'lower sections do not overlap')
      }
      const productGeometry = await page.locator('.mvl-store .mbx-product').evaluateAll(elements => elements.map(el => {
        const card = el.getBoundingClientRect(), footer = el.querySelector('.mbx-product-foot').getBoundingClientRect()
        return { cardBottom: card.bottom, footerBottom: footer.bottom, cardRight: card.right, footerRight: footer.right, cardLeft: card.left, footerLeft: footer.left }
      }))
      for (const p of productGeometry) assert.ok(p.footerBottom <= p.cardBottom && p.footerLeft >= p.cardLeft && p.footerRight <= p.cardRight, 'price/action stay inside the product card')
      await expect(page.locator('.muv-feature')).toBeVisible()
      const boxes = await page.locator('.muv-intro,.muv-feature,.muv-highlight').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom } }))
      for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `bento cards do not overlap ${width}/${i}`)
      assert.ok(await page.locator('.muv-feature-art').evaluate(image => image.complete && image.naturalWidth > 0), 'real feature image loaded')
      for (const rail of await page.locator('.mbx-products,.mbx-posters').all()) {
        if (!await rail.isVisible()) continue
        if (width <= 620) {
          const last = rail.locator(':scope > *').last()
          await last.focus()
          await expect(last).toBeInViewport()
        }
      }
      await page.evaluate(() => { document.querySelectorAll('.mbx-products,.mbx-posters').forEach(el => { el.scrollLeft = 0 }); scrollTo({ top: 0, behavior: 'instant' }) })
      await page.screenshot({ caret: 'initial', path: path.join(output, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' })
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
      const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })))
      results.push({ theme, width, layout, palette, violations })
      fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(results, null, 2))
      assert.deepEqual(violations, [], `main accessibility ${theme}/${width}`)
      console.log(`Homepage ${theme}/${width}: width, real artwork, rails and axe passed`)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    const geometry = () => page.locator('.muv-lead-grid,.muv-highlight,.muv-service').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height } }))
    const darkGeometry = await geometry(), toggles = []
    for (const [theme, label] of [['light', 'فعال کردن حالت روشن'], ['dark', 'فعال کردن حالت تاریک']]) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme)
      await expect(page.locator('.mb-guest')).not.toHaveAttribute('data-loading', 'true', { timeout: 30000 })
      await page.evaluate(() => document.fonts.ready)
      const palette = await themePalette(page, theme)
      assert.deepEqual(await geometry(), darkGeometry, 'theme switching preserves the restored layout')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme)
      await expect(page.locator('.mb-guest')).not.toHaveAttribute('data-loading', 'true', { timeout: 30000 })
      await themePalette(page, theme)
      assert.equal((await context.cookies()).find(cookie => cookie.name === 'theme').value, theme)
      toggles.push({ theme, persistedAfterReload: true, palette })
    }
    fs.writeFileSync(path.join(output, 'theme-toggle.json'), JSON.stringify(toggles, null, 2))
    console.log('Actual appearance button: light/dark colours, identical geometry and reload persistence passed')
    const node = page.locator('.muv-service').first()
    await node.focus()
    await expect(node).toBeFocused()
    await expect(page.locator('.muv-service[href="/celebrities"]')).toBeVisible()
    await expect(page.locator('.muv-service[href="/prompts"]')).toBeVisible()
    await expect(page.locator('.muv-service[href="/businesses"]')).toBeVisible()
    for (const width of [861, 1181]) {
      await page.setViewportSize({ width, height: 1000 })
      const boxes = await page.locator('.muv-service').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom } }))
      for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `service boundaries ${width}/${i}`)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    const radios = page.locator('.mbx-tab-input')
    if (await radios.count() > 1) {
      await radios.first().focus()
      await page.keyboard.press('ArrowRight')
      assert.equal(await page.locator('.mbx-tab-input:checked').count(), 1)
      assert.equal(await page.locator('.mbx-tab-panel:visible').count(), 1)
    }
    const faq = page.locator('.mb-faq-list summary').first()
    if (await faq.count()) { await faq.focus(); await page.keyboard.press('Enter'); await expect(faq.locator('..')).toHaveAttribute('open', '') }
    const featureHref = await page.locator('.muv-feature').getAttribute('href')
    await page.locator('.muv-feature').click()
    await page.waitForURL(url => url.pathname === featureHref, { timeout: 60000 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mb-guest')).not.toHaveAttribute('data-loading', 'true', { timeout: 30000 })
    const search = page.locator('.muv-intro form')
    await search.getByRole('combobox').fill('موسیقی')
    await expect(search.getByRole('combobox')).toHaveValue('موسیقی')
    await search.getByRole('button', { name: 'جست‌وجو' }).click()
    await page.waitForURL(url => url.pathname === '/search' && url.searchParams.get('q') === 'موسیقی')
    const lowerResults = []
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL }])
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.mb-guest')).not.toHaveAttribute('data-loading', 'true', { timeout: 30000 })
      await page.evaluate(() => document.fonts.ready)
      lowerResults.push(await lowerInteractions(page, theme, width))
    }
    fs.writeFileSync(path.join(output, 'lower-interactions.json'), JSON.stringify(lowerResults, null, 2))
    await require('./home-discovery/hover.cjs')(browser, { baseURL, output, errors })
    assert.deepEqual(errors, [], 'runtime/hydration errors')
    console.log('Keyboard content selection, FAQ, real feature link and GET search passed')
  } finally {
    fs.writeFileSync(path.join(output, 'errors.json'), JSON.stringify(errors, null, 2))
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
