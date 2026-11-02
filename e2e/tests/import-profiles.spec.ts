import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

test.skip(!process.env.E2E_PROMPT_FIXTURE, 'requires the explicitly owned local fixture')
test('bulk import wizard validates and imports Prompt templates, central artists and businesses with safe reports', async ({ browser, baseURL }, info) => {
  test.setTimeout(300_000); expect(baseURL).toBe('http://localhost:3230')
  const fixture = JSON.parse(fs.readFileSync(process.env.E2E_PROMPT_FIXTURE!, 'utf8'))
  expect(fixture.db).toBe('mobocom_prompt_master_test_20261101')
  const stamp = 'owned-import-profiles-' + Date.now(), headers = { Origin: baseURL! }, jobs: number[] = [], originals = new Map<string, boolean>(), errors: string[] = []
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' })
  await context.addCookies([{ name: 'theme', value: 'light', url: baseURL! }])
  const page = await context.newPage(); page.setDefaultTimeout(25_000); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => void dialog.accept())
  async function signIn(target: Page, key: string) {
    await target.goto('/login'); await target.getByRole('button', { name: 'رمز عبور', exact: true }).click(); await target.locator('#login-email').fill(fixture.users[key].email); await target.locator('#login-password').fill(fixture.password); await target.locator('form.auth-form button.btn-primary').first().click(); await target.waitForURL(url => !url.pathname.startsWith('/login'))
    await expect.poll(async () => { const response = await target.request.get('/api/me', { maxRetries: 2 }); return response.ok() ? (await response.json()).id : 0 }).toBe(fixture.users[key].id)
  }
  async function capture(name: string, selector: string) {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.evaluate(source => { const script = document.createElement('script'); script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || ''; script.textContent = source; document.head.append(script) }, fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'))
    const violations = await page.locator(selector).evaluate(async node => (await (window as any).axe.run(node, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations)
    expect(violations).toEqual([]); await page.locator(selector).screenshot({ path: info.outputPath(name + '.png') })
  }
  const next = () => page.getByRole('button', { name: 'بعدی', exact: true }).click()
  try {
    await signIn(page, 'owner')
    const extensionResponse = await page.request.get('/api/admin/extensions'); expect(extensionResponse.ok()).toBe(true)
    const extensionState = await extensionResponse.json()
    for (const id of ['prompt-master','music','cinema','reviews','businesses']) { const existing = extensionState.extensions.find((entry: any) => entry.manifest.id === id); expect(existing).toBeTruthy(); originals.set(id, existing.state.enabled); expect((await page.request.patch('/api/admin/extensions', { headers, data: { id, enabled: true } })).ok()).toBe(true) }
    for (const theme of ['light','dark']) for (const width of [1440,390]) {
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]); await page.setViewportSize({ width, height: 1050 }); await page.goto('/admin/imports')
      for (const label of ['پرامپت مستر','هنرمندان (پروفایل مرکزی)','کسب‌وکارها']) await expect(page.locator('.imp-dest').filter({ has: page.getByText(label, { exact: true }) })).toBeEnabled()
      await capture(`destinations-${theme}-${width}`, '.imp-grid')
      await page.getByRole('button', { name: 'راهنما و نمونه‌فایل', exact: true }).click(); await expect(page.getByRole('heading', { name: 'پرامپت مستر، هنرمندان و کسب‌وکارها', exact: true })).toBeVisible(); await capture(`guide-${theme}-${width}`, '.imp-guide')
    }
    await page.setViewportSize({ width: 1440, height: 1050 })
    for (const [adapter,label] of [['prompts','پرامپت مستر'],['artists','هنرمندان (پروفایل مرکزی)'],['businesses','کسب‌وکارها']] as const) {
      const row = JSON.parse(fs.readFileSync(`public/examples/imports/${adapter}.json`, 'utf8'))[0]
      row.externalId = `${stamp}-${adapter}`; row.slug = `${stamp}-${adapter}`
      if (row.title) row.title = `الگوی پرامپت ${stamp}`
      if (row.name) row.name = `${adapter === 'artists' ? 'هنرمند' : 'کسب‌وکار'} ${stamp}`
      if (row.nameEn) row.nameEn = `Owned Artist ${stamp}`
      if (row.website) row.website = `https://${stamp}.example`
      await page.goto('/admin/imports'); await page.locator('.imp-dest').filter({ has: page.getByText(label, { exact: true }) }).click(); await next()
      await page.getByLabel('نام منبع شناسه‌ها', { exact: false }).fill(stamp)
      await page.locator('input[type=file]').setInputFiles({ name: adapter + '.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([row])) })
      const uploaded = page.waitForResponse(response => response.url().includes('/api/admin/imports/upload') && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'بارگذاری و تحلیل فایل', exact: true }).click(); const upload = await uploaded; expect(upload.ok()).toBe(true); const jobId = (await upload.json()).job.id; jobs.push(jobId)
      await expect(page.locator('.imp-steps li.is-current')).toContainText('نگاشت فیلدها'); await capture(`${adapter}-mapping`, '.imp-wizard')
      await next(); await next(); await page.getByRole('button', { name: 'نمایش پیش‌نمایش', exact: true }).click(); await expect(page.locator('.imp-preview')).toHaveCount(1)
      await next(); const dryResponse = page.waitForResponse(response => response.url().endsWith('/api/admin/imports') && response.request().postDataJSON()?.op === 'dry-run')
      await page.getByRole('button', { name: 'اجرای آزمایشی (بدون ذخیره)', exact: true }).click(); const dry = await dryResponse; expect(dry.ok()).toBe(true); const body = await dry.json(); expect(body.summary.invalid, JSON.stringify(body.summary.problems)).toBe(0); expect(body.summary.actions.CREATE).toBe(1)
      await next(); await next(); await next(); await expect(page.getByRole('button', { name: 'شروع ورود اطلاعات', exact: true })).toBeEnabled(); await capture(`${adapter}-plan`, '.imp-wizard')
      await page.getByRole('button', { name: 'شروع ورود اطلاعات', exact: true }).click()
      await expect.poll(async () => { const response = await page.request.get('/api/admin/imports?view=job&id=' + jobId, { maxRetries: 2 }); return response.ok() ? (await response.json()).status : '' }, { timeout: 50000 }).toBe('DONE')
      const response = await page.request.get('/api/admin/imports?view=records&id=' + jobId); const report = await response.json(); expect(report.records[0].action).toBe('CREATE'); expect(report.records[0].status).toBe('OK')
      await capture(`${adapter}-report`, '.imp-wizard')
    }
    const restricted = await browser.newContext({ baseURL }); const target = await restricted.newPage()
    try { await signIn(target, 'magazine'); expect((await target.request.get('/api/admin/imports')).status()).toBe(403) } finally { await restricted.close() }
    expect(errors).toEqual([])
  } finally {
    for (const jobId of [...jobs].reverse()) {
      const current = await page.request.get('/api/admin/imports?view=job&id=' + jobId).then(response => response.json()).catch(() => null)
      if (current?.status === 'DRAFT') { await page.request.post('/api/admin/imports', { headers, data: { op: 'delete', id: jobId } }); continue }
      await page.request.post('/api/admin/imports', { headers, data: { op: 'rollback', id: jobId, confirm: true } }).catch(() => null)
      await expect.poll(async () => { const response = await page.request.get('/api/admin/imports?view=job&id=' + jobId, { maxRetries: 2 }); return response.ok() ? (await response.json()).status : '' }, { timeout: 50000 }).toBe('ROLLED_BACK')
      await page.request.post('/api/admin/imports', { headers, data: { op: 'delete', id: jobId } })
    }
    for (const [id,enabled] of [...originals].reverse()) await page.request.patch('/api/admin/extensions', { headers, data: { id, enabled } })
    await context.close()
  }
})
