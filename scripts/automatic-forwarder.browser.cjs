// Explicit owned localhost fixture; run fixture cleanup after this process, including on failure.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { chromium } = require('playwright')
const file = process.env.E2E_FORWARDER_FIXTURE
assert(file, 'E2E_FORWARDER_FIXTURE is required')
const fixture = JSON.parse(fs.readFileSync(file, 'utf8')), baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000', output = path.dirname(file)
assert(fixture.stamp.startsWith('owned-auto-browser-')); assert(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
async function main() {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
 const errors = [], views = []
 const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' })
 await context.addCookies([{ name: 'next-auth.session-token', value: fixture.token, url: baseURL }])
 const admin = await context.newPage(), page = await context.newPage()
 for (const tab of [admin, page]) { tab.setDefaultTimeout(30000); tab.on('pageerror', error => errors.push(error.message)) }
 const policy = () => page.request.get('/api/forwarder/policy').then(response => response.json())
 async function save(checked) {
  const control = admin.getByLabel('اعمال خودکار روی همهٔ لینک‌های خارجی', { exact: true })
  await control.setChecked(checked)
  const response = admin.waitForResponse(response => response.url().endsWith('/api/admin/forwarder') && response.request().method() === 'PUT')
  await admin.getByRole('button', { name: 'ذخیرهٔ تنظیمات', exact: true }).click()
  assert.equal((await response).status(), 200)
 }
 try {
  await admin.goto('/admin/forwarder'); await admin.getByLabel('اعمال خودکار روی همهٔ لینک‌های خارجی', { exact: true }).waitFor()
  const guest = await browser.newContext({ baseURL }); const denied = await guest.request.put('/api/admin/forwarder', { headers: { Origin: baseURL }, data: { settings: { autoExternalLinks: true } } }); assert.equal(denied.status(), 403); await guest.close()
  const foreign = await admin.request.put('/api/admin/forwarder', { headers: { Origin: 'https://foreign.invalid' }, data: { settings: { autoExternalLinks: true } } }); assert.equal(foreign.status(), 403)
  const invalid = await admin.request.put('/api/admin/forwarder', { headers: { Origin: baseURL }, data: { settings: { autoExternalLinks: 'yes' } } }); assert.equal(invalid.status(), 422)
  await page.goto('/p/' + fixture.slug)
  const outside = page.getByRole('link', { name: 'لینک خارجی قدیمی', exact: true })
  await outside.waitFor(); assert.equal(await outside.getAttribute('href'), fixture.target)
  await save(true); assert.equal((await policy()).enabled, true)
  await page.waitForFunction(() => [...document.querySelectorAll('a')].some(anchor => anchor.textContent === 'لینک خارجی قدیمی' && anchor.getAttribute('href')?.startsWith('/forwarder?')))
  const wrapped = await outside.getAttribute('href'); assert.equal(new URL(wrapped, baseURL).searchParams.get('url'), fixture.target)
  assert.equal(await outside.getAttribute('target'), '_blank'); assert.match(await outside.getAttribute('rel'), /noopener/)
  assert.equal(await page.getByRole('link', { name: 'لینک داخلی', exact: true }).getAttribute('href'), '/games')
  await admin.reload(); assert.equal(await admin.getByLabel('اعمال خودکار روی همهٔ لینک‌های خارجی', { exact: true }).isChecked(), true)
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
   await context.addCookies([{ name: 'theme', value: theme, url: baseURL }]); await admin.setViewportSize({ width, height: 1050 }); await admin.reload(); await admin.getByLabel('اعمال خودکار روی همهٔ لینک‌های خارجی', { exact: true }).waitFor()
   await admin.evaluate(source => { const script = document.createElement('script'); script.nonce = document.querySelector('script[nonce]')?.nonce || ''; script.textContent = source; document.head.append(script) }, fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'))
   const violations = await admin.locator('.sa-card.sa-form').last().evaluate(async node => (await window.axe.run(node, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => node.target) })))
   assert.deepEqual(violations, []); assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
   await admin.locator('.sa-card.sa-form').last().screenshot({ path: path.join(output, `admin-${theme}-${width}.png`), caret: 'initial' }); views.push({ theme, width, axe: 0 })
  }
  await page.evaluate(() => {
   const box = document.createElement('section'); box.id = 'owned-late-links'; box.innerHTML = '<a id="owned-dynamic" href="https://late.example/a?q=1#x" target="_blank">پویا</a><a id="owned-download" download="file.zip" href="https://files.example/file.zip">فایل</a><div contenteditable="true"><a id="owned-edit" href="https://edit.example/a">ویرایش</a></div>'; document.body.append(box)
  })
  await page.waitForFunction(() => document.getElementById('owned-dynamic')?.getAttribute('href')?.startsWith('/forwarder?'))
  assert.equal(await page.locator('#owned-edit').getAttribute('href'), 'https://edit.example/a')
  assert.equal(await page.locator('#owned-download').getAttribute('download'), null)
  await page.locator('#owned-dynamic').evaluate(anchor => anchor.setAttribute('href', 'https://changed.example/a%2Fb?q=a%26b#part'))
  await page.waitForFunction(() => document.getElementById('owned-dynamic')?.getAttribute('href')?.includes('changed.example'))
  const opened = context.waitForEvent('page'); await outside.focus(); await outside.press('Enter'); const countdown = await opened
  await countdown.waitForURL('**/forwarder?**'); await countdown.getByRole('heading', { name: 'در حال انتقال…', exact: true }).waitFor()
  assert.equal(await countdown.getByRole('link', { name: /رفتن|ادامه|انتقال/ }).last().getAttribute('href'), fixture.target)
  assert.equal(await countdown.locator('a[href^="/forwarder?"]').count(), 0)
  await countdown.close()
  await save(false); assert.equal((await policy()).enabled, false)
  await page.waitForFunction(target => [...document.querySelectorAll('a')].some(anchor => anchor.textContent === 'لینک خارجی قدیمی' && anchor.getAttribute('href') === target), fixture.target)
  assert.equal(await page.locator('#owned-dynamic').getAttribute('href'), 'https://changed.example/a%2Fb?q=a%26b#part')
  assert.equal(await page.locator('#owned-download').getAttribute('download'), 'file.zip')
  const bypass = await page.request.get(wrapped, { maxRedirects: 0 }); assert.equal(bypass.status(), 307); assert.equal(bypass.headers().location, fixture.target)
  assert.equal(await admin.locator('a[href^="/forwarder?auto=1"]').count(), 0)
  // The synchronous activation fallback covers anchors inserted before MutationObserver delivery.
  await save(true)
  await page.waitForFunction(() => [...document.querySelectorAll('a')].some(anchor => anchor.textContent === 'لینک خارجی قدیمی' && anchor.getAttribute('href')?.startsWith('/forwarder?')))
  const immediate = await page.evaluate(() => { const anchor = document.createElement('a'); anchor.href = 'https://immediate.example/x'; document.body.append(anchor); anchor.addEventListener('click', event => event.preventDefault()); anchor.click(); const href = anchor.getAttribute('href'); anchor.remove(); return href })
  assert(immediate.startsWith('/forwarder?'))
  await page.route('**/api/forwarder/policy', route => route.fulfill({ status: 503, body: '{}' }), { times: 1 })
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForFunction(target => [...document.querySelectorAll('a')].some(anchor => anchor.textContent === 'لینک خارجی قدیمی' && anchor.getAttribute('href') === target), fixture.target)
  await page.unroute('**/api/forwarder/policy')
  await save(false)
  assert.deepEqual(errors, []); fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify({ views, errors, realSaveReload: true, oldAndDynamicLinks: true, keyboardNewTab: true, offRestorationAndStaleBypass: true, failedRefreshDirect: true }, null, 2))
  console.log('Browser: actual Admin save/reload, four themed 1440/390 axe0 states, no overflow/errors, old/dynamic/changed links, keyboard/new tab, download/editable/internal/Admin/forwarder preservation, off restoration, stale307 and policy503 fallback passed.')
 } finally { await browser.close() }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
