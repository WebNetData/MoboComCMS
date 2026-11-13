// Fixture-driven local browser acceptance for the Store category drawer and purchase path.
// Run only against a task-owned disposable app/DB: STORE_MOBILE_FIXTURE_PATH is required.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const { expect } = require('@playwright/test')

const fixturePath = process.env.STORE_MOBILE_FIXTURE_PATH
if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1') throw new Error('Set MOBOCOM_ISOLATED_FIXTURE=1 for the task-owned disposable fixture')
if (!fixturePath || !fs.existsSync(fixturePath)) throw new Error('Set STORE_MOBILE_FIXTURE_PATH to the private task fixture JSON')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
assert.equal(fixture.schemaVersion, 1, 'unsupported Store mobile fixture schema')
assert.ok(fixture.baseURL && fixture.category?.url && fixture.purchase?.productPath, 'fixture lacks local baseURL/category/purchase paths')
const base = new URL(fixture.baseURL)
assert.ok(['localhost', '127.0.0.1', '::1'].includes(base.hostname), 'refusing non-local browser target')
assert.equal(base.port, '3114', 'refusing any app endpoint outside the isolated task QA port 3114')
assert.ok(Array.isArray(fixture.buyerCookies) && fixture.buyerCookies.length, 'fixture must include the synthetic buyer cookies')
assert.ok(fixture.category.brands?.length >= 2 && fixture.category.specs?.length >= 2 && fixture.category.zeroResult, 'fixture lacks category filter coverage')
assert.ok(fixture.purchase.variantAxes?.length >= 2 && Number(fixture.purchase.quantity) > 0, 'fixture lacks purchase variant/quantity')
assert.ok(typeof fixture.orderView === 'string' && fixture.orderView.includes('{orderId}'), 'fixture must provide an orderView path with {orderId}')

const outputDir = path.resolve(process.env.STORE_MOBILE_OUTPUT_DIR || '.next-dev/store-mobile-category')
fs.mkdirSync(outputDir, { recursive: true })
const urlFor = (pathname) => new URL(pathname, base).toString()
const local = (url) => new URL(url).origin === base.origin
const digit = (value) => String(value).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
const querySnapshot = (value) => {
  const u = new URL(value)
  return {
    category: u.searchParams.get('category'), kind: u.searchParams.get('kind'), q: u.searchParams.get('q'), sort: u.searchParams.get('sort'),
    brands: u.searchParams.getAll('brand').sort(), specs: Object.fromEntries([...u.searchParams.keys()].filter((key) => key.startsWith('s_')).sort().map((key) => [key, u.searchParams.getAll(key).sort()])),
  }
}
const expectNoOverflow = async (page) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `horizontal overflow at ${page.viewportSize()?.width}px`)
const expectAxe = async (page, label) => {
  await page.addScriptTag({ path: require.resolve('axe-core') })
  const result = await page.evaluate(async () => {
    const surface = document.querySelector('.sx-listing, .sx-product, .sx-checkout, .sx-cart, .sx-my-detail')
    if (!surface) throw new Error('Store acceptance surface not found')
    return window.axe.run(surface, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
  })
  fs.writeFileSync(path.join(outputDir, `axe-${label.replace(/[^a-zA-Z0-9-]+/g, '-')}.json`), JSON.stringify(result.violations, null, 2))
  assert.equal(result.violations.length, 0, `${label} axe violations: ${result.violations.map((v) => `${v.id} (${v.nodes.length})`).join(', ')}`)
}
const screenshot = (page, name) => page.screenshot({ path: path.join(outputDir, name), fullPage: true, caret: 'initial', animations: 'disabled' })
const field = (dialog, name, value) => dialog.locator(`input[name="${name}"][value=${JSON.stringify(value)}]`)
const sorted = (items) => [...items].map(String).sort()
const readControls = async (page) => page.locator('#sx-filter-form').evaluate((form) => {
  const checked = [...form.querySelectorAll('input:checked')]
  const specs = {}
  for (const input of checked) if (input.name.startsWith('s_')) (specs[input.name] ||= []).push(input.value)
  for (const values of Object.values(specs)) values.sort()
  return {
    brands: checked.filter((input) => input.name === 'brand').map((input) => input.value).sort(),
    specs: Object.fromEntries(Object.entries(specs).sort(([a], [b]) => a.localeCompare(b))),
    price: [...form.querySelectorAll('input[type="range"]')].map((input) => input.value),
  }
})

async function setTheme(context, theme) {
  await context.clearCookies()
  await context.addCookies([...fixture.buyerCookies, { name: 'theme', value: theme, url: base.origin }])
}

async function openFilters(page) {
  await page.locator('html.sx-filter-dialog-ready').waitFor({ state: 'attached', timeout: 60000 })
  const dialog = page.getByRole('dialog', { name: 'فیلترها' })
  if (await dialog.isVisible()) return { opener: null, dialog }
  const opener = page.getByRole('button', { name: /فیلترها/ }).first()
  await opener.focus()
  await opener.press('Enter')
  await dialog.waitFor({ state: 'visible' })
  return { opener, dialog }
}

async function applyFilters(page, dialog) {
  const before = await page.url()
  await dialog.getByRole('button', { name: 'اعمال فیلترها', exact: true }).click()
  await page.waitForFunction((previous) => location.href !== previous, before, { timeout: 60000 })
  await page.waitForLoadState('domcontentloaded')
}

async function verifyDialogAndDraft(page, theme) {
  const viewport = { width: 390, height: 844 }
  await page.setViewportSize(viewport)
  await page.goto(urlFor(fixture.category.url), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('#sx-filter-form').waitFor({ state: 'attached', timeout: 60000 })
  const initialUrl = page.url()
  const initialControls = await readControls(page)
  const { opener, dialog } = await openFilters(page)
  assert.equal(await dialog.evaluate((node) => node.matches(':modal')), true, `${theme}: mobile filter dialog is not modal`)
  await page.keyboard.press('Tab')
  assert.ok(await dialog.evaluate((node) => node.contains(document.activeElement)), 'Tab escaped the mobile filter dialog')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes('فیلترها')), true, 'Escape did not restore focus to filter trigger')
  assert.equal(page.url(), initialUrl, 'Escape applied a draft filter')

  const reopened = await openFilters(page)
  const d = reopened.dialog
  const brandA = fixture.category.brands[0]
  const brandB = fixture.category.brands[1]
  const color = fixture.category.specs.find((x) => x.key === 'color')
  const memory = fixture.category.specs.find((x) => x.key !== 'color')
  assert.ok(color && memory, 'fixture must include color and a second spec facet')
  const beforeDraft = page.url()
  await field(d, 'brand', brandA).check()
  await field(d, 'brand', brandB).check()
  await field(d, `s_${color.key}`, color.values[0]).check()
  await field(d, `s_${color.key}`, color.values[1]).check()
  await field(d, `s_${memory.key}`, memory.values[0]).check()
  await field(d, `s_${memory.key}`, memory.values[1]).check()
  const virtualKind = field(d, 'kind', 'VIRTUAL')
  if (await virtualKind.count()) {
    await virtualKind.check()
    assert.equal(page.url(), beforeDraft, 'radio change applied before Apply')
    await field(d, 'kind', fixture.category.applied.kind).check()
    assert.equal(page.url(), beforeDraft, 'restoring the radio draft applied before Apply')
  }

  const slider = d.getByRole('slider', { name: 'کمترین قیمت' })
  await slider.focus()
  const beforeKeyboard = await slider.inputValue()
  await page.keyboard.press('ArrowUp')
  assert.notEqual(await slider.inputValue(), beforeKeyboard, 'keyboard did not change the minimum price slider')
  assert.equal(page.url(), beforeDraft, 'keyboard slider movement applied before Apply')
  const beforePointer = await readControls(page)
  const box = await slider.boundingBox()
  assert.ok(box, 'minimum price slider is not rendered')
  const minValue = Number(await slider.getAttribute('min')), maxValue = Number(await slider.getAttribute('max'))
  const ratio = (Number(await slider.inputValue()) - minValue) / (maxValue - minValue)
  const rtl = await slider.evaluate(node => getComputedStyle(node).direction === 'rtl')
  const thumb = box.x + 9 + (box.width - 18) * (rtl ? 1 - ratio : ratio)
  await page.mouse.move(thumb, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(thumb + (rtl ? -1 : 1) * box.width * 0.15, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  const afterPointer = await readControls(page)
  assert.notDeepEqual(afterPointer.price, beforePointer.price, 'pointer did not change either price slider value')
  assert.equal(page.url(), beforeDraft, 'pointer slider movement applied before Apply')
  await expectAxe(page, `open filters ${theme} 390`)
  await page.screenshot({ path: path.join(outputDir, `filters-${theme}-390.png`), fullPage: false, caret: 'initial' })

  await d.getByRole('button', { name: 'بستن فیلترها' }).click()
  await d.waitFor({ state: 'hidden' })
  assert.equal(page.url(), beforeDraft, 'closing the filter dialog applied draft changes')
  const reopenedAfterCancel = await openFilters(page)
  for (const value of [brandA, brandB]) assert.equal(await field(reopenedAfterCancel.dialog, 'brand', value).isChecked(), false, 'cancel did not discard brand draft')
  assert.equal(await field(reopenedAfterCancel.dialog, `s_${color.key}`, color.values[0]).isChecked(), false, 'cancel did not discard spec draft')
  assert.deepEqual(await readControls(page), initialControls, 'cancel did not restore the original applied controls and price range')
  // Clicking outside the native modal dialog must dismiss it and return focus.
  await page.mouse.click(4, 4)
  await reopenedAfterCancel.dialog.waitFor({ state: 'hidden' })
  assert.ok(await page.evaluate(() => document.activeElement?.textContent?.includes('فیلترها')), 'backdrop close did not restore trigger focus')

  // Apply repeated values, then check browser history restores canonical query state.
  const applyDialog = (await openFilters(page)).dialog
  for (const value of [brandA, brandB]) await field(applyDialog, 'brand', value).check()
  for (const value of color.values) await field(applyDialog, `s_${color.key}`, value).check()
  for (const value of memory.values) await field(applyDialog, `s_${memory.key}`, value).check()
  await applyDialog.locator('input[name="min"]').fill('115000')
  await applyDialog.locator('input[name="min"]').press('Tab')
  const unfiltered = page.url()
  await applyFilters(page, applyDialog)
  const appliedUrl = page.url()
  const applied = new URL(appliedUrl)
  assert.deepEqual(sorted(applied.searchParams.getAll('brand')), sorted([brandA, brandB]), 'Apply must preserve repeated brand values')
  for (const spec of [color, memory]) assert.deepEqual(sorted(applied.searchParams.getAll(`s_${spec.key}`)), sorted(spec.values), `Apply must preserve repeated ${spec.key} values`)
  assert.equal(applied.searchParams.get('page'), null, 'applying filters must reset pagination')
  assert.equal(applied.searchParams.get('min'), '115000', 'Apply lost the drafted price bound')
  const state = querySnapshot(appliedUrl)
  const appliedControls = await readControls(page)
  assert.deepEqual(appliedControls.brands, sorted([brandA, brandB]), 'applied brand controls do not match the submitted URL')
  assert.deepEqual(appliedControls.specs[`s_${color.key}`], sorted(color.values), 'applied color controls do not match the submitted URL')
  assert.deepEqual(appliedControls.specs[`s_${memory.key}`], sorted(memory.values), 'applied second spec controls do not match the submitted URL')
  await page.goBack({ waitUntil: 'domcontentloaded' })
  assert.equal(page.url(), unfiltered, 'Back did not restore the prior canonical query state')
  await expect.poll(() => readControls(page), { timeout: 15000, message: 'Back must finish restoring the applied controls' }).toEqual(initialControls)
  assert.deepEqual(await readControls(page), initialControls, 'Back restored URL but not the unfiltered controls')
  await page.goForward({ waitUntil: 'domcontentloaded' })
  assert.deepEqual(querySnapshot(page.url()), state, 'Forward did not restore applied canonical query state')
  await expect.poll(() => readControls(page), { timeout: 15000, message: 'Forward must finish restoring the applied controls' }).toEqual(appliedControls)
  assert.deepEqual(await readControls(page), appliedControls, 'Forward restored URL but not the applied controls')
  await expectNoOverflow(page)
  await expectAxe(page, `category ${theme} ${viewport.width}`)
  await screenshot(page, `category-${theme}-${viewport.width}.png`)

  // A known impossible brand/spec pair reaches the empty state. Draft Clear removes refinements but
  // keeps the applied category, kind, search and sort context; Apply commits that recovery.
  const zeroDialog = (await openFilters(page)).dialog
  await zeroDialog.getByRole('button', { name: 'پاک‌کردن فیلترها', exact: true }).click()
  await field(zeroDialog, 'brand', fixture.category.zeroResult.brand).check()
  await field(zeroDialog, `s_${fixture.category.zeroResult.key}`, fixture.category.zeroResult.value).check()
  await applyFilters(page, zeroDialog)
  await page.getByText('کالایی با این مشخصات پیدا نشد', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  const clearDialog = (await openFilters(page)).dialog
  const beforeClearApply = page.url()
  await clearDialog.getByRole('button', { name: 'پاک‌کردن فیلترها', exact: true }).click()
  assert.equal(page.url(), beforeClearApply, 'Clear must remain a draft until Apply')
  await applyFilters(page, clearDialog)
  const recovered = querySnapshot(page.url())
  for (const key of ['category', 'kind', 'q', 'sort']) assert.equal(recovered[key], fixture.category.applied[key] ?? null, `Clear did not preserve ${key}`)
  assert.deepEqual(recovered.brands, [], 'Clear retained a brand refinement')
  assert.deepEqual(recovered.specs, {}, 'Clear retained spec refinements')
  await page.locator('#sx-filter-form').waitFor({ state: 'attached' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect.poll(() => page.locator('#sx-filter-dialog').evaluate(node => node.open)).toBe(true)
  await page.setViewportSize({ width: 800, height: 900 })
  await expect.poll(() => page.locator('#sx-filter-dialog').evaluate(node => node.open)).toBe(false)
  const tabletDialog = (await openFilters(page)).dialog
  assert.equal(await tabletDialog.evaluate(node => node.matches(':modal')), true, 'resized mobile drawer did not reopen')
  await expectNoOverflow(page)
  await page.keyboard.press('Escape')
  return { appliedUrl, recoveredUrl: page.url() }
}

async function verifyDesktopSidebar(page, theme) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(urlFor(fixture.category.url), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('#sx-filter-form').waitFor({ state: 'visible', timeout: 60000 })
  await page.locator('html.sx-filter-dialog-ready').waitFor({ state: 'attached', timeout: 60000 })
  const dialog = page.getByRole('dialog', { name: 'فیلترها' })
  await dialog.waitFor({ state: 'visible' })
  assert.equal(await dialog.evaluate((node) => node.matches(':modal')), false, `${theme}: desktop filter sidebar unexpectedly blocks the page`)
  const before = page.url()
  const brand = fixture.category.brands[0]
  await field(dialog, 'brand', brand).check()
  await page.waitForFunction((previous) => location.href !== previous, before, { timeout: 60000 })
  assert.deepEqual(new URL(page.url()).searchParams.getAll('brand'), [brand], `${theme}: desktop filter change did not apply`)
  await expectNoOverflow(page)
  await expectAxe(page, `desktop category sidebar ${theme}`)
  await screenshot(page, `category-desktop-${theme}-1440.png`)
}

async function purchaseJourney(context, page) {
  const p = fixture.purchase
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(urlFor(p.productPath), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.sx-buy').waitFor({ state: 'visible', timeout: 60000 })
  await expectNoOverflow(page)
  await expectAxe(page, 'product desktop')
  await screenshot(page, 'product-baseline-1440.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoOverflow(page)
  await expectAxe(page, 'product mobile')
  await screenshot(page, 'product-baseline-390.png')
  for (const axis of p.variantAxes) {
    // The axis legend provides a stable grouping; resolve by fieldset text and explicit aria label.
    const fieldset = page.locator('.sx-axis').filter({ hasText: axis.label }).filter({ hasText: axis.value }).first()
    const choice = fieldset.getByRole('button', { name: new RegExp(`^${axis.label}:\\s*${axis.value}`) }).first()
    assert.ok(await choice.count(), `variant option missing: ${axis.label} ${axis.value}`)
    await choice.click()
    assert.equal(await choice.getAttribute('aria-pressed'), 'true', `variant option not selected: ${axis.label} ${axis.value}`)
  }
  for (let n = 1; n < Number(p.quantity); n++) await page.getByRole('button', { name: 'افزایش تعداد', exact: true }).click()
  assert.equal(digit(await page.locator('.sx-qty output').first().innerText()), String(p.quantity), 'selected quantity differs from fixture')
  const addResponse = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/cart' && r.request().method() === 'POST', { timeout: 30000 })
  await page.getByRole('button', { name: 'افزودن به سبد خرید', exact: true }).click()
  const cartAdd = await addResponse
  assert.equal(cartAdd.status(), 200, 'cart add failed')
  const cartBody = await cartAdd.json()
  const addedLine = cartBody.cart?.lines?.find((line) => line.productId === Number(p.productId))
  assert.ok(addedLine, 'server cart response omitted the fixture product')
  assert.equal(addedLine.variantId, Number(p.variantId), 'server cart selected the wrong variant')
  assert.equal(addedLine.quantity, Number(p.quantity), `server cart quantity differs from the selected quantity: ${JSON.stringify({ sent: cartAdd.request().postDataJSON(), limited: cartBody.limited, line: addedLine })}`)
  assert.equal(addedLine.unitPrice, Number(p.unitMinor), 'server cart unit price differs from the variant price')
  assert.equal(addedLine.lineTotal, Number(p.unitMinor) * Number(p.quantity), 'server cart line total is incorrect')
  assert.equal(cartBody.cart.itemsTotal, Number(p.unitMinor) * Number(p.quantity), 'server cart total is incorrect')
  assert.equal(cartBody.cart.currency, p.currency, 'server cart currency differs from fixture')
  await page.getByRole('status').filter({ hasText: 'به سبد خرید اضافه شد' }).waitFor({ state: 'visible' })
  let releaseSession
  const sessionGate = new Promise(resolve => { releaseSession = resolve })
  const delaySession = async route => { await sessionGate; await route.continue() }
  await page.route('**/api/auth/session', delaySession)
  const sessionRequested = page.waitForRequest(request => new URL(request.url()).pathname === '/api/auth/session')
  await page.goto(urlFor('/cart'), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sessionRequested
  const complete = page.getByRole('button', { name: 'تکمیل سفارش', exact: true })
  try {
    await expect(complete).toBeDisabled()
  } finally { releaseSession() }
  await expect(complete).toBeEnabled({ timeout: 30000 })
  await page.unroute('**/api/auth/session', delaySession)
  for (const axis of p.variantAxes) await page.locator('.sx-cart-attrs').getByText(axis.value, { exact: true }).waitFor({ state: 'visible' })
  assert.equal(digit(await page.locator('.sx-cart-lines .sx-qty output').first().innerText()), String(p.quantity), 'cart quantity differs from selected quantity')
  await expectAxe(page, 'cart mobile')
  await complete.click()
  await page.waitForURL(/\/checkout\/cart/, { timeout: 30000 })
  const pickup = page.getByLabel('تحویل حضوری از فروشگاه، بدون هزینهٔ ارسال', { exact: true })
  await pickup.waitFor({ state: 'visible', timeout: 30000 })
  if (!(await pickup.isChecked())) await pickup.check()
  const pay = page.getByRole('button', { name: 'ثبت سفارش و پرداخت از کیف پول', exact: true })
  await pay.waitFor({ state: 'visible', timeout: 30000 })
  await expectAxe(page, 'wallet checkout mobile')
  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/api/cart/checkout' && r.request().method() === 'POST', { timeout: 120000 }),
    pay.click(),
  ])
  const placed = await response.json()
  assert.equal(response.status(), 200, `wallet checkout failed: ${JSON.stringify(placed)}`)
  assert.equal(placed.paid, true, 'synthetic internal-wallet order was not paid')
  assert.ok(placed.orderId, 'checkout response omitted the order id')
  const key = response.request().headers()['idempotency-key']
  assert.ok(key, 'checkout request omitted idempotency key')
  const replay = await context.request.post(urlFor('/api/cart/checkout'), { headers: { 'idempotency-key': key, origin: base.origin }, data: {} })
  assert.equal(replay.status(), 200, 'idempotent checkout replay did not succeed')
  const replayBody = await replay.json()
  assert.equal(replayBody.orderId, placed.orderId, 'retry created or returned a different order')
  assert.equal(replayBody.replayed, true, 'retry was not recognized as a replay')
  const orderPath = fixture.orderView.replace('{orderId}', String(placed.orderId))
  await page.goto(urlFor(orderPath), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.sx-my-detail').waitFor({ state: 'visible', timeout: 30000 })
  await page.getByText(p.variantName, { exact: false }).first().waitFor({ state: 'visible' })
  await expectAxe(page, 'buyer order view mobile')
  await screenshot(page, 'buyer-order-390.png')
  const result = { orderId: placed.orderId, productId: p.productId, buyerUserId: p.buyerUserId, variantId: p.variantId, quantity: Number(p.quantity), unitMinor: String(p.unitMinor), currency: p.currency, checkoutStatus: response.status(), replayed: replayBody.replayed }

  if (Array.isArray(fixture.foreignCookies) && fixture.foreignCookies.length) {
    const foreign = await context.browser().newContext({ viewport: { width: 1280, height: 900 } })
    try {
      await foreign.addCookies([...fixture.foreignCookies, { name: 'theme', value: 'light', url: base.origin }])
      const denied = await foreign.request.get(urlFor(orderPath))
      const html = await denied.text()
      assert.ok([200, 404, 401, 403].includes(denied.status()), `unexpected foreign order status ${denied.status()}`)
      assert.ok(!html.includes('sx-my-detail'), 'foreign viewer received the private order detail')
      assert.ok(!html.includes(p.variantName), 'foreign viewer received the private order variant')
      result.foreignDenied = true
    } finally { await foreign.close() }
  }
  return result
}

async function main() {
  const phase = process.env.STORE_MOBILE_PHASE || 'full'
  assert.ok(['full', 'filters', 'purchase'].includes(phase), 'STORE_MOBILE_PHASE must be full, filters, or purchase')
  const browserPath = process.env.PLAYWRIGHT_CHROMIUM_PATH
  const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) })
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const blockedExternal = []
    await context.route('**/*', async (route) => {
      if (local(route.request().url())) return route.continue()
      blockedExternal.push(new URL(route.request().url()).origin)
      return route.abort('blockedbyclient')
    })
    const page = await context.newPage()
    const runtimeErrors = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    if (phase !== 'purchase') {
      for (const theme of ['light', 'dark']) {
        await setTheme(context, theme)
        await verifyDialogAndDraft(page, theme)
        await verifyDesktopSidebar(page, theme)
      }
    }
    let order
    if (phase !== 'filters') {
      await setTheme(context, 'light')
      order = await purchaseJourney(context, page)
    }
    assert.deepEqual(runtimeErrors, [], `browser runtime errors: ${runtimeErrors.join(' | ')}`)
    assert.deepEqual(blockedExternal, [], `unexpected external provider/resource requests: ${[...new Set(blockedExternal)].join(', ')}`)
    const result = { schemaVersion: 1, phase, baseURL: base.origin, ...(phase !== 'purchase' ? { filters: 'passed' } : {}), ...(order ? { purchase: order } : {}) }
    fs.writeFileSync(path.join(outputDir, `result-${phase}.json`), JSON.stringify(result, null, 2), 'utf8')
    console.log(phase === 'filters' ? 'Store mobile category browser: filter scenarios passed' : `Store mobile category browser: ${phase === 'full' ? 'filters and ' : ''}synthetic wallet purchase passed; order ${order.orderId}`)
    await context.close()
  } finally { await browser.close() }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
