import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

test.skip(!process.env.E2E_ARTIST_FEEDBACK_FIXTURE, 'explicit owned local artists/feedback fixture required')

async function axe(page: Page, selector: string) {
  if (!process.env.E2E_AXE_PATH) return
  await page.evaluate(source => {
    const script = document.createElement('script')
    script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || ''
    script.textContent = source; document.head.append(script)
  }, fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
  const violations = await page.evaluate(async selector => (await (window as any).axe.run(document.querySelector(selector), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations, selector)
  expect(violations).toEqual([])
}

test('artist English slug is suggested, editable and persisted; old public URL redirects', async ({ browser, baseURL }, info) => {
  test.setTimeout(240_000)
  expect(new URL(baseURL!).hostname).toBe('localhost')
  const f = JSON.parse(fs.readFileSync(process.env.E2E_ARTIST_FEEDBACK_FIXTURE!, 'utf8'))
  f.stamp += '-'+Date.now().toString(36)
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addCookies([{ name: 'next-auth.session-token', value: f.tokens.manager, url: baseURL! }])
  const page = await context.newPage(), errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  try {
    await page.goto('/admin/celebrities')
    await page.getByRole('button', { name: '+ هنرمند جدید', exact: true }).click()
    const editor = page.locator('.cbx-editor'), english = editor.getByLabel('نام انگلیسی', { exact: false }), slug = editor.getByLabel('نشانی صفحه (slug)', { exact: true })
    await editor.getByLabel('نام', { exact: true }).fill('هنرمند آزمایشی '+f.stamp)
    await english.fill('Test Artist '+f.stamp)
    await expect(slug).toHaveValue('test-artist-'+f.stamp)
    await slug.fill(f.stamp+'-custom')
    await english.fill('Updated Artist '+f.stamp)
    await expect(slug).toHaveValue(f.stamp+'-custom')
    await editor.getByRole('button', { name: 'ساخت از نام انگلیسی', exact: true }).click()
    await expect(slug).toHaveValue('updated-artist-'+f.stamp)
    await slug.fill('bad/path')
    await expect(slug).toHaveAttribute('aria-invalid', 'true')
    await expect(editor.getByRole('button', { name: 'ذخیرهٔ پروفایل', exact: true })).toBeDisabled()
    await slug.fill(f.stamp+'-custom')
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }])
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      await page.setViewportSize({ width, height: 1000 })
      await expect(slug).toHaveValue(f.stamp+'-custom')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await axe(page, '.cbx-editor')
      await editor.screenshot({ path: info.outputPath(`artist-${theme}-${width}.png`) })
    }
    const saving = page.waitForResponse(r => r.url().endsWith('/api/admin/celebrities') && r.request().method() === 'POST')
    await editor.getByRole('button', { name: 'ذخیرهٔ پروفایل', exact: true }).click()
    const response = await saving
    expect(response.status()).toBe(200)
    const row = (await response.json()).result
    expect(row.slug).toBe(f.stamp+'-custom')
    const track = await context.request.post('/api/admin/media-library?type=music-tracks', { headers: { origin: baseURL! }, data: { title: 'اثر آزمایشی '+f.stamp, slug: f.stamp+'-song', artistId: row.musicArtistId, status: 'PUBLISHED', publishedAt: new Date(Date.now()-60_000).toISOString() } })
    expect(track.ok(), await track.text()).toBe(true)
    await page.goto(`/admin/celebrities?edit=${row.id}`)
    await expect(slug).toHaveValue(row.slug)
    await english.fill('Another Name '+f.stamp)
    await expect(slug).toHaveValue(row.slug)
    await slug.fill(f.stamp+'-renamed')
    const rename = page.waitForResponse(r => r.url().endsWith('/api/admin/celebrities') && r.request().method() === 'POST')
    await editor.getByRole('button', { name: 'ذخیرهٔ پروفایل', exact: true }).click()
    expect((await rename).status()).toBe(200)
    const guest = await browser.newContext({ baseURL }), view = await guest.newPage()
    try {
      await view.goto('/celebrities/'+row.slug)
      await expect(view).toHaveURL(new RegExp('/celebrities/'+f.stamp+'-renamed$'))
      await expect(view.locator('link[rel=canonical]')).toHaveAttribute('href', new RegExp('/celebrities/'+f.stamp+'-renamed$'))
      await expect(view.getByRole('heading', { level: 1 })).toContainText(f.stamp)
    } finally { await guest.close() }
    const denied = await browser.newContext({ baseURL })
    await denied.addCookies([{ name: 'next-auth.session-token', value: f.tokens.store, url: baseURL! }])
    try { expect((await denied.request.post('/api/admin/celebrities', { headers: { origin: baseURL! }, data: { action: 'save', id: row.id, name: 'forbidden', slug: f.stamp+'-forbidden' } })).status()).toBe(403) } finally { await denied.close() }
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('feedback native filters, persisted answer, error/retry and obsolete-response protection', async ({ browser, baseURL }, info) => {
  test.setTimeout(240_000)
  expect(new URL(baseURL!).hostname).toBe('localhost')
  const f = JSON.parse(fs.readFileSync(process.env.E2E_ARTIST_FEEDBACK_FIXTURE!, 'utf8'))
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addCookies([{ name: 'next-auth.session-token', value: f.tokens.store, url: baseURL! }])
  const page = await context.newPage(), errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  try {
    await page.goto('/admin/product-feedback')
    const kind = page.getByRole('combobox', { name: 'نوع محتوا', exact: true }), status = page.getByRole('combobox', { name: 'وضعیت', exact: true })
    await expect(page.getByText('دیدگاه آزمایشی '+f.stamp, { exact: true })).toBeVisible()
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]); await page.reload()
      await page.setViewportSize({ width, height: 1000 })
      await expect(page.getByText('دیدگاه آزمایشی '+f.stamp, { exact: true })).toBeVisible()
      expect(await kind.evaluate(el => getComputedStyle(el).appearance)).toBe('auto')
      await expect(kind.locator('option')).toHaveText(['دیدگاه‌ها', 'پرسش‌ها'])
      await expect(status.locator('option')).toHaveText(['در انتظار بررسی', 'تأییدشده', 'ردشده', 'همه'])
      await kind.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
      await expect(kind).toHaveValue('question')
      await expect(page.getByText('پرسش آزمایشی '+f.stamp, { exact: true })).toBeVisible()
      for (const value of ['APPROVED', 'REJECTED', 'ALL', 'PENDING']) {
        const loaded = page.waitForResponse(r => r.url().includes('/api/admin/product-feedback?') && new URL(r.url()).searchParams.get('status') === value)
        await status.selectOption(value); expect((await loaded).status()).toBe(200)
      }
      await expect(page.getByText('پرسش آزمایشی '+f.stamp, { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await axe(page, '.cms-workspace')
      await page.screenshot({ path: info.outputPath(`feedback-${theme}-${width}.png`) })
    }
    const item = page.locator('article').filter({ hasText: 'پرسش آزمایشی '+f.stamp })
    await item.getByLabel('پاسخ فروشگاه', { exact: true }).fill('پاسخ ذخیره‌شده '+f.stamp)
    const saved = page.waitForResponse(r => r.url().endsWith('/api/admin/product-feedback') && r.request().method() === 'PATCH')
    await item.getByRole('button', { name: 'تأیید', exact: true }).click(); expect((await saved).status()).toBe(200)
    await status.selectOption('APPROVED')
    await expect(item.getByLabel('پاسخ فروشگاه', { exact: true })).toHaveValue('پاسخ ذخیره‌شده '+f.stamp)
    await page.route('**/api/admin/product-feedback?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'خطای آزمایشی دریافت' }) }))
    await status.selectOption('ALL')
    await expect(page.locator('.cms-workspace').getByRole('alert')).toContainText('خطای آزمایشی دریافت')
    await expect(page.getByText('با این نوع و وضعیت، موردی یافت نشد.', { exact: false })).toHaveCount(0)
    await page.unroute('**/api/admin/product-feedback?**')
    await page.getByRole('button', { name: 'دریافت دوباره', exact: true }).click()
    await expect(item).toBeVisible()
    await expect(page.locator('.cms-workspace').getByRole('alert')).toHaveCount(0)
    let delayedReview = false
    await page.route('**/api/admin/product-feedback?**', async route => {
      if (new URL(route.request().url()).searchParams.get('kind') === 'review') {
        delayedReview = true
        await new Promise(resolve => setTimeout(resolve, 700))
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: -1, body: 'obsolete review fixture', product: { name: 'old', slug: 'old' }, user: null }] }) }).catch(() => undefined)
      } else await route.continue()
    })
    await kind.selectOption('review')
    await expect.poll(() => delayedReview).toBe(true)
    await kind.selectOption('question')
    await expect(item).toBeVisible()
    await page.waitForTimeout(900)
    await expect(page.getByText('obsolete review fixture', { exact: true })).toHaveCount(0)
    expect(errors).toEqual([])
    const guest = await browser.newContext({ baseURL })
    try { expect((await guest.request.get('/api/admin/product-feedback')).status()).toBe(403) } finally { await guest.close() }
  } finally { await context.close() }
})
