// Local presentation acceptance. Optional E2E_MEMBER_STATE is a private Playwright
// customer storage-state file; E2E_FORM_PATH is a published, disposable test form.
// This script does not create accounts, submit forms, send codes or make payments.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { chromium, expect } = require('@playwright/test')
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
if (new URL(baseURL).hostname !== 'localhost') throw Error('Utility acceptance requires localhost')
const output = path.resolve(process.env.E2E_OUTPUT_DIR || '.mobocom/utility-polish/acceptance')
const memberState = process.env.E2E_MEMBER_STATE
const formPath = process.env.E2E_FORM_PATH
if (formPath && (!formPath.startsWith('/forms/') || new URL(formPath, baseURL).origin !== new URL(baseURL).origin)) throw Error('Expected a same-site public test form')
const guestRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/copyright', '/utility-acceptance-missing-20261102']
const memberRoutes = ['/dashboard', '/dashboard/profile', '/dashboard/public-profile', '/dashboard/orders', '/dashboard/invoices', '/dashboard/wallet', '/dashboard/addresses', '/dashboard/requests', '/dashboard/tickets', '/dashboard/notifications', '/dashboard/collections', '/dashboard/reviews', '/dashboard/library', '/dashboard/prompts', '/dashboard/games', '/dashboard/recent', '/dashboard/gift-cards', '/dashboard/notifications/preferences', '/dashboard/referrals', '/dashboard/ads', '/favorites', '/compare', '/welcome']

async function check(page, label) {
  await page.evaluate(() => document.fonts.ready)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${label}`)
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector('main'), {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })))
  assert.deepEqual(violations, [], label)
  await page.screenshot({ path: path.join(output, label + '.png'), fullPage: true })
}

async function recover(page, route, api, name, label) {
  // Hold all initial requests: development StrictMode may cancel/restart one.
  let real = false, release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**' + api, async request => {
    if (real) { await request.continue(); return }
    await gate
    await request.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'بارگذاری موقتاً انجام نشد' }) }).catch(() => {})
  })
  try {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    const pending = page.getByRole('status', { name, exact: true })
    await expect(pending).toBeVisible()
    await expect(pending).toHaveAttribute('aria-busy', 'true')
    await check(page, label + '-pending')
    release()
    const alert = page.locator('main').getByRole('alert')
    await expect(alert).toBeVisible()
    const retry = alert.getByRole('button', { name: 'تلاش دوباره', exact: true })
    await expect(retry).toBeVisible()
    await check(page, label + '-failed')
    real = true
    await retry.focus(); await page.keyboard.press('Enter')
    await expect(alert).toHaveCount(0)
    await expect(pending).toHaveCount(0)
    if (route.includes('?status=')) assert.equal(new URL(page.url()).searchParams.get('status'), 'UNPAID')
    await check(page, label + '-recovered')
  } finally { release(); await page.unroute('**' + api) }
}

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true }), rows = [], errors = []
  try {
    for (const member of memberState ? [false, true] : [false]) for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      const context = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, reducedMotion: 'reduce', ...(member ? { storageState: memberState } : {}) })
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL }])
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      const routes = member ? [...memberRoutes, ...(formPath ? [formPath] : [])] : guestRoutes
      for (const route of routes) {
        const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 60000 })
        const missing = route.startsWith('/utility-acceptance-missing')
        if (route === '/copyright') assert.ok([200, 404].includes(response.status()), 'copyright module on/off')
        else assert.equal(response.status(), missing ? 404 : 200)
        if (member && route.startsWith('/dashboard')) {
          await expect(page.locator('.user-shell')).toBeVisible()
          await expect.poll(() => new URL(page.url()).pathname).toBe(route)
        } else if (await page.locator('.mb-guest').count()) {
          await expect.poll(async () => !(await page.locator('.mb-guest').count()) || await page.locator('.mb-guest').getAttribute('data-loading') !== 'true', { timeout: 30000 }).toBe(true)
        }
        await expect(page.locator('main h1')).toHaveCount(1)
        await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0, { timeout: 20000 })
        if (route === '/favorites' || route === '/compare') {
          const links = page.locator('main .sr-chips a')
          for (const link of await links.all()) {
            const box = await link.boundingBox()
            assert.ok(box && box.height >= 44, 'utility shortcuts retain separate touch targets')
          }
        }
        const name = (route === formPath ? 'form' : route.slice(1).replaceAll('/', '-')) + '-' + theme + '-' + width
        await check(page, name)
        rows.push({ route: route === formPath ? '/forms/[fixture]' : route, member, theme, width, axe: 0 })
      }
      if (member) {
        for (const [route, api, name] of [
          ['/dashboard/requests', '/api/me/requests', 'در حال دریافت درخواست‌ها'],
          ['/dashboard/public-profile', '/api/profile/public', 'در حال دریافت پروفایل'],
          ['/dashboard/invoices?status=UNPAID', '/api/my/invoices', 'در حال دریافت فاکتورها'],
        ]) await recover(page, route, api, name, 'recovery-' + route.split('?')[0].slice(1).replaceAll('/', '-') + '-' + theme + '-' + width)
      }
      await context.close()
      console.log(`${member ? 'member' : 'guest'}/${theme}/${width}: ${routes.length} pages${member ? ', three delayed/503/real API keyboard recoveries' : ''} passed`)
    }
    assert.deepEqual(errors, [])
    const summary = { pageViews: rows.length, memberAssessed: Boolean(memberState), publicFormAssessed: Boolean(formPath), controlledRecoveries: memberState ? 12 : 0, mainAxeViolations: 0, runtimeErrors: 0 }
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ summary, rows }, null, 2))
    console.log(JSON.stringify(summary))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
