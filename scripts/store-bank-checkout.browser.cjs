// Bank checkout and return journeys against the task-owned isolated app/DB only.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1') throw new Error('Set MOBOCOM_ISOLATED_FIXTURE=1 for the task-owned disposable fixture')
const fixturePath = process.env.STORE_BANK_FIXTURE_PATH
if (!fixturePath || !fs.existsSync(fixturePath)) throw new Error('Set STORE_BANK_FIXTURE_PATH to the private bank checkout fixture JSON')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
assert.equal(fixture.schemaVersion, 1, 'unsupported Store bank checkout fixture schema')
assert.ok(fixture.baseURL && fixture.baselineStartPath && Array.isArray(fixture.cases), 'fixture lacks local baseURL, baseline path, or cases')
assert.equal(fixture.cases.length, 4, 'fixture must include success, cancel, inquiry-success, and uncertain journeys')
assert.ok(fixture.staffCookies?.length && fixture.foreignCookies?.length, 'fixture requires synthetic staff and foreign session cookies')
assert.ok(Array.isArray(fixture.closed) && ['VOID', 'REFUNDED', 'PAID'].every((status) => fixture.closed.some((item) => item.status === status)), 'fixture must include closed VOID, REFUNDED, and PAID invoices')
assert.equal(fixture.gatewayName, 'بانک ملت آزمایشی', 'fixture gateway label differs from the expected synthetic Mellat gateway')

const expected = new Map([
  ['public-success', { surface: 'public', checkoutPath: '/checkout/cart', mode: 'success' }],
  ['dashboard-cancel', { surface: 'dashboard', checkoutPath: '/dashboard/checkout', mode: 'cancel' }],
  ['inquiry-success', { surface: 'public', checkoutPath: '/checkout/cart', mode: 'inquiry' }],
  ['uncertain', { surface: 'public', checkoutPath: '/checkout/cart', mode: 'uncertain' }],
])
const expectedReferences = { 'public-success': '777001', 'dashboard-cancel': '777002', 'inquiry-success': '777003', uncertain: '777004' }
for (const [name, contract] of expected) {
  const item = fixture.cases.find((candidate) => candidate.name === name)
  assert.ok(item, `fixture missing ${name}`)
  assert.equal(item.surface, contract.surface, `${name} surface mismatch`)
  assert.equal(item.checkoutPath, contract.checkoutPath, `${name} checkout path mismatch`)
  assert.equal(item.mode, contract.mode, `${name} simulated bank mode mismatch`)
  assert.ok(Number.isSafeInteger(item.userId) && item.userId > 0, `${name} lacks a buyer userId`)
  assert.ok(Array.isArray(item.cookies) && item.cookies.length, `${name} lacks buyer session cookies`)
  assert.equal(String(item.referenceId), expectedReferences[name], `${name} bank reference id mismatch`)
  assert.ok(Number.isSafeInteger(item.product?.id) && item.product.id > 0 && Number.isSafeInteger(item.product.quantity) && item.product.quantity === 2, `${name} lacks the fixture product and quantity`)
  assert.equal(String(item.product.unitMinor), '110000', `${name} fixture unit amount mismatch`)
  assert.equal(item.product.variantName, 'مشکی128', `${name} fixture variant mismatch`)
}
const base = new URL(fixture.baseURL)
assert.ok(['localhost', '127.0.0.1', '::1'].includes(base.hostname), 'refusing non-local browser target')
assert.equal(base.port, '3116', 'refusing any app endpoint outside the isolated bank QA port 3116')
assert.equal(base.protocol, 'https:', 'the isolated bank browser fixture must use local HTTPS')
const baselineURL = new URL(fixture.baselineStartPath, base)
assert.equal(baselineURL.origin, base.origin, 'baseline start path must stay on the local fixture origin')

const phase = process.env.STORE_BANK_PHASE || 'full'
assert.ok(['baseline', 'full', 'views', 'integration', 'integration-views'].includes(phase), 'STORE_BANK_PHASE must be baseline, full, views, integration, or integration-views')
const integrationOnly = phase === 'integration' || phase === 'integration-views'
const viewsOnly = phase === 'views' || phase === 'integration-views'
const outputDir = path.resolve(process.env.STORE_BANK_OUTPUT_DIR || '.next-dev/final-browser')
fs.mkdirSync(outputDir, { recursive: true })
const bankURL = 'https://bpm.shaparak.ir/pgwchannel/startpay.mellat'
const urlFor = (pathname) => new URL(pathname, base).toString()
const digit = (value) => String(value).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sanitizeVisibleText = (value) => String(value || '')
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
  .replace(/BANKQA[A-Z0-9]+/gi, 'BANKQA[ref]')
  .replace(/\b[A-Z]{2,}[-_][A-Z0-9_-]{5,}\b/g, '[invoice-or-reference]')
  .replace(/(?<!\w)\+?\d[\d ()-]{7,}\d(?!\w)/g, '[phone-or-number]')
  .replace(/[0-9۰-۹٠-٩]{6,}/g, '[number]')
const sanitizedLocation = (raw) => {
  try {
    const url = new URL(raw)
    const pathname = url.pathname
      .replace(/(\/dashboard\/invoices?\/)[^/]+/i, '$1[redacted]')
      .replace(/(\/invoice\/)[^/]+/i, '$1[redacted]')
      .replace(/(\/(?:dashboard\/)?orders\/)[1-9]\d*/i, '$1[redacted]')
    return { origin: url.origin, pathname, queryKeys: [...new Set(url.searchParams.keys())] }
  } catch { return '[unavailable]' }
}
const evidence = { axeReports: [], screenshots: [], errors: [], blockedOrigins: new Set() }
const screenshot = async (page, name) => {
  const file = path.join(outputDir, name)
  await page.screenshot({ path: file, fullPage: true, caret: 'initial', animations: 'disabled' })
  evidence.screenshots.push(path.relative(process.cwd(), file).replace(/\\/g, '/'))
}
const expectNoOverflow = async (page, label) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: horizontal overflow at ${page.viewportSize()?.width}px`)
const recordPageErrors = (page, phaseName) => {
  page.on('console', (message) => { if (message.type() === 'error') evidence.errors.push({ phase: phaseName, type: 'console', message: message.text() }) })
  page.on('pageerror', (error) => evidence.errors.push({ phase: phaseName, type: 'pageerror', message: error.message }))
}

async function expectAxe(page, label) {
  const axeSource = fs.readFileSync(require.resolve('axe-core'), 'utf8')
  await page.evaluate((source) => {
    const nonce = document.querySelector('script[nonce]')?.nonce || ''
    if (!nonce) throw new Error('No CSP-authorized nonce was available for local axe injection')
    const script = document.createElement('script')
    script.nonce = nonce
    script.textContent = source
    document.head.appendChild(script)
  }, axeSource)
  const result = await page.locator('.card.text-center').evaluate((root) => window.axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }))
  const report = result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help, nodes: violation.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })) }))
  fs.writeFileSync(path.join(outputDir, `axe-${label}.json`), JSON.stringify(report, null, 2), 'utf8')
  evidence.axeReports.push({ label, selector: '.card.text-center', violationCount: report.length, violations: report })
  assert.equal(result.violations.length, 0, `${label}: axe violations ${result.violations.map((violation) => violation.id).join(', ')}`)
}

async function setSession(context, cookies, theme = 'light') {
  await context.clearCookies()
  await context.addCookies([...cookies.filter((cookie) => cookie.name !== 'theme'), { name: 'theme', value: theme, url: base.origin }])
}

async function installLocalOnlyRoutes(context, getActiveCase, getBankRequests) {
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.url() === bankURL) {
      const received = { url: request.url(), method: request.method() }
      getBankRequests().push(received)
      const activeCase = getActiveCase()
      if (!activeCase) return route.abort('blockedbyclient')
      assert.equal(request.method(), 'POST', 'Mellat start page must POST its RefId to the fixed bank endpoint')
      const posted = new URLSearchParams(request.postData() || '')
      const refId = posted.get('RefId') || ''
      assert.ok(refId.startsWith('BANKQA') && /^\d+$/.test(refId.slice(6)), 'Mellat start form did not post the synthetic reference')
      const saleOrderId = refId.slice(6)
      Object.assign(received, { refId, saleOrderId, referenceId: activeCase.referenceId })
      const resultCode = activeCase.mode === 'cancel' ? '17' : '0'
      const callback = urlFor('/api/payment/mellat/callback')
      const html = `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>بانک ملت آزمایشی</title><body><main><h1>بانک ملت آزمایشی</h1><p>پرداخت شبیه‌سازی‌شده، بدون تماس با بانک واقعی</p><form method="post" action="${callback}"><input type="hidden" name="RefId" value="${refId}"><input type="hidden" name="SaleOrderId" value="${saleOrderId}"><input type="hidden" name="SaleReferenceId" value="${activeCase.referenceId}"><button type="submit" name="ResCode" value="${resultCode}">${activeCase.mode === 'cancel' ? 'لغو و بازگشت به فروشگاه' : 'تأیید پرداخت آزمایشی'}</button></form></main></body></html>`
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
    }
    if (url.origin === base.origin) return route.continue()
    evidence.blockedOrigins.add(url.origin)
    return route.abort('blockedbyclient')
  })
}

async function baselineWithoutNonce(browser) {
  const item = fixture.cases.find((candidate) => candidate.name === 'public-success')
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fa-IR', ignoreHTTPSErrors: true })
  await setSession(context, item.cookies)
  const bankRequests = []
  await installLocalOnlyRoutes(context, () => null, () => bankRequests)
  const page = await context.newPage()
  recordPageErrors(page, 'result-views')
  const consoleErrors = []
  page.on('console', (message) => { if (message.type() === 'error') { consoleErrors.push(message.text()); evidence.errors.push({ phase: 'baseline', type: 'console', message: message.text() }) } })
  page.on('pageerror', (error) => { consoleErrors.push(error.message); evidence.errors.push({ phase: 'baseline', type: 'pageerror', message: error.message }) })
  await page.goto(baselineURL.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await delay(1500)
  assert.equal(new URL(page.url()).origin, base.origin, 'baseline unexpectedly navigated away from the local app')
  assert.equal(bankRequests.length, 0, 'baseline unexpectedly reached the mock/real bank endpoint')
  assert.ok(consoleErrors.some((message) => /content security policy|refused to execute|inline script|violat.*script/i.test(message)), `baseline did not reproduce a CSP console error: ${consoleErrors.join(' | ')}`)
  await screenshot(page, 'baseline-mellat-start-csp-blocked-390.png')
  await context.close()
  return { cspErrors: consoleErrors.length, bankNavigations: bankRequests.length }
}

function expectedInvoicePath(invoiceNumber, surface) {
  const encoded = encodeURIComponent(invoiceNumber)
  return surface === 'dashboard' ? `/dashboard/invoices/${encoded}` : `/invoice/${encoded}`
}

async function submitMockBank(page, caseData, bankInfo) {
  assert.equal(bankInfo.refId, `BANKQA${bankInfo.saleOrderId}`, 'mock-bank RefId shape differs')
  assert.equal(String(bankInfo.referenceId), String(caseData.referenceId), 'mock-bank reference differs from the active fixture case')
  assert.ok(bankInfo.saleOrderId.length > 0, 'mock-bank SaleOrderId is empty')
  const bankHeading = page.getByRole('heading', { name: 'بانک ملت آزمایشی', exact: true })
  await bankHeading.waitFor({ state: 'visible', timeout: 30000 })
  const buttonName = caseData.mode === 'cancel' ? 'لغو و بازگشت به فروشگاه' : 'تأیید پرداخت آزمایشی'
  await page.getByRole('button', { name: buttonName, exact: true }).click()
}

async function captureResult(page, context, caseData, checkoutData, bankInfo, bankRequests, cspErrors, latestStartHTML) {
  const orderId = Number(checkoutData.orderId)
  const invoiceNumber = String(checkoutData.invoiceNumber || '')
  assert.ok(Number.isSafeInteger(orderId) && orderId > 0, `${caseData.name}: checkout did not return an order id`)
  assert.ok(invoiceNumber, `${caseData.name}: checkout did not return an invoice number`)
  const paymentURL = new URL(checkoutData.paymentUrl || '', base)
  assert.equal(paymentURL.origin, base.origin, `${caseData.name}: payment URL escaped the local fixture origin`)
  assert.equal(paymentURL.pathname, '/api/payment/mellat/start', `${caseData.name}: payment URL did not use the local Mellat start route`)

  await submitMockBank(page, caseData, bankInfo)
  await page.waitForURL((url) => /\/payment\/result$/.test(url.pathname), { timeout: 60000 })
  const resultUrl = page.url()
  const parsed = new URL(resultUrl)
  assert.equal(parsed.searchParams.get('order'), String(orderId), `${caseData.name}: return did not preserve the same order`)
  const card = page.locator('.card.text-center')
  await card.waitFor({ state: 'visible', timeout: 30000 })
  const resultHeading = (await card.locator('h1').innerText()).trim()

  if (caseData.mode === 'success' || caseData.mode === 'inquiry') {
    assert.equal(resultHeading, 'پرداخت با موفقیت انجام شد', `${caseData.name}: persisted payment is not shown as successful`)
    assert.equal(parsed.searchParams.has('failed'), false, `${caseData.name}: successful return is flagged failed`)
  } else if (caseData.mode === 'cancel') {
    assert.equal(resultHeading, 'پرداخت انجام نشد', 'bank cancellation is not shown as a failed payment')
    assert.equal(parsed.searchParams.get('failed'), '1', 'bank cancellation did not produce a failed return')
    assert.match(await page.locator('.error-text[role="alert"]').innerText(), /منصرف شد/, 'bank cancellation reason is missing from the result page')
    const retry = page.getByRole('link', { name: 'تلاش دوباره', exact: true })
    assert.equal(await retry.getAttribute('href'), expectedInvoicePath(invoiceNumber, caseData.surface), 'Retry must continue the same owned invoice, not create a new cart checkout')
    await retry.click()
    await page.locator('.invoice-status').waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(new URL(page.url()).pathname, expectedInvoicePath(invoiceNumber, caseData.surface), 'Retry did not open the same invoice')
    const resume = page.locator('.invoice-pay a').filter({ hasText: /پرداخت با درگاه بانک ملت|پرداخت/ }).first()
    await resume.waitFor({ state: 'visible', timeout: 30000 })
    const resumeHref = await resume.getAttribute('href')
    assert.ok(resumeHref, 'same-invoice retry did not expose a payment link')
    const resumeURL = new URL(resumeHref, base)
    assert.equal(resumeURL.origin, base.origin, 'retry payment link escaped the local fixture origin')
    assert.equal(resumeURL.pathname, '/api/payment/mellat/start', 'retry payment link did not continue the same Mellat invoice')
    assert.equal(resumeURL.searchParams.get('ref'), new URL(checkoutData.paymentUrl, base).searchParams.get('ref'), 'retry changed the invoice bank reference')
    const retryBankRequestPromise = page.waitForRequest((request) => request.url() === bankURL, { timeout: 60000 })
    const retryStartResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/payment/mellat/start', { timeout: 60000 })
    await resume.click()
    const [, retryStartResponse] = await Promise.all([retryBankRequestPromise, retryStartResponsePromise])
    await page.getByRole('heading', { name: 'بانک ملت آزمایشی', exact: true }).waitFor({ state: 'visible' })
    const retryHtml = latestStartHTML()
    const retryNonce = retryHtml.match(/<script nonce="([^"]+)">/)
    assert.ok(retryNonce, 'same-invoice retry start page omitted its CSP nonce')
    assert.ok((retryStartResponse.headers()['content-security-policy'] || '').includes(`'nonce-${retryNonce[1]}'`), 'same-invoice retry nonce does not match its CSP')
    const retryBankInfo = bankRequests[1]
    assert.ok(retryBankInfo, 'same-invoice retry did not auto-post to the bank')
    assert.equal(retryBankInfo.refId, bankInfo.refId, 'same-invoice retry changed the bank RefId')
    await submitMockBank(page, caseData, retryBankInfo)
    await page.waitForURL((url) => /\/payment\/result$/.test(url.pathname), { timeout: 60000 })
    assert.equal(new URL(page.url()).searchParams.get('order'), String(orderId), 'same-invoice cancellation retry changed the order')
    assert.equal(new URL(page.url()).searchParams.get('failed'), '1', 'second bank cancellation did not remain failed')
    assert.equal(cspErrors.length, 0, `same-invoice retry had a CSP/script error: ${cspErrors.join(' | ')}`)
    assert.equal(bankRequests.length, 2, 'canceled journey should have exactly two mock bank handoffs')
  } else {
    assert.equal(resultHeading, 'پرداخت انجام نشد', 'uncertain bank result must stay unconfirmed')
    const text = await card.innerText()
    assert.match(text, /پرداخت موفق ثبت نشده است/, 'uncertain result does not explain that payment was not confirmed')
    assert.doesNotMatch(text, /مبلغی از شما کسر نشد|ظرف ۷۲ ساعت|ظرف 72 ساعت|وجه.*بازگردانده شد|refund.*within 72/i, 'uncertain bank response promises a refund that was not confirmed')
    assert.doesNotMatch(text, /پرداخت تأیید شد/, 'uncertain bank response is falsely presented as paid')
  }

  // Reload the canonical result route to prove the page reads the persisted invoice/order state.
  await page.goto(resultUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.card.text-center').waitFor({ state: 'visible', timeout: 30000 })
  const invoicePath = expectedInvoicePath(invoiceNumber, caseData.surface)
  await page.goto(urlFor(invoicePath), { waitUntil: 'domcontentloaded', timeout: 60000 })
  const status = page.locator('.invoice-status')
  await status.waitFor({ state: 'visible', timeout: 30000 })
  assert.ok((await page.locator('.invoice-meta').innerText()).includes(fixture.gatewayName), `${caseData.name}: persisted invoice does not identify the selected gateway`)
  if (caseData.mode === 'success' || caseData.mode === 'inquiry') assert.match(await status.getAttribute('class'), /is-paid/, `${caseData.name}: invoice is not persisted as PAID`)
  else assert.match(await status.getAttribute('class'), /is-unpaid/, `${caseData.name}: unresolved/canceled invoice state changed unexpectedly`)

  if (caseData.mode === 'cancel') {
    assert.equal(new URL(page.url()).pathname, invoicePath, 'retry left the original invoice')
    assert.equal((await page.locator('.invoice-number').innerText()).trim(), invoiceNumber, 'retry opened a different invoice')
  }

  // Repeat the exact synthetic bank callback twice; a replay may redirect but must not fabricate success.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await context.request.post(urlFor('/api/payment/mellat/callback'), {
      headers: { origin: base.origin },
      form: {
        RefId: bankInfo.refId,
        SaleOrderId: bankInfo.saleOrderId,
        SaleReferenceId: caseData.referenceId,
        ResCode: caseData.mode === 'cancel' ? '17' : '0',
      },
      maxRedirects: 0,
    })
    assert.equal(response.status(), 303, `${caseData.name}: callback replay did not return a safe redirect`)
    const location = response.headers().location || ''
    assert.match(location, /payment\/result|\/invoice\//, `${caseData.name}: replay redirected to an unexpected location`)
  }

  if (caseData.mode === 'success') {
    const trackingPath = `/dashboard/orders/${orderId}`
    await page.goto(urlFor(trackingPath), { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.locator('.sx-my-detail').waitFor({ state: 'visible', timeout: 30000 })
    assert.ok(digit(await page.locator('.sx-my-detail h1').innerText()).includes(String(orderId)), 'buyer tracking opened a different order')
  }

  return { resultUrl, orderId, invoiceNumber, invoicePath }
}

async function checkFinalResultViews(browser, caseData, resultUrl) {
  const context = await browser.newContext({ locale: 'fa-IR', ignoreHTTPSErrors: true })
  await setSession(context, caseData.cookies)
  const bankRequests = []
  await installLocalOnlyRoutes(context, () => null, () => bankRequests)
  const page = await context.newPage()
  recordPageErrors(page, 'foreign-denial')
  for (const theme of ['light', 'dark']) {
    await context.clearCookies()
    await context.addCookies([...caseData.cookies.filter((cookie) => cookie.name !== 'theme'), { name: 'theme', value: theme, url: base.origin }])
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport)
      await page.goto(resultUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.locator('.card.text-center').waitFor({ state: 'visible', timeout: 30000 })
      const label = `${caseData.name}-${theme}-${viewport.width}`
      await expectNoOverflow(page, label)
      await expectAxe(page, label)
      await screenshot(page, `result-${label}.png`)
    }
  }
  assert.equal(bankRequests.length, 0, `${caseData.name}: result-view inspection unexpectedly contacted the mock bank`)
  await context.close()
}

async function checkForeignDenied(browser, caseData, invoiceNumber) {
  const context = await browser.newContext({ locale: 'fa-IR', ignoreHTTPSErrors: true })
  await setSession(context, fixture.foreignCookies)
  const bankRequests = []
  await installLocalOnlyRoutes(context, () => null, () => bankRequests)
  const page = await context.newPage()
  await page.goto(urlFor(`/payment/result?invoice=${encodeURIComponent(invoiceNumber)}`), { waitUntil: 'domcontentloaded', timeout: 60000 })
  const text = await page.locator('.card.text-center').innerText()
  assert.match(text, /فاکتور در حساب شما پیدا نشد|Invoice not found in your account/, 'foreign user was shown another buyer\'s invoice result')
  assert.ok(!text.includes(invoiceNumber), 'foreign user can read the buyer invoice number')
  assert.equal(bankRequests.length, 0, 'foreign denial unexpectedly navigated to the bank')
  await context.close()
}

async function checkClosedInvoicesAndNonce(browser, caseData) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fa-IR', ignoreHTTPSErrors: true })
  await setSession(context, caseData.cookies)
  const bankRequests = []
  await installLocalOnlyRoutes(context, () => null, () => bankRequests)

  // A visitor-supplied header must not control the nonce trusted by the response CSP.
  const nonceResponse = await context.request.get(baselineURL.toString(), { headers: { 'x-nonce': 'visitor-controlled-nonce' }, maxRedirects: 0 })
  assert.equal(nonceResponse.status(), 200, 'nonce probe did not load the local Mellat start page')
  const nonceHtml = await nonceResponse.text()
  const nonce = nonceHtml.match(/<script nonce="([^"]+)">/)
  assert.ok(nonce, 'Mellat start page omitted its script nonce')
  assert.notEqual(nonce[1], 'visitor-controlled-nonce', 'visitor-controlled x-nonce was trusted')
  assert.ok((nonceResponse.headers()['content-security-policy'] || '').includes(`'nonce-${nonce[1]}'`), 'Mellat script nonce does not match the response CSP')

  const closedResults = []
  for (const closed of fixture.closed) {
    const startURL = new URL(closed.startPath, base)
    assert.equal(startURL.origin, base.origin, `${closed.status}: closed invoice start escaped the local origin`)
    const response = await context.request.get(startURL.toString(), { maxRedirects: 0 })
    assert.equal(response.status(), 303, `${closed.status}: closed invoice start did not redirect to the invoice`)
    const location = new URL(response.headers().location || '', base)
    const invoiceURL = new URL(closed.invoicePath, base)
    assert.equal(location.origin, base.origin, `${closed.status}: closed invoice redirect escaped the local origin`)
    assert.equal(location.pathname, invoiceURL.pathname, `${closed.status}: closed invoice redirected to another path`)
    closedResults.push({ status: closed.status, invoicePath: invoiceURL.pathname })

    if (closed.status === 'PAID' || closed.status === 'REFUNDED') {
      const invoiceNumber = decodeURIComponent(invoiceURL.pathname.split('/').filter(Boolean).at(-1))
      const page = await context.newPage()
      recordPageErrors(page, `closed-${closed.status}`)
      await page.goto(urlFor(`/payment/result?invoice=${encodeURIComponent(invoiceNumber)}&failed=1&reason=fake`), { waitUntil: 'domcontentloaded', timeout: 60000 })
      const card = page.locator('.card.text-center')
      await card.waitFor({ state: 'visible', timeout: 30000 })
      const heading = (await card.locator('h1').innerText()).trim()
      assert.equal(heading, closed.status === 'PAID' ? 'پرداخت با موفقیت انجام شد' : 'پرداخت مسترد شده است', `${closed.status}: persisted invoice status did not override a failed callback query`)
      assert.equal(await page.locator('.error-text[role="alert"]').count(), 0, `${closed.status}: stale callback failure reason leaked into the persisted result`)
      await expectNoOverflow(page, `closed ${closed.status} result`)
      await page.close()
    }
  }
  assert.equal(bankRequests.length, 0, 'closed-invoice or nonce probes unexpectedly reached the mock bank')
  await context.close()
  return { nonceProbe: 'passed', closedInvoices: closedResults }
}

async function run() {
  let browser
  let currentPage = null
  let currentCase = phase
  const progressCases = []
  try {
    browser = await chromium.launch({ headless: true })
    if (phase === 'baseline') {
      const baseline = await baselineWithoutNonce(browser)
      const result = { schemaVersion: 1, phase: 'baseline', baseline, errors: evidence.errors, blockedOrigins: [...evidence.blockedOrigins], screenshots: evidence.screenshots }
      fs.writeFileSync(path.join(outputDir, 'result-baseline.json'), JSON.stringify(result, null, 2), 'utf8')
      console.log(JSON.stringify(result, null, 2))
      return
    }
    const results = []
    let publicSuccess
    if (viewsOnly) {
      const progress = JSON.parse(fs.readFileSync(path.join(outputDir, 'progress-receipt.json'), 'utf8'))
      for (const item of fixture.cases.filter(item => !integrationOnly || item.name === 'public-success')) {
        const completed = progress.cases.find(row => row.name === item.name && row.state === 'completed')
        assert.ok(completed, `${item.name}: cannot resume views without a completed real checkout journey`)
        results.push({ ...completed, surface: item.surface, mode: item.mode })
      }
      publicSuccess = results.find(row => row.name === 'public-success')
    } else fs.writeFileSync(path.join(outputDir, 'progress-receipt.json'), JSON.stringify({ schemaVersion: 1, phase: 'full', cases: progressCases }, null, 2), 'utf8')
    for (const caseData of viewsOnly ? [] : fixture.cases.filter(item => !integrationOnly || item.name === 'public-success')) {
      currentCase = caseData.name
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fa-IR', ignoreHTTPSErrors: true })
      await setSession(context, caseData.cookies)
      const bankRequests = []
      await installLocalOnlyRoutes(context, () => caseData, () => bankRequests)
      const page = await context.newPage()
      currentPage = page
      let capturedCheckout = null, capturedStartHTML = ''
      // Read through the real responses before cross-origin navigation clears
      // Chromium's response-body buffers. Forward original status/headers/body.
      await page.route('**/api/cart/checkout', async route => {
        const response = await route.fetch()
        capturedCheckout = await response.json()
        await route.fulfill({ response })
      })
      await page.route('**/api/payment/mellat/start?*', async route => {
        const response = await route.fetch()
        capturedStartHTML = await response.text()
        await route.fulfill({ response })
      })
      const cspErrors = []
      let checkoutPosts = 0
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/cart/checkout' && request.method() === 'POST') checkoutPosts++
      })
      page.on('console', (message) => {
        if (message.type() === 'error') {
          evidence.errors.push({ case: caseData.name, type: 'console', message: message.text() })
          if (/content security policy|refused to execute|inline script|violat.*script/i.test(message.text())) cspErrors.push(message.text())
        }
      })
      page.on('pageerror', (error) => {
        evidence.errors.push({ case: caseData.name, type: 'pageerror', message: error.message })
        cspErrors.push(error.message)
      })
      await page.goto(urlFor(caseData.checkoutPath), { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.locator('.sx-checkout').waitFor({ state: 'visible', timeout: 60000 })
      // Wait until the address GET and React hydration settle before changing this controlled option.
      await page.locator('.sh-panel[aria-labelledby="sh-address-title"] .sh-empty').waitFor({ state: 'visible', timeout: 60000 })
      const pickup = page.getByRole('checkbox', { name: /تحویل حضوری از فروشگاه/ })
      await pickup.waitFor({ state: 'visible', timeout: 30000 })
      await pickup.check()
      if (integrationOnly) {
        await page.getByRole('checkbox', { name: 'این سفارش هدیه است', exact: true }).check()
        await page.getByLabel('نام گیرندهٔ هدیه', { exact: true }).fill('گیرندهٔ آزمایشی ادغام بانکی')
        await page.getByLabel('پیام همراه هدیه').fill('پیام هدیهٔ آزمایشی پیش از PR')
        await page.getByRole('checkbox', { name: 'بسته‌بندی هدیهٔ رایگان', exact: true }).check()
      }
      const productRow = page.locator('.sx-review-lines li').filter({ hasText: caseData.product.variantName }).first()
      await productRow.waitFor({ state: 'visible', timeout: 30000 })
      assert.equal(digit(await productRow.locator('.num').innerText()).replace(/\D/g, ''), String(caseData.product.quantity), `${caseData.name}: product quantity differs from the prepared cart`)
      const gateways = page.locator('.sh-gateways label').filter({ hasText: fixture.gatewayName })
      if (await page.locator('.sh-gateways').count()) {
        await gateways.waitFor({ state: 'visible', timeout: 30000 })
        assert.equal(await gateways.locator('input[name="gateway"]').isChecked(), true, `${caseData.name}: the fixture Mellat gateway was not selected`)
      }
      const pay = page.locator('button.sh-pay')
      await pay.waitFor({ state: 'visible', timeout: 30000 })
      await page.waitForFunction(() => {
        const button = document.querySelector('button.sh-pay')
        return button instanceof HTMLButtonElement && !button.disabled
      }, null, { timeout: 30000 })

      const bankRequestPromise = page.waitForRequest((request) => request.url() === bankURL, { timeout: 60000 })
      const checkoutResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/cart/checkout' && response.request().method() === 'POST', { timeout: 60000 })
      const startResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/payment/mellat/start', { timeout: 60000 })
      await pay.click()
      const [checkoutResponse, startResponse, bankRequest] = await Promise.all([
        checkoutResponsePromise,
        startResponsePromise,
        bankRequestPromise,
      ])
      assert.equal(checkoutResponse.status(), 200, `${caseData.name}: checkout failed with ${checkoutResponse.status()}`)
      const checkoutData = capturedCheckout
      assert.ok(checkoutData, 'real checkout response was not captured before navigation')
      const requestedPaymentURL = new URL(checkoutData.paymentUrl || '', base)
      const checkoutReceipt = {
        name: caseData.name,
        state: 'checkout_created',
        orderId: Number(checkoutData.orderId) || null,
        invoiceNumber: String(checkoutData.invoiceNumber || ''),
        paymentURL: requestedPaymentURL.toString(),
        ref: requestedPaymentURL.searchParams.get('ref') || '',
      }
      progressCases.push(checkoutReceipt)
      fs.writeFileSync(path.join(outputDir, 'progress-receipt.json'), JSON.stringify({ schemaVersion: 1, phase: 'full', cases: progressCases }, null, 2), 'utf8')
      const startHtml = capturedStartHTML
      const nonce = startHtml.match(/<script nonce="([^"]+)">/)
      assert.ok(nonce, `${caseData.name}: Mellat start page omitted its CSP nonce`)
      const csp = startResponse.headers()['content-security-policy'] || ''
      assert.ok(csp.includes(`'nonce-${nonce[1]}'`), `${caseData.name}: script nonce does not match the response CSP`)
      assert.equal(cspErrors.length, 0, `${caseData.name}: CSP/browser script error: ${cspErrors.join(' | ')}`)
      await page.getByRole('heading', { name: 'بانک ملت آزمایشی', exact: true }).waitFor({ state: 'visible' })
      assert.equal(bankRequests.length, 1, `${caseData.name}: expected exactly one auto-post to the fixed mock bank URL`)
      const bankInfo = bankRequests[0]
      assert.equal(bankInfo.url, bankRequest.url(), `${caseData.name}: observed browser bank request differs from intercepted request`)
      const resultData = await captureResult(page, context, caseData, checkoutData, bankInfo, bankRequests, cspErrors, () => capturedStartHTML)
      assert.equal(checkoutPosts, 1, `${caseData.name}: journey created another checkout instead of reusing its invoice`)
      const completed = { name: caseData.name, mode: caseData.mode, surface: caseData.surface, ...resultData }
      results.push(completed)
      Object.assign(checkoutReceipt, { state: 'completed', resultUrl: resultData.resultUrl, invoicePath: resultData.invoicePath })
      fs.writeFileSync(path.join(outputDir, 'progress-receipt.json'), JSON.stringify({ schemaVersion: 1, phase: 'full', cases: progressCases }, null, 2), 'utf8')
      if (caseData.name === 'public-success') publicSuccess = resultData
      await context.close()
      currentPage = null
    }

    assert.ok(publicSuccess, 'public success fixture did not complete')
    const closedChecks = await checkClosedInvoicesAndNonce(browser, fixture.cases.find((candidate) => candidate.name === 'public-success'))
    await checkForeignDenied(browser, fixture.cases.find((candidate) => candidate.name === 'public-success'), publicSuccess.invoiceNumber)
    for (const item of results) {
      const caseData = fixture.cases.find((candidate) => candidate.name === item.name)
      await checkFinalResultViews(browser, caseData, item.resultUrl)
    }
    const result = {
      schemaVersion: 1,
      phase,
      resumedCompletedJourneys: viewsOnly,
      cases: results,
      closedChecks,
      axeReports: evidence.axeReports,
      screenshots: evidence.screenshots,
      errors: evidence.errors,
      blockedOrigins: [...evidence.blockedOrigins],
    }
    assert.equal(result.axeReports.length, integrationOnly ? 4 : 16, 'expected scoped axe reports for the selected real journeys × 2 themes × 2 viewports')
    fs.writeFileSync(path.join(outputDir, 'result-full.json'), JSON.stringify(result, null, 2), 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failure = {
      schemaVersion: 1,
      phase,
      case: currentCase,
      error: error instanceof Error ? error.message : String(error),
      progress: progressCases,
      url: null,
      bodyText: '',
    }
    if (currentPage && !currentPage.isClosed()) {
      const safeName = String(currentCase).replace(/[^a-zA-Z0-9-]/g, '-') || 'unknown'
      const screenshotPath = path.join(outputDir, `failure-${safeName}.png`)
      await currentPage.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' }).catch(() => {})
      failure.screenshot = path.relative(process.cwd(), screenshotPath).replace(/\\/g, '/')
      failure.url = sanitizedLocation(currentPage.url())
      failure.bodyText = sanitizeVisibleText(await currentPage.locator('body').innerText().catch(() => '')).slice(0, 12000)
    }
    fs.writeFileSync(path.join(outputDir, `failure-${String(currentCase).replace(/[^a-zA-Z0-9-]/g, '-') || 'unknown'}.json`), JSON.stringify(failure, null, 2), 'utf8')
    throw error
  } finally {
    await browser?.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
