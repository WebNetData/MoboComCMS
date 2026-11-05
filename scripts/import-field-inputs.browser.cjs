// Explicit owned localhost fixture; no real accounts, remote downloads or hosted Actions.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { chromium } = require('playwright')
const fixturePath = process.env.E2E_IMPORT_INPUTS_FIXTURE
assert(fixturePath, 'E2E_IMPORT_INPUTS_FIXTURE is required')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')), baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
assert(['localhost','127.0.0.1'].includes(new URL(baseURL).hostname)); assert(fixture.stamp.startsWith('owned-input-browser-'))
const output = path.dirname(fixturePath), jobs = [...(fixture.jobId ? [fixture.jobId] : []), ...(fixture.jobs || [])], views = [], errors = []
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  let context, page
  const save = () => fs.writeFileSync(fixturePath, JSON.stringify({ ...fixture, jobs: [...new Set(jobs)] }))
  async function status(id, expected) { for (let i = 0; i < 60; i++) { const r = await page.request.get('/api/admin/imports?view=job&id=' + id); assert(r.ok()); const job = await r.json(); if (job.status === expected) return job; if (['FAILED','DONE_WITH_ERRORS'].includes(job.status)) throw Error(JSON.stringify(job)); await wait(1000) }; throw Error('job did not reach ' + expected) }
  try {
    for (const theme of ['dark','light']) {
      if (context) await context.close()
      context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' })
      await context.addCookies([{ name: 'next-auth.session-token', value: fixture.token, url: baseURL }, { name: 'theme', value: theme, url: baseURL }])
      page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => void dialog.accept())
      await page.goto('/admin/imports'); await page.locator('.imp-dest').filter({ has: page.getByText('مجله — مطالب', { exact: true }) }).click(); await page.getByRole('button', { name: 'بعدی', exact: true }).click()
      await page.locator('input[type=file]').setInputFiles({ name: 'owned-inputs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ externalId: fixture.stamp + '-' + theme, title: fixture.stamp + ' Clean Article ' + theme + ' Origin News', content: '<p>متن آزمایشی با دستهٔ انتخاب‌شده.</p>', categories: fixture.stamp + ' foreign category', slug: 'https://origin-news.example/unwanted-feed-url' }])) })
      const uploaded = page.waitForResponse(response => response.url().includes('/api/admin/imports/upload') && response.request().method() === 'POST'); await page.getByRole('button', { name: 'بارگذاری و تحلیل فایل', exact: true }).click(); const response = await uploaded; assert(response.ok()); const id = (await response.json()).job.id; jobs.push(id); save()
      const category = page.locator('.imp-binding').filter({ has: page.locator('summary b').getByText('دسته‌های مجله', { exact: true }) }); await category.locator('summary').first().click(); await category.getByLabel('روش تعیین دسته‌های مجله').selectOption('fixed'); await category.getByLabel('جستجو در دسته‌های مجله').fill('آموزش انتخابی'); const checkbox = category.getByLabel(new RegExp('#' + fixture.categoryId + '[)]')); await checkbox.check()
      await page.getByLabel('نام‌ها و عبارت‌های منبع برای حذف از نامک', { exact: false }).fill('Origin News')
      for (const width of [1440,390]) {
        await page.setViewportSize({ width, height: 1050 }); await page.evaluate(source => { const script = document.createElement('script'); script.nonce = document.querySelector('script[nonce]')?.nonce || ''; script.textContent = source; document.head.append(script) }, fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'))
        const violations = await page.locator('.imp-input-panel').evaluate(async node => (await window.axe.run(node, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => node.target) })))
        assert.deepEqual(violations, []); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); assert.equal(overflow, false)
        await page.locator('.imp-input-panel').screenshot({ path: path.join(output, 'inputs-' + theme + '-' + width + '.png'), caret: 'initial' }); views.push({ theme, width, axe: 0, overflow })
      }
      if (theme === 'light') {
        await page.setViewportSize({ width: 1440, height: 1050 })
        await page.route('**/api/admin/imports?view=field-choices**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'خطای آزمایشی دریافت گزینه‌ها' }) }), { times: 1 })
        await category.getByLabel('جستجو در دسته‌های مجله').fill('آموزش'); await category.getByRole('alert').waitFor(); await category.getByRole('button', { name: 'تلاش دوباره' }).click(); await checkbox.waitFor(); assert.equal(await checkbox.isChecked(), true); await checkbox.focus(); await checkbox.press('Space'); await checkbox.press('Space'); assert.equal(await checkbox.isChecked(), true)
        const next = () => page.getByRole('button', { name: 'بعدی', exact: true }).click()
        await next(); await next(); await page.getByRole('button', { name: 'نمایش پیش‌نمایش', exact: true }).click(); await page.locator('.imp-preview').first().waitFor(); assert((await page.locator('.imp-preview').innerText()).includes('clean-article'))
        await next(); const dry = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/admin/imports') && response.request().postDataJSON()?.op === 'dry-run'); await page.getByRole('button', { name: 'اجرای آزمایشی (بدون ذخیره)', exact: true }).click(); const body = await (await dry).json(); assert.equal(body.summary.invalid, 0, JSON.stringify(body.summary.problems))
        await next(); await next(); await next(); await page.getByRole('button', { name: 'شروع ورود اطلاعات', exact: true }).click(); const completed = await status(id, 'DONE'); assert.equal(completed.settings.options.missingCategories, 'error'); const records = await page.request.get('/api/admin/imports?view=records&id=' + id).then(response => response.json()); assert.equal(records.records[0].action, 'CREATE', JSON.stringify(records)); fixture.createdId = records.records[0].entityId; save()
        await page.getByRole('button', { name: 'بازگردانی (Rollback)', exact: true }).click(); await status(id, 'ROLLED_BACK')
      }
    }
    assert.deepEqual(errors, []); fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify({ views, errors, retry: true, keyboard: true, previewDryRunCreateRollback: true }, null, 2)); console.log('Browser passed: four themed 1440/390 states, scoped axe0, no overflow/errors, fetch retry, keyboard, actual preview/dry-run/create/report/rollback.')
  } finally {
    save()
    if (page) for (const id of [...new Set(jobs)].reverse()) { const response = await page.request.get('/api/admin/imports?view=job&id=' + id).catch(() => null); if (!response?.ok()) continue; const job = await response.json(); if (['DRAFT','ROLLED_BACK','CANCELLED'].includes(job.status)) await page.request.post('/api/admin/imports', { headers: { Origin: baseURL }, data: { op: 'delete', id } }) }
    await browser.close()
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
