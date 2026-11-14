const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { randomUUID, createHash } = require('node:crypto')
const taskKey = label => { const h = createHash('sha256').update(label).digest('hex').slice(0, 32); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20)}` }
const { PrismaClient } = require(process.env.PLATFORM_COMPLETION_PRISMA || '@prisma/client')
const { chromium, expect: baseExpect } = require('@playwright/test')

const db = new PrismaClient()
assert.equal(new URL(process.env.DATABASE_URL || '').pathname, '/mobocom_completion_test_20261114', 'Exact task-only database required')
const expect = baseExpect.configure({ timeout: 60000 })
const fixturePath = process.env.PLATFORM_COMPLETION_FIXTURE_PATH || path.join(process.cwd(), 'var', 'completion-fixture.private.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const output = process.env.PLATFORM_COMPLETION_OUTPUT || path.join(process.cwd(), 'var', 'opening-completion-20261114')
const progressFile = path.join(output, 'progress.json')
if (process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || fixture.baseURL !== 'https://localhost:3122' || fixture.databaseName !== '/mobocom_completion_test_20261114') {
  throw Error('Explicit isolated platform-completion browser fixture required')
}
fs.mkdirSync(output, { recursive: true })
const prior = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, 'utf8')) : { operations: {} }
const operations = prior.operations || {}
const phase = process.env.PLATFORM_COMPLETION_PHASE || 'all'
if (!['all', 'public', 'commerce', 'quality'].includes(phase)) throw Error('Unknown acceptance phase')
const views = (prior.views || []).filter(view => !view.overflow && view.violations?.length === 0)
const pageErrors = []
const blockedExternal = new Set()
const record = () => fs.writeFileSync(progressFile, JSON.stringify({ operations, views, pageErrors, blockedExternal: [...blockedExternal] }, null, 2))

async function main() {
  const browser = await chromium.launch({ headless: true })
  const contexts = []
  try {
    async function open(width, theme, role, lowData = false) {
      const context = await browser.newContext({
        baseURL: fixture.baseURL, ignoreHTTPSErrors: true, viewport: { width, height: 1000 },
        timezoneId: 'Asia/Tehran', locale: 'fa-IR', colorScheme: theme, reducedMotion: 'reduce',
      })
      contexts.push(context)
      const cookies = role === 'staff' ? fixture.staffCookies : role === 'buyer' ? fixture.buyerCookies : []
      await context.addCookies([
        ...cookies,
        { name: 'theme', value: theme, url: fixture.baseURL },
        ...(lowData ? [{ name: 'mobocom-low-data', value: '1', url: fixture.baseURL, sameSite: 'Lax' }] : []),
      ])
      await context.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin === fixture.baseURL) return route.continue()
        blockedExternal.add(url.origin)
        if (url.origin === 'https://www.youtube-nocookie.com' && url.pathname === '/embed/dQw4w9WgXcQ') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="fa"><title>رسانهٔ مصنوعی آزمون محلی</title><body>رسانهٔ مصنوعی؛ هیچ درخواستی به سرویس بیرونی فرستاده نشد.</body></html>' })
        return route.abort()
      })
      const page = await context.newPage()
      page.on('pageerror', error => { pageErrors.push(error.message); record() })
      async function visit(url) {
        console.log("Visit " + url.replace(/quote\/[a-f0-9]+/, "quote/[private]"))
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
            assert(response, `No document response for ${url}`)
            assert.equal(response.status(), 200, `${url} returned ${response.status()}`)
            return response
          } catch (error) {
            if (attempt === 2 || !String(error).includes('net::ERR_EMPTY_RESPONSE')) throw error
            await expect.poll(async () => { try { return (await context.request.get('/api/health/ready')).status() } catch { return 0 } }, { timeout: 30000 }).toBe(200)
          }
        }
      }
      async function post(url, body) {
        const response = await context.request.post(url, { headers: { Origin: fixture.baseURL }, data: body })
        const data = await response.json().catch(() => ({}))
        return { response, data }
      }
      async function capture(name, locator) {
        if (views.some(view => view.name === name && view.width === width && view.theme === theme)) return
        await expect(locator).toBeVisible()
        const readyControl = page.getByRole('button', { name: /^حالت کم‌مصرف/, includeHidden: true })
        if (await readyControl.count()) await expect(readyControl).toBeEnabled()
        await page.evaluate(() => document.fonts.ready)
        await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
        const violations = await locator.evaluate(async root => (await window.axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })))
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
        views.push({ name, width, theme, violations, overflow })
        record()
        await page.screenshot({ path: path.join(output, `${name}-${theme}-${width}.png`), fullPage: true, caret: 'initial', animations: 'disabled' })
        assert.deepEqual(violations, [], `${name} axe at ${width}/${theme}`)
        assert.equal(overflow, false, `${name} horizontal overflow at ${width}/${theme}`)
        console.log(`${name} ${width}/${theme} passed`)
      }
      return { context, page, visit, post, capture }
    }

    async function commerceJourneys() {
    const onlineTitle = `Opening completion online ${fixture.buyerId}`
    const counterTitle = `Opening completion counter ${fixture.buyerId}`
    async function ensureQuotation(title) {
      let row = await db.storeQuotation.findFirst({ where: { createdById: fixture.staffId, userId: fixture.buyerId, title }, orderBy: { createdAt: 'asc' } })
      if (row) return row
      const staff = await open(1440, 'light', 'staff')
      await staff.visit('/admin/store/quotations')
      await staff.page.getByLabel('جست‌وجوی مشتری با نام یا موبایل', { exact: true }).fill('09121112233')
      await expect(staff.page.getByLabel('مشتری پیشنهاد', { exact: true }).locator(`option[value="${fixture.buyerId}"]`)).toBeAttached()
      await staff.page.getByLabel('مشتری پیشنهاد', { exact: true }).selectOption(String(fixture.buyerId))
      await staff.page.getByLabel('جست‌وجوی کالا', { exact: true }).fill('دستگاه آزمایشی تکمیل گردش فروش')
      const productSelect = staff.page.getByLabel('کالا', { exact: true })
      await expect(productSelect.locator(`option[value="${fixture.productId}"]`)).toBeAttached()
      await productSelect.selectOption(String(fixture.productId))
      await staff.page.getByRole('button', { name: 'افزودن به پیشنهاد', exact: true }).click()
      await staff.page.getByLabel('عنوان پیشنهاد', { exact: true }).fill(title)
      await staff.page.getByLabel('تخفیف فروشنده، به واحد پول کالاها', { exact: true }).fill('100')
      const localExpiry = await staff.page.evaluate(() => new Date(Date.now() + 60 * 60 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16))
      await staff.page.getByLabel('اعتبار تا تاریخ و ساعت', { exact: true }).fill(localExpiry)
      const created = staff.page.waitForResponse(response => response.url().endsWith('/api/admin/store/quotations') && response.request().method() === 'POST')
      await staff.page.getByRole('button', { name: 'ثبت و ساخت لینک پیش‌فاکتور', exact: true }).click()
      const result = await created
      const payload = await result.json().catch(() => ({}))
      assert.equal(result.status(), 201, JSON.stringify(payload))
      row = await db.storeQuotation.findFirstOrThrow({ where: { createdById: fixture.staffId, userId: fixture.buyerId, title }, orderBy: { createdAt: 'asc' } })
      assert.equal(row.discountMinor, 100n)
      assert.equal(row.currency, 'IRT')
      assert(row.expiresAt > new Date() && row.expiresAt <= new Date(Date.now() + 75 * 60 * 1000))
      await staff.context.close()
      return row
    }

    let onlineQuote = await ensureQuotation(onlineTitle)
    operations.onlineQuoteId = onlineQuote.id
    operations.onlineQuoteToken = onlineQuote.token
    record()
    let counterQuote = await ensureQuotation(counterTitle)
    operations.counterQuoteId = counterQuote.id
    operations.counterQuoteToken = counterQuote.token
    record()

    const staffScreens = await open(1440, 'light', 'staff')
    await staffScreens.visit('/admin/store/quotations')
    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'dark']]) {
      if (staffScreens.page.viewportSize().width !== width || theme !== 'light') {
        // Each view gets its own context so theme and first response match the requested viewport.
        const view = await open(width, theme, 'staff')
        await view.visit('/admin/store/quotations')
        await view.capture('quotation-admin', view.page.locator('main'))
        await view.context.close()
      } else await staffScreens.capture('quotation-admin', staffScreens.page.locator('main'))
    }
    await staffScreens.context.close()

    const buyerQuote = await open(390, 'dark', 'buyer')
    await buyerQuote.visit(`/quote/${onlineQuote.token}`)
    if (!onlineQuote.orderId) await expect(buyerQuote.page.getByLabel('قیمت فعلی، تخفیف و شرایط پیش‌فاکتور را بررسی و تأیید کردم', { exact: true })).toBeVisible()
    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'dark']]) {
      const view = width === 390 && theme === 'dark' ? buyerQuote : await open(width, theme, 'buyer')
      if (view !== buyerQuote) await view.visit(`/quote/${onlineQuote.token}`)
      await view.capture('quotation-customer', view.page.locator('main'))
      if (view !== buyerQuote) await view.context.close()
    }

    if (!onlineQuote.orderId) {
      await buyerQuote.page.getByLabel('قیمت فعلی، تخفیف و شرایط پیش‌فاکتور را بررسی و تأیید کردم', { exact: true }).check()
      await buyerQuote.page.getByLabel('تحویل حضوری از فروشگاه، بدون هزینهٔ ارسال', { exact: true }).check()
      const paid = buyerQuote.page.waitForResponse(response => response.url().endsWith(`/api/store/quotations/${onlineQuote.token}/checkout`) && response.request().method() === 'POST')
      await buyerQuote.page.getByRole('button', { name: 'ثبت سفارش و پرداخت از کیف پول', exact: true }).click()
      const response = await paid
      const data = await response.json()
      assert.equal(response.status(), 200, JSON.stringify(data))
      assert.equal(data.paid, true)
      operations.onlineOrderId = data.orderId
      record()
      onlineQuote = await db.storeQuotation.findUniqueOrThrow({ where: { id: onlineQuote.id } })
      assert.equal(onlineQuote.orderId, data.orderId)
    } else operations.onlineOrderId = onlineQuote.orderId

    const foreign = await open(1440, 'dark', 'staff')
    await foreign.visit(`/quote/${onlineQuote.token}`)
    await expect(foreign.page.locator('h1')).toContainText(onlineTitle)
    assert.equal(await foreign.page.locator('.sh-checkout').count(), 0, 'a non-owner must not receive the checkout')
    const refused = await foreign.post(`/api/store/quotations/${onlineQuote.token}/checkout`, { confirmed: true, fingerprint: 'a'.repeat(64), shippingMode: 'PICKUP', payWith: 'wallet' })
    assert.equal(refused.response.status(), 404, JSON.stringify(refused.data))
    await foreign.context.close()
    await buyerQuote.context.close()

    const registerRequestId = taskKey(`completion-${fixture.staffId}-register`)
    let register = await db.storeRegisterSession.findUnique({ where: { requestId: registerRequestId } })
    if (!register) {
      const staff = await open(1440, 'light', 'staff')
      const opened = await staff.post('/api/admin/store/counter', { op: 'register.open', requestId: registerRequestId, register: 'صندوق آزمون تکمیل فروش', currency: 'IRT', openingCashMinor: '0', locationId: fixture.locationId })
      assert(opened.response.ok(), JSON.stringify(opened.data))
      register = await db.storeRegisterSession.findUniqueOrThrow({ where: { requestId: registerRequestId } })
      await staff.context.close()
    }
    operations.registerId = Number(register.id)
    record()

    if (!counterQuote.orderId) {
      const counter = await open(1440, 'light', 'staff')
      await counter.visit(`/admin/store/counter?quotation=${counterQuote.id}`)
      await expect(counter.page.getByRole('region', { name: 'فروش از پیش‌فاکتور', exact: true })).toBeVisible()
      await counter.page.getByLabel('نوبت صندوق', { exact: true }).selectOption(String(register.id))
      await counter.page.getByLabel('مدل، رنگ و گونه، تعداد، سریال یا IMEI موجود و لوازم همراه همهٔ کالاها را کنترل کرده‌ام', { exact: true }).check()
      await counter.page.getByLabel('کل مبلغ را دریافت کرده‌ام و کالاها اکنون به مشتری تحویل می‌شوند', { exact: true }).check()
      await counter.capture('quotation-counter-conversion', counter.page.locator('main'))
      const sale = counter.page.waitForResponse(response => response.url().endsWith('/api/admin/store/counter') && response.request().method() === 'POST' && response.request().postDataJSON()?.op !== 'quote')
      await counter.page.getByRole('button', { name: 'ثبت فروش و صدور فاکتور', exact: true }).click()
      const response = await sale, data = await response.json()
      assert.equal(response.status(), 200, JSON.stringify(data))
      counterQuote = await db.storeQuotation.findUniqueOrThrow({ where: { id: counterQuote.id } })
      assert.equal(counterQuote.orderId, data.orderId)
      operations.counterOrderId = data.orderId
      record()
      await counter.context.close()
    } else operations.counterOrderId = counterQuote.orderId

    const staff = await open(1440, 'light', 'staff')
    const saleWithSerial = async (serial, operationKey) => {
      if (operations[operationKey]) return operations[operationKey]
      const requestId = taskKey(`completion-${fixture.staffId}-${serial.toLowerCase()}`)
      operations[`${operationKey}RequestId`] = requestId
      record()
      const priorOrder = await db.order.findUnique({ where: { idempotencyKey: `counter:${fixture.staffId}:${requestId}` } })
      if (priorOrder) {
        operations[operationKey] = priorOrder.id
        record()
        return priorOrder.id
      }
      const result = await staff.post('/api/admin/store/counter', {
        requestId, confirmed: true, packingConfirmed: true, sessionId: Number(register.id), method: 'CASH', reference: '',
        customerId: fixture.buyerId, customerName: 'مشتری مصنوعی آزمون', customerPhone: '09121112233',
        expectedTotalMinor: '1000', lines: [{ productId: fixture.productId, variantId: null, quantity: 1, expectedUnitMinor: '1000', inputs: {}, deviceIdentifiers: [{ serial, imei: '' }] }],
      })
      assert(result.response.ok(), JSON.stringify(result.data))
      const orderId = Number(result.data.orderId)
      assert(orderId > 0)
      operations[operationKey] = orderId
      record()
      return orderId
    }
    const warrantyOrderId = await saleWithSerial('OPENING-WARRANTY', 'warrantyOrderId')
    const custodyOrderId = await saleWithSerial('OPENING-CUSTODY', 'custodyOrderId')

    const adminOrder = await open(1440, 'light', 'staff')
    await adminOrder.visit(`/admin/store/orders/${warrantyOrderId}`)
    const warrantyPanel = adminOrder.page.locator('section').filter({ has: adminOrder.page.getByRole('heading', { name: 'ضمانت ثبت‌شدهٔ دستگاه', exact: true }) })
    await expect(warrantyPanel.getByText('Serial: OPENING-WARRANTY', { exact: true })).toBeVisible()
    if (!await db.storeWarrantyDevice.findFirst({ where: { serial: 'OPENING-WARRANTY' } })) {
      await warrantyPanel.getByRole('button', { name: 'ثبت ضمانت این دستگاه', exact: true }).click()
      const start = '2026-11-14', end = '2027-11-14'
      await warrantyPanel.getByLabel('شروع ضمانت', { exact: true }).fill(start)
      await warrantyPanel.getByLabel('پایان ضمانت', { exact: true }).fill(end)
      await warrantyPanel.getByLabel('ارائه‌دهنده', { exact: true }).fill('ضمانت‌سازندهٔ آزمایشی')
      await warrantyPanel.getByLabel('شرایط اعلام‌شده', { exact: true }).fill('پوشش ساختگی یک‌ساله برای آزمون محلی')
      const saved = adminOrder.page.waitForResponse(response => response.url().endsWith(`/api/admin/store/orders/${warrantyOrderId}/warranties`) && response.request().method() === 'POST')
      await warrantyPanel.getByRole('button', { name: 'ذخیرهٔ اطلاعات', exact: true }).click()
      const response = await saved
      assert.equal(response.status(), 201)
    }
    const warranty = await db.storeWarrantyDevice.findFirstOrThrow({ where: { serial: 'OPENING-WARRANTY' } })
    assert.equal(warranty.provider, 'ضمانت‌سازندهٔ آزمایشی')
    operations.warrantyId = warranty.id
    record()
    await expect(warrantyPanel).toContainText('پوشش ساختگی یک‌ساله برای آزمون محلی')
    await adminOrder.context.close()

    const buyerOrder = await open(1440, 'light', 'buyer')
    await buyerOrder.visit(`/dashboard/orders/${warrantyOrderId}`)
    await expect(buyerOrder.page.locator('main')).toContainText('OPENING-WARRANTY')
    await expect(buyerOrder.page.locator('main')).toContainText('ضمانت‌سازندهٔ آزمایشی')
    await buyerOrder.context.close()

    if (!operations.returnId) {
      const existingReturn = await db.returnRequest.findFirst({ where: { orderId: custodyOrderId, kind: 'RETURN' }, orderBy: { createdAt: 'asc' } })
      if (existingReturn) operations.returnId = existingReturn.id
    }
    if (!operations.returnId) {
      const returnRequestId = taskKey(`completion-${fixture.staffId}-custody-return`)
      operations.returnRequestId = returnRequestId
      record()
      const returned = await staff.post('/api/admin/store/counter/returns', {
        requestId: returnRequestId, orderId: custodyOrderId, sessionId: Number(register.id), refund: 'CASH', reason: 'exchange',
        restock: true, expectedRefundMinor: '1000', confirmed: true, lines: [{ line: 0, quantity: 1 }],
      })
      assert(returned.response.ok(), JSON.stringify(returned.data))
      operations.returnId = Number(returned.data.result?.id || returned.data.id)
      assert(operations.returnId > 0)
      record()
    }

    const returnPage = await open(1440, 'light', 'staff')
    await returnPage.visit(`/admin/store/returns/${operations.returnId}`)
    const inspection = returnPage.page.getByRole('region', { name: 'بررسی سلامت کالای مرجوعی', exact: true })
    await expect(inspection).toBeVisible()
    const returnRow = await db.returnRequest.findUniqueOrThrow({ where: { id: operations.returnId } })
    if (returnRow.inspectionStatus !== 'DISPOSED') {
      await inspection.getByLabel('تعداد سالم', { exact: true }).fill('0')
      await inspection.getByLabel('تعداد معیوب', { exact: true }).fill('1')
      await inspection.getByLabel('تعداد ناقص', { exact: true }).fill('0')
      await inspection.getByLabel('شرح سلامت، نقص یا لوازم همراه', { exact: true }).fill('آسیب ساختگی برای آزمون قرنطینه')
      const inspected = returnPage.page.waitForResponse(response => response.url().endsWith('/inspection') && response.request().method() === 'POST')
      await inspection.getByRole('button', { name: 'ثبت نتیجهٔ بررسی و آزادسازی تعداد سالم', exact: true }).click()
      const response = await inspected
      assert.equal(response.status(), 200)
    }
    const custody = returnPage.page.getByRole('region', { name: 'تعیین تکلیف کالای آسیب‌دیده یا ناقص', exact: true })
    await expect(custody).toBeVisible()
    const scrap = await db.returnCustodyResolution.findFirst({ where: { returnRequestId: operations.returnId, resolution: 'SCRAP' } })
    if (!scrap) {
      const decision = custody.getByLabel('تصمیم مدیر برای این تعداد', { exact: true })
      await decision.selectOption('SCRAP')
      await custody.getByLabel('خروج فیزیکی تمام ۱ واحد از قرنطینه را تأیید می‌کنم', { exact: true }).check()
      await custody.getByLabel('یادداشت تصمیم مدیر', { exact: true }).fill('اسقاط ساختگی برای آزمون محلی')
      const resolved = returnPage.page.waitForResponse(response => response.url().endsWith('/custody') && response.request().method() === 'POST')
      await custody.getByRole('button', { name: 'ثبت تصمیم و حرکت موجودی', exact: true }).click()
      const response = await resolved
      assert.equal(response.status(), 200)
    }
    const finalCustody = await db.returnCustodyResolution.findFirstOrThrow({ where: { returnRequestId: operations.returnId, resolution: 'SCRAP' } })
    assert.equal(finalCustody.status, 'SCRAP')
    operations.custodyResolutionId = finalCustody.id
    record()
    await returnPage.context.close()
    return warrantyOrderId
    }
    const warrantyOrderId = phase === 'all' ? await commerceJourneys() : operations.warrantyOrderId
    if (phase !== 'all') assert(operations.onlineOrderId && operations.counterOrderId && warrantyOrderId && operations.custodyResolutionId, 'Run commerce journeys before phased continuation')
    const reportNote = `opening-completion-report-${fixture.buyerId}`

    if (phase === 'all' || phase === 'public') {
    const postBefore = await db.post.findUniqueOrThrow({ where: { id: fixture.postId } })
    const publicPage = await open(390, 'dark', 'buyer')
    await publicPage.visit(fixture.postPath)
    const lowDataToggle = publicPage.page.getByRole('button', { name: 'حالت کم‌مصرف', exact: false })
    await expect(lowDataToggle).toBeVisible()
    if ((await lowDataToggle.getAttribute('aria-pressed')) !== 'true') await lowDataToggle.click()
    await expect(publicPage.page.locator('html')).toHaveAttribute('data-low-data', 'on')
    await publicPage.page.reload({ waitUntil: 'domcontentloaded' })
    await expect(publicPage.page.locator('html')).toHaveAttribute('data-low-data', 'on')
    const loadVideo = publicPage.page.getByRole('button', { name: /بارگذاری (ویدیو|محتوای بیرونی)/ })
    await expect(loadVideo).toBeVisible()
    assert.equal(await publicPage.page.locator('iframe').count(), 0, 'low-data public post must not create an iframe before explicit request')
    assert.equal((await db.post.findUniqueOrThrow({ where: { id: fixture.postId } })).updatedAt.getTime(), postBefore.updatedAt.getTime(), 'a page view must not edit the article revision')
    operations.lowDataPreference = true
    record()
    const embedRequested = publicPage.page.waitForRequest(request => !request.url().startsWith(fixture.baseURL) && request.resourceType() === 'document').catch(() => null)
    await loadVideo.click()
    await expect(publicPage.page.locator('iframe')).toHaveCount(1)
    const externalEmbed = await embedRequested
    assert(externalEmbed, 'the user action should request the video embed, which the non-loopback route blocks')
    assert.notEqual(new URL(externalEmbed.url()).origin, fixture.baseURL)
    assert(blockedExternal.has(new URL(externalEmbed.url()).origin), 'the video request must be blocked by the non-loopback route')

    const report = publicPage.page.getByRole('button', { name: 'گزارش مشکل این صفحه', exact: true })
    await expect(report).toBeVisible()
    await report.click()
    const dialog = publicPage.page.getByRole('dialog', { name: 'گزارش مشکل', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('پخش ویدیو مشکل دارد', { exact: true }).check()
    await dialog.getByLabel('توضیح (اختیاری)', { exact: true }).fill(reportNote)
    const existingTicket = await db.ticket.findMany({ where: { userId: fixture.buyerId }, include: { messages: true } })
    const priorReport = existingTicket.find(ticket => ticket.messages.some(message => Object.values(message).some(value => typeof value === 'string' && value.includes(reportNote))))
    if (!priorReport) {
      const submitted = publicPage.page.waitForResponse(response => response.url().endsWith('/api/support/report-problem') && response.request().method() === 'POST')
      await dialog.getByRole('button', { name: 'ارسال به پشتیبانی', exact: true }).click()
      const response = await submitted, data = await response.json()
      assert.equal(response.status(), 201, JSON.stringify(data))
      operations.reportTicketId = data.ticketId
      record()
    } else operations.reportTicketId = priorReport.id
    const followup = publicPage.page.getByRole('link', { name: 'پیگیری در پشتیبانی', exact: true })
    if (!priorReport) {
      await expect(dialog).toContainText('درخواست شما در گفت‌وگوی پشتیبانی ثبت شد.')
      await publicPage.capture('report-confirmation', dialog)
      await expect(followup).toBeVisible()
      await followup.click()
    } else await publicPage.visit('/dashboard/tickets')
    await expect(publicPage.page).toHaveURL(url => url.pathname === '/dashboard/tickets')
    await expect(publicPage.page.locator('main')).toBeVisible()
    await publicPage.context.close()

    if (!operations.guestDraftVerified) {
    const guest = await open(390, 'dark', 'guest')
    await guest.visit(fixture.postPath)
    await guest.page.getByRole('button', { name: 'گزارش مشکل این صفحه', exact: true }).click()
    const guestDialog = guest.page.getByRole('dialog', { name: 'گزارش مشکل', exact: true })
    await guestDialog.getByLabel('مشکل در محتوا یا صفحه', { exact: true }).check()
    const draft = `opening-completion-guest-draft-${fixture.buyerId}`
    await guestDialog.getByLabel('توضیح (اختیاری)', { exact: true }).fill(draft)
    const guestSubmit = guest.page.waitForResponse(response => response.url().endsWith('/api/support/report-problem') && response.request().method() === 'POST')
    await guestDialog.getByRole('button', { name: 'ارسال به پشتیبانی', exact: true }).click()
    assert.equal((await guestSubmit).status(), 401)
    await guestDialog.getByRole('button', { name: 'ورود به حساب', exact: true }).click()
    await expect(guest.page).toHaveURL(url => url.pathname === '/login')
    await guest.context.addCookies(fixture.buyerCookies)
    await guest.visit(`${fixture.postPath}?reportProblem=1`)
    await expect(guest.page.getByRole('dialog', { name: 'گزارش مشکل', exact: true })).toBeVisible()
    await expect(guest.page.getByRole('dialog', { name: 'گزارش مشکل', exact: true }).getByLabel('توضیح (اختیاری)', { exact: true })).toHaveValue(draft)
    await expect(guest.page.getByRole('dialog', { name: 'گزارش مشکل', exact: true }).getByLabel('مشکل در محتوا یا صفحه', { exact: true })).toBeChecked()
    operations.guestDraftVerified = true
    record()
    await guest.context.close()
    }

    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'dark']]) {
      if (views.some(view => view.name === 'support-staff-ticket' && view.width === width && view.theme === theme)) continue
      const supportStaff = await open(width, theme, 'staff')
      await supportStaff.visit(`/admin/tickets?ticket=${operations.reportTicketId}`)
      await expect(supportStaff.page.locator('main')).toContainText(reportNote)
      await supportStaff.capture('support-staff-ticket', supportStaff.page.locator('main'))
      await supportStaff.context.close()
    }

    }
    if (phase === 'all' || phase === 'commerce') {
    const warrantyViews = [
      { role: 'staff', url: `/admin/store/orders/${warrantyOrderId}`, name: 'warranty-admin' },
      { role: 'buyer', url: `/dashboard/orders/${warrantyOrderId}`, name: 'warranty-customer' },
    ]
    for (const spec of warrantyViews) for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'dark']]) {
      const view = await open(width, theme, spec.role)
      await view.visit(spec.url)
      await view.capture(spec.name, view.page.locator('main'))
      await view.context.close()
    }

    }
    if (phase === 'all' || phase === 'public') {
    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'dark']]) {
      if (['public-low-data', 'support-report-form'].every(name => views.some(view => view.name === name && view.width === width && view.theme === theme))) continue
      const lowData = await open(width, theme, 'buyer', true)
      await lowData.visit(fixture.postPath)
      await expect(lowData.page.locator('html')).toHaveAttribute('data-low-data', 'on')
      assert.equal(await lowData.page.locator('iframe').count(), 0)
      await lowData.capture('public-low-data', lowData.page.locator('main'))
      const supportForm = lowData.page.getByRole('button', { name: 'گزارش مشکل این صفحه', exact: true })
      await supportForm.click()
      await expect(lowData.page.getByRole('dialog', { name: 'گزارش مشکل', exact: true })).toBeVisible()
      await lowData.capture('support-report-form', lowData.page.getByRole('dialog', { name: 'گزارش مشکل', exact: true }))
      await lowData.context.close()
    }

    }
    if (phase === 'all' || phase === 'commerce') {
    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'dark']]) {
      const view = await open(width, theme, 'staff')
      await view.visit(`/admin/store/returns/${operations.returnId}`)
      const custodyRegion = view.page.getByRole('region', { name: 'تعیین تکلیف کالای آسیب‌دیده یا ناقص', exact: true })
      await expect(custodyRegion).toBeVisible()
      await expect(custodyRegion).toContainText('اسقاط')
      await view.capture('return-custody', custodyRegion)
      await view.context.close()
    }

    }
    if (phase === 'all' || phase === 'quality') {
    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'dark']]) {
      if (views.some(view => view.name === 'alias-advisory' && view.width === width && view.theme === theme)) continue
      const view = await open(width, theme, 'staff')
      await view.visit(`/admin/store/products/${fixture.productId}`)
      const aliases = view.page.locator('details').filter({ has: view.page.getByText('بررسی مورد تکراری', { exact: true }) })
      await aliases.locator('summary').click()
      await expect(aliases.getByRole('button', { name: 'پیش‌نمایش', exact: true })).toBeVisible()
      await aliases.getByRole('button', { name: 'پیش‌نمایش', exact: true }).click()
      const preview = aliases.getByRole('region', { name: 'پیش‌نمایش هم‌نشانی', exact: true })
      await expect(preview).toBeVisible()
      await expect(preview).toContainText('موجودی قابل فروش')
      await expect(preview.getByRole('button', { name: 'تأیید و ثبت هم‌نشانی', exact: true })).toBeDisabled()
      await view.capture('alias-advisory', aliases)
      await view.context.close()
    }

    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'dark']]) {
      if (views.some(view => view.name === 'game-publication-review' && view.width === width && view.theme === theme)) continue
      const view = await open(width, theme, 'staff')
      await view.visit(`/admin/games/${fixture.gameId}`)
      await view.page.getByRole('button', { name: 'بازبینی و انتشار', exact: true }).click()
      const review = view.page.getByRole('dialog', { name: 'بازی ساختگی کنترل انتشار', exact: true })
      await expect(review).toBeVisible()
      await expect(review.getByRole('button', { name: 'تأیید و انتشار', exact: true })).toBeDisabled()
      await expect(review.getByRole('alert')).toContainText('پیش از انتشار')
      await view.capture('game-publication-review', review)
      await review.locator('a[href="#media"]').first().click()
      await expect(review).not.toBeVisible()
      await expect(view.page.locator('#media')).toBeVisible()
      await expect(view.page.getByText('بررسی مورد تکراری', { exact: true })).toBeVisible()
      await view.context.close()
    }
    assert.equal((await db.gameTitle.findUniqueOrThrow({ where: { id: fixture.gameId } })).status, 'DRAFT')
    }

    const onlineOrder = await db.order.findUniqueOrThrow({ where: { id: operations.onlineOrderId }, include: { invoice: true, payments: true } })
    assert.equal(onlineOrder.userId, fixture.buyerId)
    assert.equal(onlineOrder.totalMinor, 900n)
    assert.equal(onlineOrder.invoice.discountMinor, 100n)
    assert.equal(onlineOrder.payments.length, 1)
    const wallet = await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: fixture.buyerId, currency: 'IRT' } } })
    assert.equal(wallet.balanceMinor, 999100n)
    const reportTicket = await db.ticket.findUniqueOrThrow({ where: { id: operations.reportTicketId }, include: { messages: true } })
    assert.equal(reportTicket.userId, fixture.buyerId)
    assert(reportTicket.messages.some(message => Object.values(message).some(value => typeof value === 'string' && value.includes(reportNote))))
    assert.equal((await db.storeQuotation.findUniqueOrThrow({ where: { id: operations.onlineQuoteId } })).orderId, operations.onlineOrderId)
    assert.equal((await db.storeQuotation.findUniqueOrThrow({ where: { id: operations.counterQuoteId } })).orderId, operations.counterOrderId)
    assert.equal((await db.storeWarrantyDevice.findFirstOrThrow({ where: { serial: 'OPENING-WARRANTY' } })).provider, 'ضمانت‌سازندهٔ آزمایشی')
    assert.equal((await db.returnCustodyResolution.findFirstOrThrow({ where: { id: operations.custodyResolutionId } })).status, 'SCRAP')
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: fixture.productId } })).stock, 16)
    assert.equal((await db.locationStock.findUniqueOrThrow({ where: { locationId_itemKey: { locationId: fixture.locationId, itemKey: `${fixture.productId}:0` } } })).quantity, 16)
    assert.equal((await db.locationStock.aggregate({ where: { productId: fixture.productId, location: { isQuarantine: true } }, _sum: { quantity: true } }))._sum.quantity, 0)
    assert.deepEqual(pageErrors, [])
    operations.persistedStateVerified = true
    operations.completedPhases = [...new Set([...(operations.completedPhases || []), phase])]
    const complete = ['public', 'commerce', 'quality'].every(part => operations.completedPhases.includes(part)) || phase === 'all'
    record()
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ complete, phase, operations, views, pageErrors, blockedExternal: [...blockedExternal] }, null, 2))
    console.log(`Platform opening-completion ${phase} phase passed; accumulated ${views.length} scoped screenshots at 1440 light/dark and 390 dark; synthetic state remains in the isolated database`)
    console.log(`Blocked ${blockedExternal.size} non-loopback origins; no external route was continued`)
  } catch (error) {
    for (const context of contexts) for (const page of context.pages()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true, caret: 'initial' }).catch(() => {})
    record()
    throw error
  } finally {
    await browser.close()
  }
}

main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1 })
