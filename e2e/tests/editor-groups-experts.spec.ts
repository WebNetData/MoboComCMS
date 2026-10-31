import fs from 'node:fs'
import { test, expect, type Page, type BrowserContext } from '@playwright/test'

test.skip(!process.env.E2E_EDITOR_TEAM_FIXTURE, 'explicit owned local fixture required')
async function axe(page: Page, selector: string) {
  if (!process.env.E2E_AXE_PATH) return
  await page.evaluate(source => { const script = document.createElement('script'); script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || ''; script.textContent = source; document.head.append(script) }, fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
  const violations = await page.evaluate(async selector => (await (window as any).axe.run(document.querySelector(selector), { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations, selector)
  expect(violations.map((v: any) => ({ id: v.id, nodes: v.nodes.map((n: any) => ({ target: n.target, summary: n.failureSummary })) }))).toEqual([])
}

test('authoring decorations, styles, scoped teams, manual degrees and expert queues persist through their real owners', async ({ browser, baseURL }, info) => {
  test.setTimeout(420_000)
  expect(new URL(baseURL!).hostname).toBe('localhost')
  const f = JSON.parse(fs.readFileSync(process.env.E2E_EDITOR_TEAM_FIXTURE!, 'utf8')), contexts: BrowserContext[] = [], errors: string[] = []
  const as = async (name: string) => { const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' }); context.setDefaultTimeout(20_000); contexts.push(context); await context.addCookies([{ name: 'next-auth.session-token', value: f.tokens[name], url: baseURL! }, { name: 'mc-translate-dismissed', value: '1', url: baseURL! }]); const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); return { context, page } }
  const { context: writer, page } = await as('writer'), { context: owner, page: admin } = await as('owner')
  let styleId = ''
  try {
    expect((await owner.request.post('/api/admin/theme-templates', { headers: { Origin: baseURL! }, data: { type: 'single-post', name: 'retired' } })).status()).toBe(410)
    await admin.goto('/admin/theme-builder')
    await admin.getByRole('button', { name: '＋ قالب جدید', exact: true }).click()
    await expect(admin.locator('.tb-type-tile')).toHaveCount(4)
    await expect(admin.locator('.tb-type-tile.t-single-post')).toHaveCount(0)
    await admin.locator('.tb-type-grid').screenshot({ path: info.outputPath('remaining-template-types.png') })
    await admin.getByRole('dialog').getByRole('button', { name: 'بستن', exact: true }).click()
    const initialResponse = await writer.request.get('/api/admin/journal/settings'), initial = await initialResponse.json()
    if (initial.settings.postStyle.custom.some((style: any) => style.name === f.stamp)) expect((await writer.request.post('/api/admin/journal/settings', { headers: { Origin: baseURL!, 'if-match': initial.settingsRevision }, data: { postStyle: { ...initial.settings.postStyle, custom: initial.settings.postStyle.custom.filter((style: any) => style.name !== f.stamp) } } })).status()).toBe(200)
    console.log('Owned authoring fixture reset; beginning decoration flow.')
    expect((await owner.request.post('/api/admin/store/orders/' + f.order, { headers: { Origin: baseURL! }, data: { action: 'assign', assigneeId: null } })).status()).toBe(200)
    expect((await owner.request.patch('/api/admin/forms/submissions', { headers: { Origin: baseURL! }, data: { id: f.submission, work: { take: false } } })).status()).toBe(200)
    expect((await writer.request.patch('/api/admin/cms?type=pages', { headers: { Origin: baseURL! }, data: { id: f.page, status: 'DRAFT', content: '<p>آغاز نوشته</p>' } })).status()).toBe(200)
    await page.goto('/admin/pages?edit=' + f.page)
    const old = page.getByRole('button', { name: 'ادامه با ویرایشگر قدیمی', exact: true }); if (await old.count()) await old.click()
    const classic = page.locator('.ce'), frame = classic.frameLocator('.tox-edit-area iframe')
    await expect(frame.locator('body')).toBeVisible()
    await classic.getByRole('button', { name: /زیباسازی متن/ }).click()
    await page.getByRole('dialog', { name: 'زیباسازی متن', exact: true }).press('Escape')
    await expect(page.getByRole('dialog', { name: 'زیباسازی متن', exact: true })).toHaveCount(0)
    await expect(classic.getByRole('button', { name: /زیباسازی متن/ })).toBeFocused()
    for (const [kind, text] of [['یادداشت', 'نکتهٔ مهم برای خواننده'], ['هشدار', 'پیش از انجام کار دقت کنید'], ['بخش بازشونده', 'پاسخ کامل و جزئیات']]) {
      await classic.getByRole('button', { name: /زیباسازی متن/ }).click()
      const dialog = page.getByRole('dialog', { name: 'زیباسازی متن', exact: true })
      await dialog.getByRole('button', { name: new RegExp('^' + kind) }).click()
      await dialog.getByLabel('متن شما', { exact: true }).fill(text)
      for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1100 }); await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await axe(page, '.ce-decoration-dialog')
        if (kind === 'هشدار') await dialog.screenshot({ path: info.outputPath(`decoration-${theme}-${width}.png`) })
      }
      await dialog.getByRole('button', { name: 'درج در نوشته', exact: true }).click()
    }
    await expect(frame.locator('[data-mc-decoration]')).toHaveCount(3)
    await expect(frame.locator('[data-mc-decoration] [data-mc-decoration]')).toHaveCount(0)
    await classic.getByRole('tab', { name: 'متن', exact: true }).click()
    const source = classic.locator('textarea'); await source.fill(await source.inputValue() + '<p>[tip]نکته با کد دستی[/tip]</p>')
    await page.getByLabel('وضعیت', { exact: true }).selectOption('PUBLISHED'); await page.getByRole('button', { name: 'بازبینی و انتشار', exact: true }).click()
    const saving = page.waitForResponse(r => r.url().includes('/api/admin/cms?type=pages') && r.request().method() === 'PATCH'); await page.getByRole('button', { name: 'تأیید و انتشار', exact: true }).click(); expect((await saving).status()).toBe(200)
    await page.goto('/admin/pages?edit=' + f.page); if (await old.count()) await old.click(); await expect(frame.locator('[data-mc-decoration]')).toHaveCount(4)
    const visitor = await browser.newContext({ baseURL, reducedMotion: 'reduce' }); contexts.push(visitor); await visitor.addCookies([{ name: 'mc-translate-dismissed', value: '1', url: baseURL! }]); const publicPage = await visitor.newPage()
    expect((await publicPage.goto('/p/' + f.stamp))?.status()).toBe(200)
    await expect(publicPage.locator('.mc-decor')).toHaveCount(4); await publicPage.getByText('نمایش جزئیات', { exact: true }).click(); await expect(publicPage.getByText('پاسخ کامل و جزئیات', { exact: true })).toBeVisible()
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) { await publicPage.setViewportSize({ width, height: 1000 }); await publicPage.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme); await axe(publicPage, '.mc-decor'); expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); await publicPage.locator('.mc-decor-warning').screenshot({ path: info.outputPath(`public-decoration-${theme}-${width}.png`) }) }

    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto('/admin/journal/styles')
    console.log('Decoration persistence/playback-independent disclosure and four theme/width states passed.')
    await expect(page.getByRole('heading', { name: 'استایل صفحهٔ نوشته', exact: true })).toBeVisible()
    await expect(page.getByText('قالب‌های آمادهٔ نوشته', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: /نسخهٔ من از/ }).first().click()
    await page.getByLabel('نام استایل', { exact: true }).fill(f.stamp)
    await page.getByLabel('اندازهٔ متن', { exact: true }).selectOption('22'); await page.getByLabel('فاصلهٔ خطوط', { exact: true }).selectOption('2.3')
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1100 }); await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); await axe(page, '.sa'); await page.screenshot({ path: info.outputPath(`style-studio-${theme}-${width}.png`), fullPage: true }); await page.locator('[class*="designer"]').first().screenshot({ path: info.outputPath(`style-designer-${theme}-${width}.png`), timeout: 20000 }) }
    const savedStyle = page.waitForResponse(r => r.url().includes('/api/admin/journal/settings') && r.request().method() === 'POST'); await page.getByRole('button', { name: 'ذخیره', exact: true }).first().click(); expect((await savedStyle).status()).toBe(200)
    let settings = await (await writer.request.get('/api/admin/journal/settings')).json(); styleId = settings.settings.postStyle.custom.find((style: any) => style.name === f.stamp).id
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto('/admin/posts?edit=' + f.post)
    await expect(page.getByLabel('قالب نوشته', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: f.stamp, exact: true })).toBeVisible(); await page.getByRole('button', { name: f.stamp, exact: true }).click()
    expect((await writer.request.patch('/api/admin/cms?type=posts', { headers: { Origin: baseURL! }, data: { id: f.post, status: 'PUBLISHED', content: '<p>[quote]متن زیبای نوشته[/quote]</p>' } })).status()).toBe(200)
    await publicPage.goto('/blog/' + f.stamp)
    await expect(publicPage.locator('.journal-prose').first()).toHaveCSS('font-size', '22px')
    await expect(publicPage.locator('.journal-prose').first()).toHaveCSS('line-height', '50.6px')
    console.log('Style controls, saved choice and public typography passed.')

    await admin.goto('/admin/roles')
    const card = admin.locator('.card').filter({ has: admin.getByRole('heading', { name: 'تیم آزمایشی expert', exact: true }) })
    await card.getByRole('button', { name: /ویرایش/ }).click()
    await expect(card.getByRole('group', { name: 'کارشناسان و نویسندگان' })).toBeVisible()
    await axe(admin, '.role-permission-groups'); await card.screenshot({ path: info.outputPath('role-permissions.png'), timeout: 20000 })
    await card.getByRole('button', { name: /انصراف|لغو/ }).click()
    console.log('Role permission groups passed.')

    const { context: forumContext, page: forumPage } = await as('forum')
    await forumPage.goto('/admin/forum?tab=users'); await forumPage.getByRole('searchbox', { name: 'جست‌وجوی کاربر', exact: true }).fill(f.username)
    await forumPage.locator(`[aria-controls="fa-user-${f.ids.expert}"]`).click()
    const level = forumPage.getByLabel('درجهٔ فعالیت', { exact: true }); await level.selectOption('active'); await expect(level).toHaveValue('active')
    await forumPage.reload(); await forumPage.getByRole('searchbox', { name: 'جست‌وجوی کاربر', exact: true }).fill(f.username); await forumPage.locator(`[aria-controls="fa-user-${f.ids.expert}"]`).click(); await expect(forumPage.getByLabel('درجهٔ فعالیت', { exact: true })).toHaveValue('active')
    expect((await forumContext.request.get('/api/admin/store/orders')).status()).toBe(403)
    await forumPage.locator('.fa-user-panel').screenshot({ path: info.outputPath('manual-degree.png') }); await axe(forumPage, '.fa-user-panel')
    await forumPage.getByLabel('درجهٔ فعالیت', { exact: true }).selectOption('')

    const { context: expert, page: expertPage } = await as('expert'), { context: other, page: otherPage } = await as('other')
    await expertPage.goto('/admin/store/orders/' + f.order)
    await expertPage.getByRole('button', { name: 'برداشتن سفارش', exact: true }).click()
    await expect(expertPage.getByText('این سفارش در کارتابل شماست.', { exact: true })).toBeVisible()
    await expect(expertPage.getByRole('radio', { name: 'لغو سفارش', exact: true })).toHaveCount(0)
    expect((await expert.request.get('/api/admin/roles')).status()).toBe(403)
    expect((await other.request.get('/api/admin/store/orders/' + f.order)).status()).toBe(404)
    expect((await other.request.post('/api/admin/store/orders/' + f.order, { headers: { Origin: baseURL! }, data: { action: 'note', note: 'کار همکار' } })).status()).toBe(403)
    await admin.goto('/admin/store/orders/' + f.order); await admin.getByLabel('انتخاب کارشناس', { exact: true }).selectOption(String(f.ids.other))
    await expect(admin.getByLabel('انتخاب کارشناس', { exact: true })).toHaveValue(String(f.ids.other))
    await otherPage.goto('/admin/store/orders/' + f.order); await expect(otherPage.getByText('این سفارش در کارتابل شماست.', { exact: true })).toBeVisible()
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) { await admin.setViewportSize({ width, height: 1100 }); await admin.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme); await axe(admin, '[aria-labelledby="order-work-title"]'); await admin.locator('[aria-labelledby="order-work-title"]').screenshot({ path: info.outputPath(`order-specialist-${theme}-${width}.png`) }); expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true) }
    expect((await expert.request.get('/api/admin/store/orders/' + f.order)).status()).toBe(404)
    await expertPage.goto('/admin/forms?form=' + f.form + '&tab=inbox')
    await expertPage.locator('.dk-card').first().click()
    await expertPage.getByRole('button', { name: 'من انجام می‌دهم', exact: true }).click()
    await expect(expertPage.locator('.dk-card').first()).toContainText('در دست شما')
    await otherPage.goto('/admin/forms?form=' + f.form + '&tab=inbox')
    await expect(otherPage.locator('.dk-card')).toHaveCount(0)
    expect((await other.request.patch('/api/admin/forms/submissions', { headers: { Origin: baseURL! }, data: { id: f.submission, work: { reply: 'نباید ثبت شود' } } })).status()).toBe(403)
    await expertPage.locator('.dk-detail').screenshot({ path: info.outputPath('form-specialist.png'), timeout: 20000 })
    expect(errors).toEqual([])
  } finally {
    if (styleId) {
      const response = await writer.request.get('/api/admin/journal/settings'), current = await response.json()
      const cleaned = await writer.request.post('/api/admin/journal/settings', { headers: { Origin: baseURL!, 'if-match': current.settingsRevision }, data: { postStyle: { ...current.settings.postStyle, custom: current.settings.postStyle.custom.filter((style: any) => style.id !== styleId) } } })
      expect(cleaned.status()).toBe(200)
    }
    for (const context of contexts.reverse()) await context.close()
  }
})
