import fs from 'node:fs'
import { test, expect, type Page, type BrowserContext } from '@playwright/test'

test.skip(!process.env.E2E_PROMPT_FIXTURE, 'requires an explicitly owned Prompt Master fixture')
test('Prompt authors publish through their section manager; navigation, creator picture and themed workspace stay coherent', async ({ browser, baseURL }, info) => {
  test.setTimeout(300_000); expect(baseURL).toBe('http://localhost:3230')
  const fixture = JSON.parse(fs.readFileSync(process.env.E2E_PROMPT_FIXTURE!, 'utf8')); expect(fixture.db).toBe('mobocom_prompt_master_test_20261101')
  const contexts: BrowserContext[] = [], errors: string[] = [], headers = { Origin: baseURL! }, slug = 'owned-prompt-team-' + Date.now()
  const privateNote = 'Owned private editorial note ' + slug
  let id = 0
  async function pageFor(key?: string) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' }); contexts.push(context)
    await context.addCookies([{ name: 'theme', value: 'light', url: baseURL! }])
    const page = await context.newPage(); page.setDefaultTimeout(20_000); page.setDefaultNavigationTimeout(30_000); page.on('pageerror', e => errors.push(e.message))
    if (key) { await page.goto('/login'); await page.getByRole('button', { name: 'رمز عبور', exact: true }).click(); await page.locator('#login-email').fill(fixture.users[key].email); await page.locator('#login-password').fill(fixture.password); await page.locator('form.auth-form button.btn-primary').first().click(); await page.waitForURL(u => !u.pathname.startsWith('/login')) }
    if (key) await expect.poll(async()=>{const response=await page.request.get('/api/me');return response.ok()?(await response.json()).id:0}, { message:'signed-in fixture identity must be ready' }).toBe(fixture.users[key].id)
    return page
  }
  async function capture(page: Page, name: string, selector: string) {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.evaluate(source => { const s = document.createElement('script'); s.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || ''; s.textContent = source; document.head.append(s) }, fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'))
    expect(await page.locator(selector).evaluate(async node => (await (window as any).axe.run(node, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations)).toEqual([])
    await page.locator(selector).screenshot({ path: info.outputPath(name + '.png') })
  }
  const owner = await pageFor('owner'), manager = await pageFor('manager')
  try {
    const me = await owner.request.get('/api/me'); expect(me.status()).toBe(200); expect((await me.json()).role).toBe('ADMIN')
    for (const key of ['author', 'authorOther']) { const response = await owner.request.post('/api/admin/section-managers', { headers, data: { userId: fixture.users[key].id, sections: ['prompts'], as: 'author' } }); expect(response.status(), await response.text()).toBe(200) }
    const author = await pageFor('author'), other = await pageFor('authorOther'), guest = await pageFor()
    for (const actor of [manager, author]) {
      const start = await actor.request.post('/api/admin/uploads', { headers, data: { op: 'start', name: 'owned-prompt-chunk.bin', size: 16, section: 'general' } }); expect(start.status()).toBe(200)
      const upload = await start.json()
      try {
        expect((await other.request.put('/api/admin/uploads?id=' + upload.id + '&offset=0', { headers, data: Buffer.from('test') })).status()).toBe(403)
        expect((await actor.request.put('/api/admin/uploads?id=' + upload.id + '&offset=0', { headers, data: Buffer.from('test') })).status()).toBe(200)
      } finally { expect((await actor.request.post('/api/admin/uploads', { headers, data: { op: 'cancel', id: upload.id } })).status()).toBe(200) }
    }
    await author.goto('/admin/prompts'); await expect(author.getByRole('heading', { name: 'الگوهای من', exact: true })).toBeVisible()
    await expect(author.getByRole('link', { name: 'دسته‌های کتابخانه', exact: true })).toHaveCount(0)
    await author.getByRole('button', { name: 'الگوی جدید', exact: true }).click()
    await author.getByLabel('عنوان الگو', { exact: true }).fill('پرامپت حرفه‌ای نویسندهٔ آزمایشی'); await author.getByLabel('نشانی انگلیسی', { exact: false }).fill(slug)
    await author.getByLabel('ایدهٔ نمونه', { exact: true }).fill('An exact original prompt for a warm editorial portrait')
    await author.getByLabel('نشانی تصویر نمونه یا پوستر', { exact: true }).fill('/images/prompts/character.webp')
    await expect(author.getByLabel('وضعیت انتشار', { exact: false })).toBeVisible()
    await expect(author.getByLabel('وضعیت انتشار', { exact: false }).locator('option[value="PUBLISHED"]')).toHaveCount(0)
    await author.getByLabel('وضعیت انتشار', { exact: false }).selectOption('PENDING')
    const savedResponse = author.waitForResponse(r => r.url().endsWith('/api/admin/prompts') && r.request().method() === 'POST')
    await author.getByRole('button', { name: 'ذخیره و ارسال برای بازبینی', exact: true }).click(); const saved = await savedResponse; expect(saved.status()).toBe(200)
    const entry = (await saved.json()).template; id = entry.id; expect(entry.createdById).toBe(fixture.users.author.id)
    expect((await other.request.get('/api/admin/prompts?id=' + id)).status()).toBe(404)
    expect((await author.request.post('/api/admin/prompts', { headers, data: { ...entry, action: 'save', status: 'PUBLISHED' } })).status()).toBe(403)
    expect((await author.request.post('/api/admin/section-managers', { headers, data: { userId: fixture.users.authorOther.id, sections: ['prompts'] } })).status()).toBe(403)
    expect((await guest.request.get('/prompts/templates/' + slug)).status()).toBe(404)
    await manager.goto('/admin/prompts?status=PENDING'); const row = manager.getByRole('row').filter({ hasText: 'پرامپت حرفه‌ای نویسندهٔ آزمایشی' })
    await row.getByRole('button', { name: 'بازبینی و تصمیم', exact: true }).click(); await manager.getByLabel('وضعیت انتشار', { exact: false }).selectOption('PUBLISHED')
    await manager.getByLabel('یادداشت بازبینی', { exact: false }).fill(privateNote)
    const publish = manager.waitForResponse(r => r.url().endsWith('/api/admin/prompts') && r.request().method() === 'POST')
    await manager.getByRole('button', { name: 'ذخیره و انتشار', exact: true }).click(); expect((await publish).status()).toBe(200)
    expect(await (await guest.request.get('/prompts?template=' + slug)).text()).not.toContain(privateNote)
    expect(await (await guest.request.get('/prompts/templates/' + slug)).text()).not.toContain(privateNote)
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      await manager.context().addCookies([{ name: 'theme', value: theme, url: baseURL! }]); await manager.setViewportSize({ width, height: 1050 }); await manager.goto('/admin/prompts')
      await expect(manager.getByRole('row').filter({ hasText: 'پرامپت حرفه‌ای نویسندهٔ آزمایشی' })).toBeVisible(); await capture(manager, `manager-${theme}-${width}`, '[data-testid="prompt-admin"]')
      await manager.getByRole('row').filter({ hasText: 'پرامپت حرفه‌ای نویسندهٔ آزمایشی' }).getByRole('button', { name: 'ویرایش', exact: true }).click(); await capture(manager, `editor-${theme}-${width}`, '[aria-labelledby="prompt-template-editor"]')
      await guest.context().addCookies([{ name: 'theme', value: theme, url: baseURL! }]); await guest.setViewportSize({ width, height: 1050 }); await guest.goto('/prompts/templates/' + slug)
      const by = guest.getByRole('link', { name: 'پرامپت‌های نویسندهٔ آزمایشی پرامپت', exact: true }); await expect(by.locator('img')).toHaveAttribute('src', '/images/prompts/character.webp')
      await capture(guest, `creator-${theme}-${width}`, '[data-testid="prompt-detail"]')
    }
    await guest.getByRole('link', { name: 'پرامپت‌های نویسندهٔ آزمایشی پرامپت', exact: true }).click(); await expect(guest.locator('main article')).toHaveCount(1)
    await guest.setViewportSize({ width: 1440, height: 1050 }); await guest.goto('/prompts/library?category=WRITING&q=owned')
    const nav = guest.getByRole('navigation', { name: 'منوی پرامپت مستر', exact: true }); await expect(nav.locator('a.mm-bar-link.is-active')).toHaveCount(1)
    await expect(nav.getByRole('link', { name: 'نوشتن و یادگیری', exact: true })).toHaveAttribute('aria-current', 'page')
    await nav.getByRole('link', { name: 'بازاریابی و کسب‌وکار', exact: true }).click(); await expect(nav.locator('a.mm-bar-link.is-active')).toHaveCount(1); await expect(nav.getByRole('link', { name: 'نوشتن و یادگیری', exact: true })).not.toHaveAttribute('aria-current', 'page')
    await author.goto('/admin/prompts'); await expect(author.getByRole('row').filter({ hasText: 'پرامپت حرفه‌ای نویسندهٔ آزمایشی' }).getByRole('button', { name: 'ویرایش', exact: true })).toHaveCount(0)
    await author.getByRole('row').filter({ hasText: 'پرامپت حرفه‌ای نویسندهٔ آزمایشی' }).getByRole('button', { name: 'درخواست حذف', exact: true }).click(); await author.getByRole('button', { name: 'ارسال به سطل زباله', exact: true }).click(); await expect(author.getByRole('status').filter({ hasText: 'درخواست حذف ثبت شد' })).toBeVisible()
    expect((await guest.request.get('/prompts/templates/' + slug)).status()).toBe(404)
    await manager.goto('/admin/prompts?status=TRASHED'); await manager.getByRole('row').filter({ hasText: 'پرامپت حرفه‌ای نویسندهٔ آزمایشی' }).getByRole('button', { name: 'بازگردانی', exact: true }).click(); await expect(manager.getByRole('status').filter({ hasText: 'الگو به وضعیت قبلی بازگشت' })).toBeVisible()
    expect((await guest.request.get('/prompts/templates/' + slug)).status()).toBe(200)
    await owner.goto('/admin/sections/prompt-master'); const reviewSwitch = owner.getByLabel('الگوهای نویسندگان پیش از انتشار بازبینی شوند', { exact: true }); await expect(reviewSwitch).toBeChecked()
    await reviewSwitch.uncheck(); await owner.getByRole('button', { name: /ذخیره/ }).last().click()
    await expect.poll(async()=> (await (await owner.request.get('/api/admin/sections?id=prompt-master')).json()).section.settings['review-authors']).toBe(false)
    const restored = (await (await author.request.get('/api/admin/prompts?id='+id)).json()).template
    const selfSave = await author.request.post('/api/admin/prompts', { headers, data: { ...restored, action:'save', status:'PUBLISHED' } }); expect(selfSave.status()).toBe(200)
    await reviewSwitch.check(); await owner.getByRole('button', { name: /ذخیره/ }).last().click()
    await expect.poll(async()=> (await (await owner.request.get('/api/admin/sections?id=prompt-master')).json()).section.settings['review-authors']).toBe(true)
    expect((await author.request.post('/api/admin/prompts', { headers, data: { ...(await selfSave.json()).template, action:'save', status:'PUBLISHED' } })).status()).toBe(403)
    expect(errors).toEqual([])
  } finally {
    await owner.request.post('/api/admin/sections', { headers, timeout:10_000, data:{id:'prompt-master',settings:{'review-authors':true}} }).catch(()=>{})
    if (id) { const found = await manager.request.get('/api/admin/prompts?id=' + id); if (found.ok()) { const entry = (await found.json()).template; expect((await manager.request.post('/api/admin/prompts', { headers, data: { action: 'delete', id, version: entry.version } })).status()).toBe(200) } }
    for (const key of ['author', 'authorOther']) await owner.request.post('/api/admin/section-managers', { headers, data: { userId: fixture.users[key].id, sections: [], as: 'author' } })
    await Promise.all(contexts.map(context => context.close()))
  }
})
