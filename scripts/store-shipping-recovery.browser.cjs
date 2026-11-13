// Focused address/quote/checkout-retention and buyer tracking acceptance.
// Uses only the task-owned isolated PostgreSQL fixture and local QA process.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1') throw new Error('Set MOBOCOM_ISOLATED_FIXTURE=1 for the task-owned disposable fixture')
const fixturePath = process.env.STORE_SHIPPING_FIXTURE_PATH
if (!fixturePath || !fs.existsSync(fixturePath)) throw new Error('Set STORE_SHIPPING_FIXTURE_PATH to the private shipping fixture JSON')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
assert.equal(fixture.schemaVersion, 1, 'unsupported Store shipping fixture schema')
assert.ok(fixture.baseURL && fixture.checkoutPath && fixture.product?.id && fixture.addresses?.length >= 2, 'fixture lacks checkout/product/address records')
assert.ok(fixture.carriers?.primary && fixture.carriers?.secondary && fixture.carriers.primaryName && fixture.carriers.secondaryName, 'fixture lacks synthetic carriers')
assert.ok(fixture.buyerCookies?.length && fixture.staffCookies?.length && fixture.foreignCookies?.length, 'fixture requires synthetic buyer, staff, and foreign session cookies')
const base = new URL(fixture.baseURL)
assert.ok(['localhost', '127.0.0.1', '::1'].includes(base.hostname), 'refusing non-local browser target')
assert.equal(base.port, '3115', 'refusing any app endpoint outside the isolated shipping QA port 3115')
assert.ok(fixture.orderView?.includes('{orderId}') && fixture.invoicePath?.includes('{invoiceNumber}') && fixture.trackPath?.includes('{waybill}'), 'fixture lacks order, invoice, or tracking paths')
assert.ok(fixture.addresses[0].editTo && fixture.addresses[0].quoteFeesMinor?.original && fixture.addresses[0].quoteFeesMinor?.edited, 'fixture lacks same-ID edit destination and exact fee expectations')
assert.ok(fixture.trackingCode && fixture.product.variantName && fixture.walletBeforeMinor, 'fixture lacks order assertion values')

const outputDir = path.resolve(process.env.STORE_SHIPPING_OUTPUT_DIR || '.next-dev/store-shipping-recovery')
fs.mkdirSync(outputDir, { recursive: true })
const axeReports = []
const urlFor = (pathname) => new URL(pathname, base).toString()
const local = (url) => new URL(url).origin === base.origin
const digit = (value) => String(value).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
const screenshot = (page, name) => page.screenshot({ path: path.join(outputDir, name), fullPage: true, caret: 'initial', animations: 'disabled' })
const expectNoOverflow = async (page) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `horizontal overflow at ${page.viewportSize()?.width}px`)
const expectAxe = async (page, label, selector) => {
  await page.addScriptTag({ path: require.resolve('axe-core') })
  const result = await page.locator(selector).evaluate(async (root) => window.axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }))
  axeReports.push({ label, selector, violations: result.violations.map((v) => ({ id: v.id, impact: v.impact, description: v.description, help: v.help, nodes: v.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })) })) })
  fs.writeFileSync(path.join(outputDir, 'axe-current.json'), JSON.stringify(axeReports, null, 2), 'utf8')
  assert.equal(result.violations.length, 0, `${label} axe violations: ${result.violations.map((v) => `${v.id} (${v.nodes.length})`).join(', ')}`)
}
const waitQuote = (page) => page.locator('.sh-carriers input[name="carrier"]').first().waitFor({ state: 'attached', timeout: 60000 })
const localizedInteger = (value) => {
  const normalized = digit(value)
  const token = normalized.match(/[0-9][0-9,٬.]*/)?.[0]
  return token ? Number(token.replace(/[^0-9]/g, '')) : NaN
}

async function setTheme(context, theme) {
  await context.clearCookies()
  await context.addCookies([...fixture.buyerCookies, { name: 'theme', value: theme, url: base.origin }])
}

async function apiJson(response, expectedStatus, label) {
  const body = await response.json().catch(() => null)
  assert.equal(response.status(), expectedStatus, `${label}: HTTP ${response.status()} ${JSON.stringify(body)}`)
  return body
}

async function quote(request, addressId) {
  const response = await request.get(urlFor(`/api/shipping/quotes?addressId=${addressId}`))
  const body = await apiJson(response, 200, 'shipping quote API')
  assert.ok(Array.isArray(body.options), 'shipping quote API omitted carrier options')
  return body
}

async function assertQuoteFees(context, addressId, expected) {
  const body = await quote(context, addressId)
  for (const [carrierId, feeMinor] of Object.entries(expected)) {
    const option = body.options.find((item) => item.ok && item.carrierId === carrierId)
    assert.ok(option, `expected quote option ${carrierId} missing`)
    assert.equal(String(option.feeMinor), String(feeMinor), `quote ${carrierId} fee differs from fixture`)
  }
  return body
}

function selectCarrier(page, name) {
  const row = page.locator('.sh-carriers label.sh-carrier').filter({ hasText: name }).first()
  return { row, radio: row.locator('input[name="carrier"]') }
}

async function openAddressEditor(page, title) {
  await page.getByRole('button', { name: 'تغییر یا ویرایش آدرس', exact: true }).click()
  const row = page.locator('#sh-address-list li').filter({ hasText: title }).first()
  await row.getByRole('button', { name: 'ویرایش', exact: true }).click()
  return page.getByRole('dialog', { name: 'ویرایش آدرس' })
}

async function editSameAddress(page, address) {
  const dialog = await openAddressEditor(page, address.title)
  await dialog.getByLabel('استان').selectOption(address.editTo.province)
  await dialog.getByLabel('شهر', { exact: true }).fill(address.editTo.city)
  const patched = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/addresses/${address.id}` && r.request().method() === 'PATCH', { timeout: 30000 })
  await dialog.getByRole('button', { name: 'ذخیرهٔ تغییرات', exact: true }).click()
  await apiJson(await patched, 200, 'same-address edit')
}

async function prepareViewport(context, page, theme, width, height) {
  await setTheme(context, theme)
  await page.setViewportSize({ width, height })
  await page.goto(urlFor(fixture.checkoutPath), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.sx-checkout').waitFor({ state: 'visible', timeout: 60000 })
  await page.locator('.sh-selected-address').waitFor({ state: 'visible', timeout: 60000 })
  await waitQuote(page)
  await expectNoOverflow(page)
  await expectAxe(page, `checkout ${theme} ${width}`, '.sx-checkout')
  await screenshot(page, `checkout-${theme}-${width}.png`)
}

async function exerciseQuoteRecovery(context, page) {
  const address = fixture.addresses[0]
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(urlFor('/cart'), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.sx-cart').waitFor({ state: 'visible', timeout: 60000 })
  await page.locator('.sx-free-ship').filter({ hasText: fixture.carriers.freeLabel }).waitFor({ state: 'visible', timeout: 30000 })
  await expectNoOverflow(page)
  await expectAxe(page, 'cart free-shipping offer mobile', '.sx-cart')
  await screenshot(page, 'cart-free-shipping-390.png')
  await page.locator('.sx-cart-sticky button').click()
  await page.waitForURL(/\/checkout\/cart/, { timeout: 30000 })
  await page.locator('.sx-checkout').waitFor({ state: 'visible', timeout: 60000 })
  await page.locator('.sh-selected-address').waitFor({ state: 'visible', timeout: 60000 })
  await waitQuote(page)
  const initialQuotes = await assertQuoteFees(context.request, address.id, address.quoteFeesMinor.original)
  const primary = selectCarrier(page, fixture.carriers.primaryName)
  assert.ok(await primary.radio.isChecked(), 'initial default carrier is not the first configured carrier')
  assert.equal(String(initialQuotes.options.find((item) => item.ok && item.carrierId === fixture.carriers.primary)?.feeMinor), '0', 'initial free-shipping rule did not zero the primary quote')
  assert.ok((await primary.row.innerText()).includes(fixture.carriers.freeLabel), 'checkout carrier row omits the free-shipping rule label')
  await page.locator('.sh-free-by').filter({ hasText: fixture.carriers.freeLabel }).first().waitFor({ state: 'visible', timeout: 10000 })

  const secondary = selectCarrier(page, fixture.carriers.secondaryName)
  await secondary.radio.check()
  assert.ok(await secondary.radio.isChecked(), 'non-first carrier could not be selected')
  const chosenBefore = fixture.carriers.secondary
  const pay = page.locator('button.sh-pay')
  await pay.waitFor({ state: 'visible' })

  // Edit the currently selected address in place (same database id). Hold the
  // post-save address reload so a stale quote cannot be used during the gap.
  let addressesCapturedResolve
  const addressesCaptured = new Promise((resolve) => { addressesCapturedResolve = resolve })
  let releaseAddressesResolve
  const releaseAddresses = new Promise((resolve) => { releaseAddressesResolve = resolve })
  let heldAddressReply = false
  await page.route('**/api/addresses', async (route) => {
    if (route.request().method() !== 'GET' || heldAddressReply) return route.continue()
    heldAddressReply = true
    addressesCapturedResolve()
    await releaseAddresses
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }).catch(() => {})
  })
  try {
    await editSameAddress(page, address)
    await Promise.race([addressesCaptured, new Promise((_, reject) => setTimeout(() => reject(new Error('same-ID address reload did not start')), 30000))])
    assert.equal(await pay.isDisabled(), true, 'checkout stayed available while the edited address was not refreshed')
    assert.ok((await page.locator('#sh-address-list li').filter({ hasText: address.title }).innerText()).includes(address.city), 'address changed before the held reload released unexpectedly')
  } finally {
    releaseAddressesResolve()
  }

  // The address save persisted even though its refresh failed. Old quotes must
  // remain unusable until the address retry and matching destination quote both finish.
  let failNextQuote = true
  await page.route('**/api/shipping/quotes?*', async (route) => {
    if (failNextQuote) {
      failNextQuote = false
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"controlled quote read failure"}' })
    }
    return route.continue()
  })
  try {
    const addressError = page.locator('section[aria-labelledby="sh-address-title"] [role="alert"]')
    await addressError.waitFor({ state: 'visible', timeout: 30000 })
    await page.unroute('**/api/addresses')
    assert.equal(await pay.isDisabled(), true, 'checkout reused a quote after persisted address edit failed to reload')
    await page.getByRole('button', { name: 'دریافت دوبارهٔ آدرس‌ها', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.locator('.sh-selected-address').filter({ hasText: address.editTo.city }).waitFor({ state: 'visible', timeout: 30000 })
    const quoteError = page.locator('section[aria-labelledby="sh-carrier-title"] [role="alert"]')
    await quoteError.waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(await pay.isDisabled(), true, 'checkout became available with a failed quote')
    assert.ok((await page.locator('.sh-selected-address').innerText()).includes(address.editTo.city), 'same-ID city edit did not render')
    await page.getByRole('button', { name: 'دریافت دوبارهٔ هزینهٔ ارسال', exact: true }).focus()
    await page.keyboard.press('Enter')
    await waitQuote(page)
    await assertQuoteFees(context.request, address.id, address.quoteFeesMinor.edited)
    assert.ok(await selectCarrier(page, fixture.carriers.secondaryName).radio.isChecked(), 'quote retry replaced the chosen non-first carrier')
    await expectNoOverflow(page)
  } finally { await page.unroute('**/api/addresses'); await page.unroute('**/api/shipping/quotes?*') }

  // A malformed successful address payload is still a failed read, not an
  // empty address book or an uncaught render error. Retry recovers the same row.
  let malformedAddressOnce = true
  await page.route('**/api/addresses', async (route) => {
    if (route.request().method() === 'GET' && malformedAddressOnce) {
      malformedAddressOnce = false
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"addresses":null}' })
    }
    return route.continue()
  })
  try {
    await editSameAddress(page, address)
    await page.locator('section[aria-labelledby="sh-address-title"] [role="alert"]').waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(await pay.isDisabled(), true, 'checkout proceeded after a malformed address response')
    await page.getByRole('button', { name: 'دریافت دوبارهٔ آدرس‌ها', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.locator('.sh-selected-address').filter({ hasText: address.editTo.city }).waitFor({ state: 'visible', timeout: 30000 })
    await waitQuote(page)
    assert.ok(await selectCarrier(page, fixture.carriers.secondaryName).radio.isChecked(), 'malformed-address recovery lost the still-valid selected carrier')
    assert.equal(await pay.isDisabled(), false, 'successful address recovery did not restore checkout readiness')
  } finally { await page.unroute('**/api/addresses') }

  await expectAxe(page, 'recovered edited-address checkout', '.sx-checkout')
  await screenshot(page, 'checkout-recovered-edited-address-390.png')

  return { addressId: address.id, originalCity: address.city, editedCity: address.editTo.city, preservedCarrier: chosenBefore }
}

async function updateCarrierConfig(staff, enabled) {
  const get = await staff.get(urlFor('/api/admin/shipping/carriers'), { headers: { origin: base.origin } })
  const payload = await apiJson(get, 200, 'get task carrier settings')
  const settings = payload.settings
  assert.ok(settings && Array.isArray(settings.carriers), 'staff carrier settings response malformed')
  const updated = { ...settings, carriers: settings.carriers.map((carrier) => carrier.id === fixture.carriers.secondary ? { ...carrier, enabled } : carrier) }
  const put = await staff.put(urlFor('/api/admin/shipping/carriers'), { headers: { origin: base.origin }, data: { settings: updated } })
  await apiJson(put, 200, 'update task carrier availability')
  return settings
}

async function testBackendCarrierRefusal(staff, page) {
  const original = await updateCarrierConfig(staff, false)
  try {
    const pay = page.locator('button.sh-pay')
    const [response, quoteResponse] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === '/api/cart/checkout' && r.request().method() === 'POST', { timeout: 60000 }),
      page.waitForResponse((r) => new URL(r.url()).pathname === '/api/shipping/quotes' && r.request().method() === 'GET', { timeout: 60000 }),
      pay.click(),
    ])
    const data = await response.json()
    assert.ok([409, 422].includes(response.status()), `disabled-carrier checkout was accepted: ${response.status()}`)
    assert.ok(['CARRIER_UNAVAILABLE', 'NO_CARRIER'].includes(data?.code), `unexpected disabled-carrier result: ${data?.code}`)
    assert.equal(quoteResponse.status(), 200, 'quote refresh after carrier refusal failed')
    await waitQuote(page)
    const primary = selectCarrier(page, fixture.carriers.primaryName)
    const refreshed = await assertQuoteFees(page.context().request, fixture.addresses[0].id, { [fixture.carriers.primary]: fixture.addresses[0].quoteFeesMinor.edited[fixture.carriers.primary] })
    const unavailable = refreshed.options.find((item) => item.carrierId === fixture.carriers.secondary)
    assert.ok(!unavailable || unavailable.ok === false, 'disabled carrier still appears usable in refreshed quote')
    assert.ok(await primary.radio.isChecked(), 'current available carrier was not selected after backend refusal')
    const shippingRow = page.locator('.sh-totals > div').filter({ hasText: 'هزینهٔ ارسال' }).locator('dd')
    assert.equal(localizedInteger(await shippingRow.innerText()), 40000, 'edited destination primary shipping fee is incorrect')
    const walletRow = page.locator('.sh-totals > div').filter({ hasText: 'از کیف پول' }).locator('dd')
    assert.equal(localizedInteger(await walletRow.innerText()), 260000, 'wallet preview did not cover the item plus shipping total')
    assert.equal(localizedInteger(await page.locator('.sh-total dd').innerText()), 0, 'wallet-covered checkout shows an amount still due')
    return { status: response.status(), code: data.code, selectedCarrier: fixture.carriers.primary }
  } finally {
    const put = await staff.put(urlFor('/api/admin/shipping/carriers'), { headers: { origin: base.origin }, data: { settings: original } })
    await apiJson(put, 200, 'restore task carrier settings')
  }
}

async function loseCheckoutResponseAndReplay(page) {
  const pay = page.locator('button.sh-pay')
  assert.equal(await pay.isDisabled(), false, 'final carrier/quote is not ready for payment')
  const keyBefore = await page.evaluate(() => sessionStorage.getItem('mc.cart.checkout.key'))
  assert.equal(keyBefore, null, 'checkout idempotency key unexpectedly existed before the first attempt')
  let lostKey = ''
  let lostStatus = 0
  const errors = []
  page.on('requestfailed', (request) => { if (new URL(request.url()).pathname === '/api/cart/checkout') errors.push(request.failure()?.errorText || 'failed') })
  await page.route('**/api/cart/checkout', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    lostKey = route.request().headers()['idempotency-key'] || ''
    const response = await route.fetch()
    lostStatus = response.status()
    await route.abort('failed')
  }, { times: 1 })
  await pay.click()
  await page.getByRole('alert').filter({ hasText: 'ارتباط برقرار نشد' }).waitFor({ state: 'visible', timeout: 30000 })
  assert.equal(lostStatus, 200, 'first real checkout request did not complete before dropping its response')
  assert.ok(lostKey, 'first checkout request did not carry an idempotency key')
  assert.equal(await page.evaluate(() => sessionStorage.getItem('mc.cart.checkout.key')), lostKey, 'lost response cleared the retry key')
  assert.ok((await page.locator('.sh-selected-address').innerText()).includes(fixture.addresses[0].editTo.city), 'lost checkout response lost the selected address')
  assert.ok(await selectCarrier(page, fixture.carriers.primaryName).radio.isChecked(), 'lost checkout response lost selected carrier')
  assert.equal(await pay.isDisabled(), false, 'payment remained disabled after transient network loss')
  await expectAxe(page, 'checkout lost response recovery', '.sx-checkout')
  await screenshot(page, 'checkout-lost-response-retry-390.png')
  const [retryResponse] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/api/cart/checkout' && r.request().method() === 'POST', { timeout: 60000 }),
    pay.click(),
  ])
  const result = await retryResponse.json()
  assert.equal(retryResponse.status(), 200, 'checkout retry did not resolve')
  assert.equal(retryResponse.request().headers()['idempotency-key'], lostKey, 'retry did not reuse the idempotency key')
  assert.equal(result.replayed, true, 'server did not replay the order after losing its first response')
  assert.ok(result.orderId, 'retry response omitted the order id')
  const fee = fixture.addresses[0].quoteFeesMinor.edited[fixture.carriers.primary]
  return { orderId: result.orderId, idempotencyKey: lostKey, replayed: result.replayed, carrierId: fixture.carriers.primary, shippingMinor: String(fee), totalMinor: String(220000n + BigInt(fee)) }
}

async function createTracking(staff, orderId) {
  const create = await staff.post(urlFor('/api/admin/shipping/shipments'), {
    headers: { origin: base.origin }, data: { orderId, carrier: fixture.carriers.primary, trackingCode: fixture.trackingCode },
  })
  const shipment = await apiJson(create, 201, 'create owned test waybill')
  assert.equal(shipment.orderId, orderId, 'waybill points at a different order')
  assert.equal(shipment.trackingCode, fixture.trackingCode, 'waybill lost the controlled tracking code')
  assert.ok(shipment.waybill && Array.isArray(shipment.next) && shipment.next.includes('PICKED_UP'), 'waybill omitted code or allowed next-state data')

  const patchStatus = async (status) => {
    const patch = await staff.patch(urlFor(`/api/admin/shipping/shipments/${shipment.id}`), {
      headers: { origin: base.origin }, data: { status, trackingCode: fixture.trackingCode, location: fixture.addresses[0].editTo.city },
    })
    return apiJson(patch, 200, `shipment ${status}`)
  }
  let current = await patchStatus(shipment.next.includes('PICKED_UP') ? 'PICKED_UP' : shipment.next[0])
  assert.ok(current.next.includes('IN_TRANSIT') || current.next.includes('OUT_FOR_DELIVERY') || current.next.includes('DELIVERED'), 'shipment omitted next transit state')
  const transit = current.next.includes('IN_TRANSIT') ? 'IN_TRANSIT' : current.next[0]
  current = await patchStatus(transit)
  return { id: shipment.id, waybill: shipment.waybill, trackingCode: fixture.trackingCode, status: current.status }
}

async function verifyBuyerViews(browser, buyerPage, orderId, shipment) {
  const orderPath = fixture.orderView.replace('{orderId}', String(orderId))
  await buyerPage.goto(urlFor(orderPath), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await buyerPage.locator('.sx-my-detail').waitFor({ state: 'visible', timeout: 30000 })
  await buyerPage.getByText(fixture.product.variantName, { exact: false }).first().waitFor({ state: 'visible' })
  await buyerPage.getByText(fixture.trackingCode, { exact: true }).first().waitFor({ state: 'visible' })
  await buyerPage.locator('.sx-my-card').filter({ hasText: fixture.trackingCode }).first().waitFor({ state: 'visible' })
  const invoiceLink = buyerPage.locator('a[href^="/invoice/"]').first()
  await invoiceLink.waitFor({ state: 'visible' })
  const invoicePath = new URL(await invoiceLink.getAttribute('href'), base).pathname
  const invoiceNumber = decodeURIComponent(invoicePath.split('/').at(-1))
  await expectAxe(buyerPage, 'buyer order tracking', '.sx-my-detail')
  await screenshot(buyerPage, 'buyer-order-tracking-390.png')
  const trackingUrl = urlFor(fixture.trackPath.replace('{waybill}', shipment.waybill))
  await buyerPage.goto(trackingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await buyerPage.getByText(shipment.waybill, { exact: true }).waitFor({ state: 'visible' })
  await buyerPage.getByText(fixture.trackingCode, { exact: true }).waitFor({ state: 'visible' })
  const trackingText = await buyerPage.locator('body').innerText()
  for (const address of fixture.addresses) {
    assert.ok(!trackingText.includes(address.recipient), 'public tracking exposed receiver name')
    assert.ok(!trackingText.includes(address.mobile), 'public tracking exposed receiver mobile')
    assert.ok(!trackingText.includes(address.address), 'public tracking exposed street address')
  }
  await expectAxe(buyerPage, 'public tracking', '.tk-page')
  await screenshot(buyerPage, 'public-tracking-390.png')
  await buyerPage.goto(urlFor(invoicePath), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await buyerPage.getByText(invoiceNumber, { exact: true }).first().waitFor({ state: 'visible' })
  await expectAxe(buyerPage, 'buyer invoice', '.invoice-page')
  await screenshot(buyerPage, 'buyer-invoice-390.png')

  const foreign = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    await foreign.addCookies([...fixture.foreignCookies, { name: 'theme', value: 'light', url: base.origin }])
    const otherOrder = await foreign.request.get(urlFor(orderPath))
    const orderHtml = await otherOrder.text()
    assert.ok(!orderHtml.includes('sx-my-detail'), 'foreign viewer received private order details')
    assert.ok(!orderHtml.includes(fixture.trackingCode), 'foreign viewer received buyer-only order tracking details')
    const otherInvoice = await foreign.request.get(urlFor(invoicePath))
    const invoiceHtml = await otherInvoice.text()
    assert.ok([200, 404].includes(otherInvoice.status()), `unexpected foreign invoice response ${otherInvoice.status()}`)
    assert.ok(!invoiceHtml.includes('invoice-sheet'), 'foreign viewer received the private invoice body')
    assert.ok(!invoiceHtml.includes(fixture.product.variantName), 'foreign viewer received private invoice line details')
  } finally { await foreign.close() }
  return { orderPath, invoicePath, invoiceNumber, trackingPath: new URL(trackingUrl).pathname }
}

async function main() {
  const phase = process.env.STORE_SHIPPING_PHASE || 'full'
  assert.ok(['full', 'prepare', 'purchase'].includes(phase), 'STORE_SHIPPING_PHASE must be full, prepare, or purchase')
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  let activePage
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const blocked = []
    await context.route('**/*', async (route) => {
      if (local(route.request().url())) return route.continue()
      blocked.push(new URL(route.request().url()).origin)
      return route.abort('blockedbyclient')
    })
    const page = await context.newPage()
    activePage = page
    const runtimeErrors = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))

    const staff = await context.browser().newContext()
    await staff.addCookies(fixture.staffCookies)
    const staffApi = staff.request

    let recovery
    if (phase !== 'purchase') {
      await context.addCookies(fixture.buyerCookies)
      const reset = await context.request.patch(urlFor(`/api/addresses/${fixture.addresses[0].id}`), {
        headers: { origin: base.origin }, data: fixture.addresses[0],
      })
      await apiJson(reset, 200, 'restore only the synthetic destination before preparation')
      await prepareViewport(context, page, 'light', 390, 844)
      await prepareViewport(context, page, 'dark', 390, 844)
      await prepareViewport(context, page, 'light', 1440, 1000)
      await prepareViewport(context, page, 'dark', 1440, 1000)
      await setTheme(context, 'light')
      recovery = await exerciseQuoteRecovery(context, page)
      if (phase === 'prepare') {
        assert.deepEqual(runtimeErrors, [], `browser runtime errors: ${runtimeErrors.join(' | ')}`)
        assert.deepEqual([...new Set(blocked)].filter((origin) => origin !== 'https://tile.openstreetmap.org'), [], 'unexpected blocked external origin')
        const output = { schemaVersion: 1, phase, addressId: recovery.addressId, editedCity: recovery.editedCity, quoteRecovery: 'passed', blockedExternalOrigins: [...new Set(blocked)], axeReports }
        fs.writeFileSync(path.join(outputDir, 'result-prepare.json'), JSON.stringify(output, null, 2), 'utf8')
        fs.writeFileSync(path.join(outputDir, 'axe-prepare.json'), JSON.stringify(axeReports, null, 2), 'utf8')
        console.log('Store shipping recovery browser: quote and address recovery passed')
        await staff.close(); await context.close(); return
      }
    }

    // `purchase` phase reuses the separately seeded cart and edited address in
    // a fresh fixture run; it does not create or mutate browser-visible settings.
    if (phase === 'purchase') {
      await setTheme(context, 'light')
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(urlFor(fixture.checkoutPath), { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.locator('.sx-checkout').waitFor({ state: 'visible', timeout: 60000 })
      await waitQuote(page)
      const address = fixture.addresses[0]
      if (!(await page.locator('.sh-selected-address').innerText()).includes(address.editTo.city)) {
        await editSameAddress(page, address)
        await page.locator('.sh-selected-address').filter({ hasText: address.editTo.city }).waitFor({ state: 'visible', timeout: 30000 })
        await waitQuote(page)
      }
      await assertQuoteFees(context.request, address.id, address.quoteFeesMinor.edited)
      await selectCarrier(page, fixture.carriers.secondaryName).radio.check()
    }

    const refusal = await testBackendCarrierRefusal(staffApi, page)
    const purchase = await loseCheckoutResponseAndReplay(page)
    const shipment = await createTracking(staffApi, purchase.orderId)
    purchase.waybill = shipment.waybill
    const buyerViews = await verifyBuyerViews(browser, page, purchase.orderId, shipment)
    assert.deepEqual(runtimeErrors, [], `browser runtime errors: ${runtimeErrors.join(' | ')}`)
    // The existing optional map tries its public tile host when editing an
    // address. All non-local traffic stays aborted; no real provider is called.
    assert.deepEqual([...new Set(blocked)].filter((origin) => origin !== 'https://tile.openstreetmap.org'), [], 'unexpected blocked external origin')
    const output = { schemaVersion: 1, phase, baseURL: base.origin, recovery, refusal, purchase, shipment, buyerViews, blockedExternalOrigins: [...new Set(blocked)], axeReports }
    fs.writeFileSync(path.join(outputDir, `result-${phase}.json`), JSON.stringify(output, null, 2), 'utf8')
    fs.writeFileSync(path.join(outputDir, `axe-${phase}.json`), JSON.stringify(axeReports, null, 2), 'utf8')
    console.log(`Store shipping recovery browser: address/quote recovery, carrier refusal, one wallet order replay, tracking and invoice passed; order ${purchase.orderId}`)
    await staff.close(); await context.close()
  } catch (error) {
    if (activePage) await screenshot(activePage, `failure-${phase}.png`).catch(() => {})
    throw error
  } finally { await browser.close() }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
