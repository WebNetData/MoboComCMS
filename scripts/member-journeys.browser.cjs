// Local acceptance with an explicitly supplied disposable customer/product fixture.
// Registration's response is a declared double; credentials, cart merge and quotes use
// the actual application/PostgreSQL. No OTP/provider send, order or payment is made.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { chromium, expect } = require('@playwright/test')
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
if (baseURL !== 'http://localhost:3000' || !process.env.E2E_JOURNEY_FIXTURE) throw Error('Explicit localhost disposable fixture required')
const fixture = JSON.parse(fs.readFileSync(process.env.E2E_JOURNEY_FIXTURE, 'utf8'))
assert.match(fixture.prefix, /^member-journey-\d+$/)
assert.equal(fixture.email, fixture.prefix + '@example.invalid')
const output = path.resolve(process.env.E2E_OUTPUT_DIR || '.mobocom/member-journeys/browser')
const next = '/checkout/cart'
const bounded = (promise, label) => {
  let timer
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), 15000) })]).finally(() => clearTimeout(timer))
}

async function capture(page, label) {
  await page.evaluate(() => document.fonts.ready)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ' overflow')
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector('main'), {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })))
  assert.deepEqual(violations, [], label)
  await page.screenshot({ path: path.join(output, label + '.png'), fullPage: true })
}

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true }), errors = [], results = []
  try {
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      const label = `${theme}-${width}`
      const context = await browser.newContext({ baseURL, locale: 'fa-IR', viewport: { width, height: 1000 }, reducedMotion: 'reduce', extraHTTPHeaders: { Origin: baseURL } })
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL }])
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      page.on('pageerror', e => errors.push(e.message))
      let writes = 0
      page.on('request', r => { if (/\/api\/(cart\/checkout|checkout|payment)/.test(new URL(r.url()).pathname) && r.method() !== 'GET') writes++ })
      const added = await context.request.post('/api/cart', { data: { productId: fixture.productIds[1], quantity: 1 } })
      assert.equal(added.status(), 200)
      const cartCookie = (await context.cookies()).find(c => c.name === 'mc_cart')
      assert.ok(cartCookie)
      if (!fixture.guestTokens.includes(cartCookie.value)) { fixture.guestTokens.push(cartCookie.value); fs.writeFileSync(process.env.E2E_JOURNEY_FIXTURE, JSON.stringify(fixture), { mode: 0o600 }) }

      await page.goto('/welcome?next=' + encodeURIComponent(next), { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/login\?next=/)
      assert.equal(new URL(page.url()).searchParams.get('next'), next, 'expired completion visit retains original destination')

      await page.goto(next, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/login\?next=/)
      const register = page.locator('.auth-alternative a[href^="/register"]').first()
      await expect(register).toBeVisible()
      assert.equal(new URL(await register.getAttribute('href'), baseURL).searchParams.get('next'), next, 'guest checkout → registration retains destination')
      await register.click()
      await expect(page).toHaveURL(/\/register\?next=/)
      await expect(page.locator('#register-email, .auth-alternative a[href*="method=password"]').first()).toBeVisible()
      const passwordEntry = page.getByRole('link', { name: 'ثبت‌نام با ایمیل و رمز عبور' })
      if (await passwordEntry.count()) { assert.equal(new URL(await passwordEntry.getAttribute('href'), baseURL).searchParams.get('next'), next); await passwordEntry.click() }
      await expect(page.locator('#register-email')).toBeVisible()
      assert.equal(new URL(await page.locator('.auth-form .auth-alternative a').getAttribute('href'), baseURL).searchParams.get('next'), next)
      await capture(page, label + '-register')
      // The server account is pre-created: never invoke registration automations/providers.
      await page.route('**/api/register', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: fixture.userId, email: fixture.email }) }))
      await page.locator('#register-name').fill('کاربر آزمون خرید')
      await page.locator('#register-email').fill(fixture.email)
      await page.locator('#register-password').fill(fixture.password)
      await page.locator('.auth-form button[type="submit"], .auth-form button.btn-primary').last().click()
      await expect(page).toHaveURL(/\/login\?registered=1&next=/)
      assert.equal(new URL(page.url()).searchParams.get('next'), next)
      await page.unroute('**/api/register')
      await expect(page.locator('#login-email')).toBeVisible()
      await page.locator('#login-email').fill(fixture.email)
      if (!results.length) {
        await page.locator('#login-password').fill('invalid-disposable-password')
        await page.locator('.auth-form button[type="submit"]').click()
        await expect(page.locator('.auth-form [role="alert"]')).toBeVisible()
        assert.equal(new URL(page.url()).searchParams.get('next'), next)
        await capture(page, label + '-login-error')
      }
      await page.locator('#login-password').fill(fixture.password)
      await page.locator('.auth-form button[type="submit"]').click()
      await expect(page).toHaveURL(baseURL + next, { timeout: 45000 })
      await expect(page.getByRole('radio', { name: /ارسال آزمایشی محلی/ })).toBeChecked({ timeout: 30000 })
      const session = await (await context.request.get('/api/auth/session')).json()
      assert.equal(session.user.id, String(fixture.userId))
      const cart = (await (await context.request.get('/api/cart')).json()).cart
      assert.equal(cart.count, 2, 'guest selection and existing customer cart are both retained')
      assert.deepEqual(cart.lines.map(l => l.productId).sort((a,b) => a-b), fixture.productIds.slice().sort((a,b) => a-b))
      await capture(page, label + '-checkout')

      // Controlled read failures end in the real quote endpoint, not a fake success.
      for (const fault of ['http', 'malformed', 'network']) {
        let real = false, release
        const gate = new Promise(resolve => { release = resolve })
        await page.route('**/api/shipping/quotes?*', async route => {
          if (real) return route.continue()
          await gate
          if (fault === 'network') return route.abort('failed').catch(() => {})
          await route.fulfill({ status: fault === 'http' ? 503 : 200, contentType: 'application/json', body: fault === 'malformed' ? '{"options":[null]}' : '{"error":"temporary"}' }).catch(() => {})
        })
        try {
          await page.goto(next, { waitUntil: 'domcontentloaded' })
          await expect(page.getByRole('status', { name: 'در حال محاسبهٔ هزینهٔ ارسال', exact: true })).toBeVisible()
          await expect(page.locator('button.sh-pay')).toBeDisabled()
          if (fault === 'http') await capture(page, label + '-quotes-pending')
          release()
          const retry = page.getByRole('button', { name: 'دریافت دوبارهٔ هزینهٔ ارسال', exact: true })
          await expect(retry).toBeVisible()
          await expect(page.locator('button.sh-pay')).toBeDisabled()
          if (fault === 'http') await capture(page, label + '-quotes-error')
          real = true
          await retry.focus(); await page.keyboard.press('Enter')
          await expect(page.getByRole('radio', { name: /ارسال آزمایشی محلی/ })).toBeChecked()
          await expect(retry).toHaveCount(0)
          if (fault === 'http') await capture(page, label + '-quotes-recovered')
        } finally { release(); await page.unroute('**/api/shipping/quotes?*') }
      }

      // Address reads also offer a keyboard retry rather than a permanent empty state.
      console.log('quote recoveries passed ' + label)
      let addressReal = false
      await page.route('**/api/addresses', route => addressReal ? route.continue() : route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
      try {
        await page.goto(next, { waitUntil: 'domcontentloaded' })
        const retry = page.getByRole('button', { name: 'دریافت دوبارهٔ آدرس‌ها', exact: true })
        await expect(retry).toBeVisible()
        await expect(page.locator('button.sh-pay')).toBeDisabled()
        addressReal = true
        await retry.focus(); await page.keyboard.press('Enter')
        await expect(page.getByRole('radio', { name: /ارسال آزمایشی محلی/ })).toBeChecked()
      } finally { await page.unroute('**/api/addresses') }

      let releaseOld, releaseNew, oldArrived, newArrived
      const oldGate = new Promise(resolve => { releaseOld = resolve }), newGate = new Promise(resolve => { releaseNew = resolve })
      const oldSeen = new Promise(resolve => { oldArrived = resolve }), newSeen = new Promise(resolve => { newArrived = resolve })
      await page.route('**/api/shipping/quotes?*', async route => {
        const old = Number(new URL(route.request().url()).searchParams.get('addressId')) === fixture.addressIds[0]
        if (old) { oldArrived(); await oldGate } else { newArrived(); await newGate }
        await route.continue().catch(() => {})
      })
      try {
        await page.goto(next, { waitUntil: 'domcontentloaded' })
        await bounded(oldSeen, 'default-address quote')
        await page.getByRole('button', { name: 'تغییر یا ویرایش آدرس' }).click()
        await page.getByRole('radio', { name: /دفتر آزمون/ }).click()
        await bounded(newSeen, 'new-address quote')
        releaseOld()
        await expect(page.getByRole('status', { name: 'در حال محاسبهٔ هزینهٔ ارسال', exact: true })).toBeVisible()
        await expect(page.locator('button.sh-pay')).toBeDisabled()
        await expect(page.getByRole('radio', { name: /ارسال آزمایشی محلی/ })).toHaveCount(0)
        releaseNew()
        await expect(page.getByRole('radio', { name: /ارسال آزمایشی محلی/ })).toBeChecked()
        await expect(page.locator('.sh-selected-address')).toContainText('دفتر آزمون')
        await capture(page, label + '-changed-address')
      } finally { releaseOld(); releaseNew(); await page.unroute('**/api/shipping/quotes?*') }

      await page.goto('/register?next=' + encodeURIComponent(next), { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('link', { name: 'ادامه از جایی که بودید' })).toHaveAttribute('href', next)
      await context.close()
      assert.equal(writes, 0, 'no checkout/payment write')
      results.push({ theme, width, actualPasswordLogin: true, registrationResponse: 'declared double', cartCount: cart.count, quoteRecoveries: 3, addressRecovery: true, addressChangeFence: true, expiredCompletionContinuation: true, checkoutWrites: writes })
      console.log('passed ' + label)
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ results, runtimeErrors: errors }, null, 2))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
