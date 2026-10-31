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
    const rail = page.locator('.mb-nav-rail').first(), entries = rail.locator('.mb-nav-entry[data-nav-item]')
    await expect(rail).toBeVisible()
    expect(await entries.count()).toBeGreaterThan(3)
    const nested = rail.locator('[data-navigation-branch] .mb-nav-entry').first()
    await expect(nested).toBeVisible()
    for (const entry of [entries.first(), entries.nth(1), nested, entries.last()]) {
      await entry.hover()
      const aligned = () => rail.evaluate((element) => {
        const hovered = element.querySelector<HTMLElement>('.mb-nav-entry:hover, .mb-nav-entry:focus'), glider = element.querySelector<HTMLElement>('.mb-nav-glider[data-on]')
        if (!hovered || !glider) return false
        const a = hovered.getBoundingClientRect(), b = glider.getBoundingClientRect()
        return Math.abs(a.left - b.left) < 2 && Math.abs(a.width - b.width) < 2
      })
      await expect.poll(aligned).toBe(true)
    }
    await nested.focus()
    await expect.poll(() => rail.evaluate(element => {
      const a = element.querySelector<HTMLElement>('.mb-nav-entry:focus')?.getBoundingClientRect(), b = element.querySelector<HTMLElement>('.mb-nav-glider[data-on]')?.getBoundingClientRect()
      return !!a && !!b && Math.abs(a.left - b.left) < 2
    })).toBe(true)
    await nested.hover()
    await page.screenshot({ path: info.outputPath(`header-${theme}-${width}.png`), fullPage: false })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  expect(errors).toEqual([])
})
