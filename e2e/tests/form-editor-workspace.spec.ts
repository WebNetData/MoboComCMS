import fs from 'node:fs'
import { test, expect } from '@playwright/test'

test.skip(!process.env.E2E_BLOCK_PROPOSALS_FIXTURE, 'owned local editor fixture required')
test.use({ actionTimeout: 20_000 })

test('classic form editor keeps a compact toolbar, overflow tools and visual/source content', async ({ browser, baseURL }, info) => {
  test.skip(process.env.E2E_FORM_ENGINE === 'rich', 'lightweight fallback scenario')
  test.setTimeout(180_000)
  const fixture = JSON.parse(fs.readFileSync(process.env.E2E_BLOCK_PROPOSALS_FIXTURE!, 'utf8'))
  expect(new URL(baseURL!).hostname).toBe('localhost')
  expect(fixture.legacyId).toBeGreaterThan(0)
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
    try {
      await ctx.addCookies([{ name: 'next-auth.session-token', value: fixture.tokens.manager, url: baseURL! }, { name: 'theme', value: theme, url: baseURL! }])
      const page = await ctx.newPage(), errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`/admin/posts?edit=${fixture.legacyId}`)
      const root = page.locator('.ce').first()
      await expect(root).toBeVisible({ timeout: 90_000 })
      const body = root.frameLocator('iframe').locator('body')
      await expect(body).toContainText('متن آزمایشی')
      if (theme === 'dark') await expect(root).toHaveClass(/is-dark/)
      await root.scrollIntoViewIfNeeded()
      const toolbar = root.locator('.tox-toolbar__primary')
      expect((await toolbar.boundingBox())!.height).toBeLessThan(65)
      const more = root.getByRole('button', { name: /موارد اضافی نوار ابزار|additional toolbar/ })
      await expect(more).toBeVisible()
      await more.click()
      await expect(root.locator('.tox-toolbar__overflow')).toBeVisible()
      await root.screenshot({ path: info.outputPath(`classic-overflow-${theme}-${width}.png`), animations: 'disabled' })
      await more.click()
      await root.screenshot({ path: info.outputPath(`classic-${theme}-${width}.png`), animations: 'disabled' })
      await body.fill('نوشتن در ویرایشگر مرتب با متن فارسی و English')
      await root.getByRole('tab', { name: 'متن', exact: true }).click()
      await expect(root.locator('.ce-source')).toHaveValue(/نوشتن در ویرایشگر/)
      await root.locator('.ce-source').fill('<p>بازگشت متن از نمای کد به دیداری</p>')
      await root.getByRole('tab', { name: 'دیداری', exact: true }).click()
      await expect(root.frameLocator('iframe').locator('body')).toContainText('بازگشت متن از نمای کد به دیداری')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      if (process.env.E2E_AXE_PATH) {
        await page.evaluate(source => {
          const script = document.createElement('script')
          script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || ''
          script.textContent = source; document.head.append(script)
        }, fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
        const violations = await page.evaluate(async () => (await (window as any).axe.run('.ce', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations)
        expect(violations).toEqual([])
      }
      expect(errors).toEqual([])
    } finally { await ctx.close() }
  }
})

test('lightweight form editor remains usable when the classic plugin is off', async ({ browser, baseURL }, info) => {
  test.skip(process.env.E2E_FORM_ENGINE !== 'rich', 'requires the explicitly prepared plugin-off fixture')
  test.setTimeout(180_000)
  const fixture = JSON.parse(fs.readFileSync(process.env.E2E_BLOCK_PROPOSALS_FIXTURE!, 'utf8'))
  expect(new URL(baseURL!).hostname).toBe('localhost')
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
    try {
      await ctx.addCookies([{ name: 'next-auth.session-token', value: fixture.tokens.manager, url: baseURL! }, { name: 'theme', value: theme, url: baseURL! }])
      const page = await ctx.newPage(), errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`/admin/posts?edit=${fixture.legacyId}`)
      const root = page.locator('.rich-editor').first(), body = root.locator('[contenteditable=true]')
      await expect(body).toBeVisible({ timeout: 90_000 })
      await root.screenshot({ path: info.outputPath(`fallback-${theme}-${width}.png`), animations: 'disabled' })
      await body.fill('متن فارسی و English در ویرایشگر جایگزین')
      await expect(body).toContainText('متن فارسی و English')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      if (process.env.E2E_AXE_PATH) {
        await page.evaluate(source => { const script = document.createElement('script'); script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || ''; script.textContent = source; document.head.append(script) }, fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
        const violations = await page.evaluate(async () => (await (window as any).axe.run('.rich-editor', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations)
        expect(violations).toEqual([])
      }
      expect(errors).toEqual([])
    } finally { await ctx.close() }
  }
})
