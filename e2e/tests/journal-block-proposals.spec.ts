import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

// An explicitly prepared local fixture owns its users/article and restores the
// existing Journal/editor switches. Never take an owner's account or article.
test.skip(!process.env.E2E_BLOCK_PROPOSALS_FIXTURE, 'owned local block-proposal fixture required')

async function axe(page: Page) {
  if (!process.env.E2E_AXE_PATH) return
  await page.evaluate(source => {
    const script = document.createElement('script')
    script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || ''
    script.textContent = source; document.head.append(script)
  }, fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
  const violations = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations)
  expect(violations).toEqual([])
}

test('published author proposes blocks; manager compares/applies; stale work stays; workspace themes', async ({ browser, baseURL }, info) => {
  test.setTimeout(300_000)
  expect(new URL(baseURL!).hostname).toBe('localhost')
  const fixture = JSON.parse(fs.readFileSync(process.env.E2E_BLOCK_PROPOSALS_FIXTURE!, 'utf8'))
  const editor = `/admin/editor/posts/${fixture.postId}`
  const marker = Date.now().toString(36)
  const proposed = `متن پیشنهادی نویسنده برای بررسی سردبیر ${marker}`
  const errors: string[] = []
  const context = async (who: 'author' | 'manager', theme = 'dark', width = 1440) => {
    const ctx = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, reducedMotion: 'reduce', extraHTTPHeaders: { origin: baseURL! } })
    await ctx.addCookies([{ name: 'next-auth.session-token', value: fixture.tokens[who], url: baseURL! }, { name: 'theme', value: theme, url: baseURL! }])
    return ctx
  }
  const author = await context('author'), manager = await context('manager')
  try {
    const page = await author.newPage(), desk = await manager.newPage()
    for (const view of [page, desk]) view.on('pageerror', error => errors.push(error.message))
    await page.goto(editor)
    await expect(page.locator('.mc-heading-input')).toBeVisible({ timeout: 120_000 })
    await expect(page.getByRole('button', { name: 'ارسال پیشنهاد متن', exact: true })).toBeVisible()
    const before = await (await manager.request.get(`/api/admin/editor/posts/${fixture.postId}`)).json()
    await page.locator('.mc-heading-input').fill(proposed)
    // Longer than the live editor's 4-second autosave: proposal remains explicit.
    await page.waitForTimeout(4500)
    const unchanged = await (await manager.request.get(`/api/admin/editor/posts/${fixture.postId}`)).json()
    expect(unchanged.document).toEqual(before.document)
    const [submitted] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith(`/api/admin/editor/posts/${fixture.postId}`) && r.request().method() === 'PUT'),
      page.getByRole('button', { name: 'ارسال پیشنهاد متن', exact: true }).click(),
    ])
    expect(submitted.status()).toBe(200)
    await expect(page.locator('.mc-editor-state')).toHaveText('پیشنهاد ارسال شد')
    expect((await (await manager.request.get(`/api/admin/editor/posts/${fixture.postId}`)).json()).document).toEqual(before.document)
    expect((await author.request.patch('/api/admin/cms?type=posts', { data: { id: fixture.postId, excerpt: `خلاصهٔ پیشنهادی همراه متن بلوکی ${marker}` } })).status()).toBe(200)
    await page.reload()
    await expect(page.locator('.mc-heading-input')).toHaveValue(proposed)
    expect((await author.request.get(`/api/admin/editor/posts/${fixture.postId}?proposal=1`)).status()).toBe(403)
    expect((await author.request.patch('/api/admin/cms?type=posts', { data: { id: fixture.postId, proposalDecision: 'apply' } })).status()).toBe(403)

    await desk.goto(editor + '?proposal=1')
    await expect(desk.locator('.mc-proposal-columns')).toBeVisible({ timeout: 120_000 })
    await expect(desk.locator('.mc-proposal-columns > section').nth(1)).toContainText(proposed)
    await expect(desk.locator('.mc-proposal-columns > section').nth(0)).not.toContainText(proposed)
    await expect(desk.locator('[contenteditable=true]')).toHaveCount(0)
    await axe(desk)
    await desk.screenshot({ path: info.outputPath('manager-preview.png'), animations: 'disabled' })
    await desk.goto(`/admin/posts?edit=${fixture.postId}`)
    const apply = desk.getByRole('button', { name: 'اعمال پیشنهاد', exact: true })
    await expect(apply).toBeVisible({ timeout: 120_000 })
    await expect(desk.getByRole('link', { name: 'مقایسهٔ کامل متن فعلی و پیشنهادی' })).toBeVisible()
    desk.once('dialog', dialog => dialog.accept())
    const [applied] = await Promise.all([desk.waitForResponse(r => r.url().includes('/api/admin/cms?type=posts') && r.request().method() === 'PATCH'), apply.click()])
    expect(applied.status()).toBe(200)
    const live = await (await manager.request.get(`/api/admin/editor/posts/${fixture.postId}`)).json()
    expect(live.document.blocks[0].props.text).toBe(proposed)

    // A real manager write between opening and submitting cannot be overwritten.
    await page.reload()
    await expect(page.locator('.mc-heading-input')).toBeVisible()
    await page.locator('.mc-heading-input').fill('کار نویسنده باید در صفحه بماند')
    expect((await manager.request.patch('/api/admin/cms?type=posts', { data: { id: fixture.postId, title: `عنوان تازهٔ سردبیر برای آزمون هم‌زمانی ${marker}` } })).status()).toBe(200)
    const [conflict] = await Promise.all([page.waitForResponse(r => r.url().endsWith(`/api/admin/editor/posts/${fixture.postId}`) && r.request().method() === 'PUT'), page.getByRole('button', { name: 'ارسال پیشنهاد متن', exact: true }).click()])
    expect(conflict.status()).toBe(409)
    await expect(page.locator('.mc-editor-state')).toHaveClass(/is-conflict/)
    await expect(page.locator('.mc-heading-input')).toHaveValue('کار نویسنده باید در صفحه بماند')
    await page.screenshot({ path: info.outputPath('retained-conflict.png'), animations: 'disabled' })

    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      const ctx = await context('author', theme, width)
      try {
        const view = await ctx.newPage()
        view.on('pageerror', error => errors.push(error.message))
        await view.goto(editor)
        await expect(view.locator('.mc-rich-input').first()).toBeVisible({ timeout: 120_000 })
        await view.locator('.mc-rich-input').first().click()
        expect(await view.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
        const settings = view.getByRole('button', { name: 'تنظیمات بلوک', exact: true })
        if (await settings.getAttribute('aria-expanded') === 'false') await settings.click()
        await settings.focus(); await view.keyboard.press('Space')
        await expect(view.locator('.mc-editor-inspector')).toHaveCount(0)
        await view.keyboard.press('Space')
        await expect(view.locator('.mc-editor-inspector')).toBeVisible()
        await view.getByRole('button', { name: 'فهرست بلوک‌ها', exact: true }).click()
        await expect(view.locator('.mc-editor-outline')).toBeVisible()
        await view.getByRole('button', { name: 'فهرست بلوک‌ها', exact: true }).click()
        if (width === 390) await settings.click()
        expect(await view.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await view.evaluate(() => window.scrollTo(0, 0))
        await axe(view)
        await view.screenshot({ path: info.outputPath(`workspace-${theme}-${width}.png`), animations: 'disabled' })
      } finally { await ctx.close() }
    }
    expect(errors).toEqual([])
  } finally { await author.close(); await manager.close() }
})
