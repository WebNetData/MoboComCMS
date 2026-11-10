import { test, expect } from '@playwright/test'

test.skip(!process.env.E2E_HEADER_MENU_FIXTURE, 'requires an existing MoboCom header with configured menus')

test('nested header entries keep the hover and keyboard highlight on their own link', async ({ page, context, baseURL }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['light', 'dark']) for (const width of [1440, 1920]) {
    await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }, { name: 'mc-translate-dismissed', value: '1', url: baseURL! }])
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/')
    const rail = page.locator('.mb-nav-rail').first(), entries = rail.locator('.mb-nav-entry')
    await expect(rail).toBeVisible()
    expect(await entries.count()).toBeGreaterThan(3)
    const nested = rail.locator('[data-navigation-branch] .mb-nav-entry').first()
    await expect(nested).toBeVisible()
    // The highlight is the link's own surface (no separate layer that could drift): the hovered link, and only it, is lit.
    for (const entry of [entries.first(), entries.nth(1), nested, entries.last()]) {
      await entry.hover()
      const ownHighlight = () => rail.evaluate((element) => {
        const hovered = element.querySelector<HTMLElement>('.mb-nav-entry:hover')
        if (!hovered) return false
        const lit = [...element.querySelectorAll<HTMLElement>('.mb-nav-entry')].filter(link => !/^rgba\(0, 0, 0, 0\)$|transparent/.test(getComputedStyle(link).backgroundColor))
        return lit.length === 1 && lit[0] === hovered
      })
      await expect.poll(ownHighlight).toBe(true)
    }
    await page.mouse.move(2, 600)
    await nested.focus()
    await expect.poll(() => nested.evaluate(link => link.matches(':focus-visible') ? getComputedStyle(link).outlineStyle : 'none')).toBe('solid')
    await nested.hover()
    await page.screenshot({ path: info.outputPath(`header-${theme}-${width}.png`), fullPage: false })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  expect(errors).toEqual([])
})
