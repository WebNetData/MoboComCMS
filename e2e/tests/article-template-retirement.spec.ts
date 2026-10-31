import fs from 'node:fs'
import { test, expect } from '@playwright/test'

test.skip(!process.env.E2E_EDITOR_TEAM_FIXTURE, 'explicit owned local fixture required')
test('legacy article assignments and builder documents never replace the native article', async ({ browser, baseURL }, info) => {
  expect(new URL(baseURL!).hostname).toBe('localhost')
  const f = JSON.parse(fs.readFileSync(process.env.E2E_EDITOR_TEAM_FIXTURE!, 'utf8'))
  const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' })
  try {
    await context.addCookies([{ name: 'next-auth.session-token', value: f.tokens.writer, url: baseURL! }])
    const response = await context.request.get('/api/admin/builder/post-template?postId=' + f.post)
    expect(response.status()).toBe(200)
    const choice = await response.json()
    expect(choice.templateId).toBe('')
    expect(choice.options.every((option: any) => ['style', 'mystyle'].includes(option.group))).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }, { name: 'mc-translate-dismissed', value: '1', url: baseURL! }])
      await page.setViewportSize({ width, height: 1100 })
      await page.goto('/blog/' + f.stamp + '?style=post-pro-guide')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.locator('main.journal-post-solo')).toBeVisible()
      await expect(page.locator('#article-body')).toContainText('متن نوشتهٔ آزمایشی')
      await expect(page.locator('.journal-post-built,.journal-post-builder')).toHaveCount(0)
      await expect(page.getByText('RETIRED_LAYOUT_MUST_NOT_RENDER')).toHaveCount(0)
      await expect(page.locator('h1')).toContainText('آزمون استایل نوشته')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: info.outputPath(`native-article-${theme}-${width}.png`), fullPage: true })
    }
    expect(errors).toEqual([])
  } finally { await context.close() }
})
