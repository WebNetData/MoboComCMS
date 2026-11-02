import fs from 'node:fs'
import { test, expect, type Page, type BrowserContext } from '@playwright/test'

test.skip(!process.env.E2E_PROMPT_FIXTURE, 'requires the explicitly owned Prompt fixture')

test('one member account synchronizes Prompt workspace, library, favorites and collections without sharing private history', async ({ browser, baseURL }, info) => {
  test.setTimeout(300_000)
  expect(baseURL).toBe('http://localhost:3230')
  const fixture = JSON.parse(fs.readFileSync(process.env.E2E_PROMPT_FIXTURE!, 'utf8'))
  expect(fixture.db).toBe('mobocom_prompt_master_test_20261101')
  const contexts: BrowserContext[] = [], errors: string[] = [], headers = { Origin: baseURL! }
  const stamp = 'owned-member-prompt-' + Date.now(), idea = 'ایدهٔ خصوصی برای کتابخانهٔ شخصی ' + stamp
  let templateId = 0, collectionId = 0, generationId = 0, owner: Page | undefined, member: Page | undefined
  async function pageFor(key?: string) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' }); contexts.push(context)
    await context.addCookies([{ name: 'theme', value: 'light', url: baseURL! }])
    const page = await context.newPage(); page.setDefaultTimeout(25_000)
    page.on('pageerror', error => errors.push(error.message))
    if (key) {
      await page.goto('/login'); await page.getByRole('button', { name: 'رمز عبور', exact: true }).click()
      await page.locator('#login-email').fill(fixture.users[key].email); await page.locator('#login-password').fill(fixture.password)
      await page.locator('form.auth-form button.btn-primary').first().click(); await page.waitForURL(url => !url.pathname.startsWith('/login'))
      await expect.poll(async () => { const response = await page.request.get('/api/me', { maxRetries: 2 }); return response.ok() ? (await response.json()).id : 0 }).toBe(fixture.users[key].id)
    }
    return page
  }
  async function capture(page: Page, name: string, selector: string) {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.evaluate(source => { const script = document.createElement('script'); script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || ''; script.textContent = source; document.head.append(script) }, fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'))
    expect(await page.locator(selector).evaluate(async node => (await (window as any).axe.run(node, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations)).toEqual([])
    await page.locator(selector).screenshot({ path: info.outputPath(name + '.png') })
  }
  try {
    owner = await pageFor('owner'); member = await pageFor('member')
    const other = await pageFor('other'), guest = await pageFor()
    const created = await owner.request.post('/api/admin/prompts', { headers, data: { action: 'save', title: 'الگوی منتخب کتابخانه ' + stamp, slug: stamp, kind: 'TEXT', category: 'WRITING', content: 'Create an exact response for {{idea}}', status: 'PUBLISHED' } })
    expect(created.status(), await created.text()).toBe(200); templateId = (await created.json()).template.id
    const madeCollection = await member.request.post('/api/collections', { headers, data: { title: 'کالکشن شخصی ' + stamp, visibility: 'PRIVATE' } })
    expect(madeCollection.ok()).toBe(true); collectionId = (await madeCollection.json()).id
    const library = await member.context().newPage(); library.on('pageerror', error => errors.push(error.message))
    await library.goto('/dashboard/library'); await expect(library.getByRole('heading', { name: 'پرامپت مستر من', exact: true })).toBeVisible()
    await member.goto('/prompts'); await member.getByLabel('ایده یا درخواستت را بنویس', { exact: false }).fill(idea)
    const generated = member.waitForResponse(response => response.url().endsWith('/api/prompts/generate') && response.request().method() === 'POST')
    await member.getByRole('button', { name: 'ساخت پرامپت', exact: true }).click()
    const result = await generated; expect(result.ok()).toBe(true); generationId = (await result.json()).item.id
    await expect(library.getByRole('link', { name: new RegExp(idea) })).toBeVisible()
    await member.goto('/dashboard/prompts'); await expect(member.getByRole('heading', { name: 'فضای پرامپت من', exact: true })).toBeVisible()
    const historyCard = member.locator('article').filter({ has: member.getByRole('heading', { name: idea, exact: true }) })
    await historyCard.getByRole('button', { name: 'نگه‌داری', exact: true }).click(); await expect(historyCard.getByRole('button', { name: 'آزادکردن', exact: true })).toBeVisible()
    await member.getByRole('link', { name: /نگه‌داری‌شده‌ها/ }).click(); await expect(member.getByRole('combobox').first()).toHaveValue('true')
    await expect(historyCard).toBeVisible()
    await member.goto('/prompts/templates/' + stamp)
    await member.getByRole('button', { name: 'ذخیرهٔ الگو در علاقه‌مندی‌ها', exact: true }).click(); await expect(member.getByRole('button', { name: 'الگوی ذخیره‌شده', exact: true })).toBeVisible()
    const favoriteTotal = (await member.request.get('/api/my/overview').then(response => response.json())).prompts.favorites.total
    await expect(library.getByRole('link', { name: /الگوهای محبوب/ }).locator('b')).toHaveText(favoriteTotal.toLocaleString('fa-IR'))
    await member.getByRole('button', { name: 'فهرست‌های من', exact: true }).click()
    const dialog = member.getByRole('dialog', { name: 'ذخیره در فهرست‌های من' })
    await dialog.getByRole('button', { name: new RegExp('کالکشن شخصی ' + stamp) }).click()
    await expect(dialog.getByRole('button', { name: new RegExp('کالکشن شخصی ' + stamp) })).toHaveAttribute('aria-pressed', 'true')
    await dialog.getByRole('button', { name: 'بستن فهرست‌ها' }).click()
    await member.goto('/favorites?type=prompt'); await expect(member.getByRole('heading', { name: 'الگوی منتخب کتابخانه ' + stamp, exact: true })).toBeVisible()
    await member.goto('/collections/' + collectionId); await expect(member.getByRole('link', { name: new RegExp('الگوی منتخب کتابخانه ' + stamp) })).toBeVisible()
    expect((await other.request.get('/api/prompts/history?id=' + generationId, { maxRetries: 2 })).status()).toBe(404)
    expect((await other.request.get('/collections/' + collectionId, { maxRetries: 2 })).status()).toBe(404)
    expect((await guest.request.get('/api/my/overview')).status()).toBe(401)
    expect((await other.request.get('/api/my/overview?userId=' + fixture.users.member.id)).ok()).toBe(true)
    await other.goto('/dashboard/prompts'); await expect(other.getByRole('heading', { name: idea, exact: true })).toHaveCount(0)
    await owner.goto('/admin'); await expect(owner.getByRole('region', { name: 'پیشخوان پرامپت مستر' })).toBeVisible()
    const manager = await pageFor('manager'); await manager.goto('/admin'); await expect(manager.getByRole('region', { name: 'پیشخوان پرامپت مستر' })).toBeVisible()
    expect((await owner.request.post('/api/admin/section-managers', { headers, data: { userId: fixture.users.author.id, sections: ['prompts'], as: 'author' } })).status()).toBe(200)
    const author = await pageFor('author'); await author.goto('/admin'); await expect(author.getByRole('region', { name: 'پیشخوان پرامپت مستر' }).getByRole('link', { name: 'الگوهای من', exact: true })).toBeVisible()
    const magazine = await pageFor('magazine'); await magazine.goto('/admin'); await expect(magazine.getByRole('region', { name: 'پیشخوان پرامپت مستر' })).toHaveCount(0)
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      await member.context().addCookies([{ name: 'theme', value: theme, url: baseURL! }]); await member.setViewportSize({ width, height: 1050 })
      for (const [route, name] of [['/dashboard', 'home'], ['/dashboard/library', 'library'], ['/dashboard/prompts', 'workspace']] as const) {
        await member.goto(route); await expect(member.getByRole('heading', { name: 'پرامپت مستر من', exact: true })).toBeVisible()
        await capture(member, `${name}-${theme}-${width}`, '[aria-label="پرامپت مستر من"]')
        if (name === 'workspace') await capture(member, `history-${theme}-${width}`, '[aria-label="تاریخچهٔ خصوصی پرامپت‌ها"]')
      }
    }
    await member.setViewportSize({ width: 1440, height: 1050 }); await member.goto('/dashboard/prompts')
    const removeCard = member.locator('article').filter({ has: member.getByRole('heading', { name: idea, exact: true }) })
    await removeCard.getByRole('button', { name: 'حذف', exact: true }).click(); await removeCard.getByRole('alert').getByRole('button', { name: 'حذف قطعی', exact: true }).click()
    await expect(removeCard).toHaveCount(0); await expect(library.getByRole('link', { name: new RegExp(idea) })).toHaveCount(0)
    generationId = 0
    expect((await owner.request.post('/api/admin/sections', { headers, data: { id: 'prompt-master', enabled: false } })).status()).toBe(200)
    expect((await member.request.get('/api/my/overview').then(response => response.json())).prompts).toBeNull()
    // Next can stream the account shell with HTTP200 before notFound; assert the actual unavailable UI and no private content.
    await member.goto('/dashboard/prompts')
    await expect(member.getByRole('heading', { name: 'فضای پرامپت من', exact: true })).toHaveCount(0)
    expect((await member.request.get('/api/prompts/history')).status()).toBe(404)
    await member.goto('/dashboard/library'); await expect(member.getByRole('heading', { name: 'پرامپت مستر من', exact: true })).toHaveCount(0)
    expect((await owner.request.post('/api/admin/sections', { headers, data: { id: 'prompt-master', enabled: true } })).status()).toBe(200)
    await member.goto('/favorites?type=prompt'); await expect(member.getByRole('heading', { name: 'الگوی منتخب کتابخانه ' + stamp, exact: true })).toBeVisible()
    await member.locator('.fv-card').filter({ has: member.getByRole('heading', { name: 'الگوی منتخب کتابخانه ' + stamp, exact: true }) }).getByRole('button', { name: /^در علاقه‌مندی‌ها/ }).click()
    await expect(member.getByRole('heading', { name: 'الگوی منتخب کتابخانه ' + stamp, exact: true })).toHaveCount(0)
    await expect(library.getByRole('link', { name: /الگوهای محبوب/ }).locator('b')).toHaveText((favoriteTotal - 1).toLocaleString('fa-IR'))
    expect(errors).toEqual([])
  } finally {
    if (owner) {
      await owner.request.post('/api/admin/sections', { headers, data: { id: 'prompt-master', enabled: true } })
      if (templateId) { const response = await owner.request.get('/api/admin/prompts?id=' + templateId); const body = await response.json().catch(() => null); if (body?.template) await owner.request.post('/api/admin/prompts', { headers, data: { action: 'delete', id: templateId, version: body.template.version } }) }
    }
    if (member) {
      if (generationId) { const response = await member.request.get('/api/prompts/history?id=' + generationId); const body = await response.json().catch(() => null); if (body?.item) await member.request.post('/api/prompts/history', { headers, data: { action: 'delete', id: generationId, version: body.item.version } }) }
      if (collectionId) await member.request.delete('/api/collections/' + collectionId, { headers })
      if (templateId) await member.request.post('/api/engage/favorite', { headers, data: { item: 'prompt:' + templateId, on: false } })
    }
    for (const context of contexts) await context.close()
  }
})
