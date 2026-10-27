import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

test.skip(!process.env.E2E_NAVIGATION_COMPANY_FIXTURE, 'explicit owned local staff/track fixture required')
test.describe.configure({ mode: 'serial' })

async function axe(page: Page, selector: string) {
  if (!process.env.E2E_AXE_PATH) return
  await page.evaluate(source => {
    const script = document.createElement('script')
    script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || ''
    script.textContent = source; document.head.append(script)
  }, fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
  const violations = await page.evaluate(async selector => (await (window as any).axe.run(document.querySelector(selector), { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations, selector)
  expect(violations).toEqual([])
}

test('Admin contact and selected map pin persist, render publicly and reject stale or unauthorized writes', async ({ browser, baseURL }, info) => {
  test.setTimeout(360_000)
  expect(new URL(baseURL!).hostname).toBe('localhost')
  const f = JSON.parse(fs.readFileSync(process.env.E2E_NAVIGATION_COMPANY_FIXTURE!, 'utf8'))
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  context.setDefaultTimeout(20_000)
  await context.addCookies([{ name: 'next-auth.session-token', value: f.tokens.full, url: baseURL! }])
  const page = await context.newPage(), errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const before = await (await context.request.get('/api/admin/site')).json()
  let ownedContact: unknown
  const fixtureContact = { ...before.config.contact, address: 'نشانی آزمایشی '+f.stamp, phone: '+98 111 222 3333', email: 'owned@example.invalid', telegram: '@ownedcontact', instagram: '@ownedcontact', x: '@ownedcontact', hours: 'زمان آزمایشی', latitude: 36.474506, longitude: 52.872342, zoom: before.config.contact?.zoom ?? 16, mapEnabled: true }
  const publicContext = await browser.newContext({ baseURL, reducedMotion: 'reduce' }), publicPage = await publicContext.newPage()
  try {
    await page.goto('/admin/studio?tab=design')
    const form = page.locator('#contact-information')
    await expect(form.getByRole('heading', { name: 'اطلاعات تماس و نقشهٔ موبوکام' })).toBeVisible()
    const stale = await context.newPage()
    await stale.goto('/admin/studio?tab=design'); await stale.getByLabel('نشانی دفتر', { exact: true }).fill('پیش‌نویس حفظ‌شده')
    await form.getByLabel('لینک پین Google Maps یا OpenStreetMap', { exact: true }).fill('https://www.google.com/maps/place/example/@36.4745071,52.8729857,19z/data=!3d36.4634867!4d52.8577787!3m3!8m2!3d36.474506!4d52.872342?entry=ttu')
    await form.getByRole('button', { name: 'دریافت پین از لینک', exact: true }).click()
    await expect(form.getByLabel('عرض جغرافیایی', { exact: true })).toHaveValue('36.474506')
    await expect(form.getByLabel('طول جغرافیایی', { exact: true })).toHaveValue('52.872342')
    await form.getByLabel('لینک پین Google Maps یا OpenStreetMap', { exact: true }).fill('https://evil.invalid/?q=1,2')
    await form.getByRole('button', { name: 'دریافت پین از لینک', exact: true }).click()
    await expect(form.getByRole('status')).toContainText('لینک کامل')
    await expect(form.getByLabel('عرض جغرافیایی', { exact: true })).toHaveValue('36.474506')
    for (const [label, value] of [['شماره تماس', '+98 111 222 3333'], ['ایمیل عمومی', 'owned@example.invalid'], ['تلگرام', '@ownedcontact'], ['اینستاگرام', '@ownedcontact'], ['حساب X', '@ownedcontact'], ['نشانی دفتر', 'نشانی آزمایشی '+f.stamp], ['ساعت پاسخ‌گویی یا مراجعه', 'زمان آزمایشی']]) await form.getByLabel(label, { exact: true }).fill(value)
    let saving = page.waitForResponse(r => r.url().endsWith('/api/admin/site') && r.request().method() === 'PUT')
    await page.getByRole('button', { name: 'انتشار تغییرات', exact: true }).click(); expect((await saving).status()).toBe(200)
    ownedContact = fixtureContact
    saving = stale.waitForResponse(r => r.url().endsWith('/api/admin/site') && r.request().method() === 'PUT')
    await stale.getByRole('button', { name: 'انتشار تغییرات', exact: true }).click(); expect((await saving).status()).toBe(409)
    await expect(stale.getByRole('textbox', { name: 'نشانی دفتر', exact: true })).toHaveValue('پیش‌نویس حفظ‌شده'); await stale.close()
    await page.reload(); await expect(form.getByLabel('شماره تماس', { exact: true })).toHaveValue('+98 111 222 3333')
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      console.log('Player and section state', theme, width)
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]); await page.setViewportSize({ width, height: 1000 }); await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await axe(page, '#contact-information'); await form.screenshot({ path: info.outputPath(`contact-admin-${theme}-${width}.png`) })
      await publicContext.addCookies([{ name: 'theme', value: theme, url: baseURL! }]); await publicPage.setViewportSize({ width, height: 1000 })
      for (const slug of ['contact', 'about']) {
        const response = await publicPage.goto('/p/'+slug)
        expect(response?.status()).toBe(200); expect(response?.headers()['content-security-policy']).toContain('https://www.openstreetmap.org')
        const panel = publicPage.locator('section[aria-labelledby="company-panel-title"]')
        await expect(panel.getByRole('link', { name: /ایمیل/ })).toHaveAttribute('href', 'mailto:owned%40example.invalid'.replace('%40','@'))
        const map = panel.locator('iframe'); await map.scrollIntoViewIfNeeded(); await expect(map).toHaveAttribute('src', /marker=36.474506%2C52.872342/)
        expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await axe(publicPage, 'section[aria-labelledby="company-panel-title"]'); await panel.screenshot({ path: info.outputPath(`${slug}-${theme}-${width}.png`) })
        expect(await publicPage.locator('link[rel="canonical"]').getAttribute('href')).toContain('/p/'+slug)
      }
    }
    const noOrigin = await context.request.put('/api/admin/site', { data: before.config }); expect(noOrigin.status()).toBe(403)
    await form.getByLabel('نمایش نقشه و پین در صفحات تماس', { exact: true }).uncheck()
    saving = page.waitForResponse(r => r.url().endsWith('/api/admin/site') && r.request().method() === 'PUT')
    await page.getByRole('button', { name: 'انتشار تغییرات', exact: true }).click(); expect((await saving).status()).toBe(200)
    ownedContact = { ...fixtureContact, mapEnabled: false }
    await publicPage.goto('/p/contact'); await expect(publicPage.locator('section[aria-labelledby="company-panel-title"] iframe')).toHaveCount(0)
    expect((await (await context.request.get('/api/admin/site')).json()).config.contact.latitude).toBe(36.474506)
    const limited = await browser.newContext({ baseURL })
    try {
      await limited.addCookies([{ name: 'next-auth.session-token', value: f.tokens.limited, url: baseURL! }])
      expect((await limited.request.get('/api/admin/site')).status()).toBe(403)
      expect((await limited.request.post('/api/admin/mega-menu', { headers: { Origin: baseURL! }, data: { preview: 'home', config: {} } })).status()).toBe(403)
    } finally { await limited.close() }
    expect(errors).toEqual([])
  } finally {
    const fresh = await (await context.request.get('/api/admin/site')).json()
    // Never reset a concurrent owner's configuration from the original whole-document snapshot.
    if (ownedContact && JSON.stringify(fresh.config.contact) === JSON.stringify(ownedContact)) {
      const restoredConfig = { ...fresh.config }
      if (before.config.contact === undefined) delete restoredConfig.contact
      else restoredConfig.contact = before.config.contact
      const restored = await context.request.put('/api/admin/site', { headers: { Origin: baseURL!, 'If-Match': fresh.revision }, data: restoredConfig })
      expect(restored.status()).toBe(200)
      expect((await (await context.request.get('/api/admin/site')).json()).config.contact).toEqual(before.config.contact)
    }
    await publicContext.close(); await context.close()
  }
})

test('new section bars and Home mega menu work; persistent player and queue follow both site themes', async ({ browser, baseURL }, info) => {
  test.setTimeout(240_000)
  const f = JSON.parse(fs.readFileSync(process.env.E2E_NAVIGATION_COMPANY_FIXTURE!, 'utf8'))
  expect(new URL(baseURL!).hostname).toBe('localhost'); expect(f.track).toBeTruthy()
  const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' })
  context.setDefaultTimeout(15_000)
  const page = await context.newPage()
  await context.addInitScript(track => { localStorage.setItem('mu.session.v1', JSON.stringify({ queue: [{ ...track, artist: track.artist.name, artistSlug: track.artist.slug, hasHq: false }], index: 0, time: 0 })) }, f.track)
  try {
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]); await page.setViewportSize({ width, height: 1000 })
      for (const [path, name] of [['/', 'منوی خانه'], ['/celebrities', 'منوی هنرمندان'], ['/businesses', 'منوی کسب‌وکارها']]) {
        console.log('Section', path)
        expect((await page.goto(path, { waitUntil: 'domcontentloaded' }))?.status()).toBe(200)
        await expect(page.getByRole('navigation', { name, exact: true })).toBeAttached()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      }
      await page.goto('/music', { waitUntil: 'domcontentloaded' }); const player = page.locator('.mu-player'); await expect(player).toBeVisible()
      console.log('Player ready', theme, width)
      const queueButton = player.locator('button[aria-label="صف پخش"]:visible').first()
      await queueButton.click(); await expect(player.locator('.mu-queue')).toBeVisible()
      const shuffle = player.getByRole('button', { name: 'پخش تصادفی', exact: true })
      if (await shuffle.isVisible()) {
        if (!(await shuffle.getAttribute('class'))?.includes('is-on')) await shuffle.click()
        await expect(shuffle).toHaveClass(/is-on/)
        await player.getByRole('button', { name: 'تکرار', exact: true }).click()
      }
      const bg = await player.evaluate(el => getComputedStyle(el).backgroundColor)
      if (theme === 'light') expect(bg).not.toBe('rgba(13, 12, 22, 0.78)')
      await axe(page, '.mu-player'); await page.screenshot({ path: info.outputPath(`player-${theme}-${width}.png`) })
      await player.getByRole('button', { name: 'بستن صف پخش', exact: true }).click(); await expect(player.locator('.mu-queue')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    }
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/')
    const toggle = page.getByRole('button', { name: 'زیرمنوی خانه', exact: true }).first()
    await toggle.focus(); await page.keyboard.press('Enter'); await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const mega = page.locator('[data-navigation-panel="mega"]:visible').first()
    await expect(mega.getByRole('link', { name: 'تماس با ما', exact: true })).toBeVisible()
    await page.keyboard.press('Escape'); await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(toggle).toBeFocused()
    await page.setViewportSize({ width: 390, height: 1000 })
    await page.getByRole('button', { name: 'باز کردن منو', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: 'منوی سایت', exact: true })
    await drawer.getByRole('button', { name: 'زیرمنوی هنرمندان', exact: true }).click()
    await expect(drawer.locator('a[href="/celebrities?role=actor"]')).toBeVisible()
    await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0)
  } finally { await context.close() }
})

test('section preset draft retains concurrent form edits and blocks another import or publication until ready', async ({ browser, baseURL }, info) => {
  test.setTimeout(120_000)
  const f = JSON.parse(fs.readFileSync(process.env.E2E_NAVIGATION_COMPANY_FIXTURE!, 'utf8'))
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addCookies([{ name: 'next-auth.session-token', value: f.tokens.full, url: baseURL! }])
  const page = await context.newPage()
  let release: () => void = () => {}, requests = 0
  const gate = new Promise<void>(resolve => { release = resolve })
  try {
    await page.route('**/api/admin/mega-menu', async route => {
      if (route.request().method() !== 'POST') return route.continue()
      requests++; const response = await route.fetch(); await gate; await route.fulfill({ response })
    })
    // Menus have their own page (owner, 2026-10-28): the section recipe is in the header tab of «مدیریت منوها».
    await page.goto('/admin/menus?tab=header')
    const header = page.locator('section').filter({ has: page.getByRole('heading', { name: 'منوی اصلی هدر', exact: true }) }).first()
    const firstTitle = header.locator('ol').first().locator(':scope > li').first().getByRole('textbox', { name: 'عنوان', exact: true }).first()
    await header.locator('select').first().selectOption('home')
    await header.getByRole('button', { name: '＋ افزودن کامل بخش', exact: true }).click()
    await expect(header.getByRole('button', { name: 'در حال دریافت بخش…', exact: true })).toBeDisabled()
    await firstTitle.fill('پیش‌نویس هم‌زمان '+f.stamp)
    await expect(page.getByRole('button', { name: 'انتشار منوها', exact: true })).toBeDisabled()
    release()
    await expect(header.getByRole('status')).toContainText('بخش با دسته‌ها')
    await expect(firstTitle).toHaveValue('پیش‌نویس هم‌زمان '+f.stamp)
    await expect(page.getByRole('button', { name: 'انتشار منوها', exact: true })).toBeEnabled()
    expect(requests).toBe(1)
    const recipe = header.getByRole('heading', { name: 'افزودن کامل یک بخش', exact: true }).locator('..').locator('..')
    for (const theme of ['light','dark']) for (const width of [1440,390]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme); await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await recipe.screenshot({ path: info.outputPath(`section-preset-${theme}-${width}.png`) })
    }
  } finally { release(); await context.close() }
})
