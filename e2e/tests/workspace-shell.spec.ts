import fs from 'node:fs'
import type { Browser, Page } from '@playwright/test'
import { test, expect, hasAdmin, watchErrors } from '../helpers'
import { ADMIN_STATE } from '../paths'

// The shell of the admin and of the account dashboard: the grouped menu, the top bar and the phone drawer,
// in both themes and on a phone. Real pages, the administrator's real session.

const MODES = [['light', 1440], ['dark', 1440], ['light', 390]] as const

async function open(browser: Browser, baseURL: string, theme: string, width: number) {
  const context = await browser.newContext({ baseURL, storageState: ADMIN_STATE, ignoreHTTPSErrors: true, viewport: { width, height: 900 } })
  await context.addCookies([{ name: 'theme', value: theme, url: baseURL }])
  const page = await context.newPage()
  return { context, page, errors: watchErrors(page) }
}

async function accessible(page: Page, selectors: string[], label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} fits the viewport`).toBe(true)
  if (!process.env.E2E_AXE_PATH) return
  await page.evaluate(fs.readFileSync(process.env.E2E_AXE_PATH, 'utf8'))
  const violations = await page.evaluate(async (include) => {
    const axe = (window as unknown as { axe: { run: (context: object, options: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe
    const found = await axe.run({ include: include.filter((selector) => document.querySelector(selector)).map((selector) => [selector]) }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
    return found.violations.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | ')}`)
  }, selectors)
  expect(violations, `${label} accessibility`).toEqual([])
}

test('the admin menu is grouped, searchable and usable from the keyboard and on a phone', async ({ browser, baseURL }) => {
  test.skip(!hasAdmin(), 'administrator session required')
  test.setTimeout(300_000)
  for (const [theme, width] of MODES) {
    const { context, page, errors } = await open(browser, baseURL!, theme, width)
    const label = `admin ${theme}/${width}`
    await page.goto('/admin/tickets', { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await expect(page.locator('.app-shell.admin-shell')).toBeVisible({ timeout: 60_000 })
    expect(await page.evaluate(() => document.documentElement.dataset.theme), label).toBe(theme)
    const phone = width < 900
    if (phone) {
      const button = page.locator('.mobile-bar .icon-btn')
      await expect(page.locator('#admin-mobile-navigation')).toBeHidden()
      await button.click()
      await expect(page.locator('#admin-mobile-navigation')).toBeVisible()
      await accessible(page, ['.mobile-bar', '#admin-mobile-navigation'], `${label} drawer`)
      await page.keyboard.press('Escape')
      await expect(page.locator('#admin-mobile-navigation')).toBeHidden()
      await expect(button).toBeFocused()
      await button.click()
    }
    const menu = page.locator(phone ? '#admin-mobile-navigation' : 'aside.side nav.side-nav')
    // The page in view: its link is marked, its group is open, and the others are closed.
    const here = menu.locator('a[href="/admin/tickets"]')
    await expect(here).toBeVisible()
    await expect(here).toHaveAttribute('aria-current', 'page')
    // …and it is in sight: the long menu scrolls itself to the page being viewed.
    await expect(here).toBeInViewport()
    const group =menu.locator('.ws-group', { has: page.locator('a[href="/admin/tickets"]') })
    await expect(group.locator('.ws-toggle')).toHaveAttribute('aria-expanded', 'true')
    // One area at a time: its own groups are listed, another area's are not in the page.
    const rail = page.locator(phone ? '#admin-mobile-navigation .acn-rail' : 'aside.side .acn-rail')
    const area = (name: string) => rail.locator('.acn-tab', { hasText: name })
    await expect(area('کاربران')).toHaveAttribute('aria-pressed', 'true')
    await expect(menu.locator('a[href="/admin/settings"]')).toHaveCount(0)
    // A press shows another area and stays on the page; the area of the open page keeps a mark.
    await area('سیستم').focus()
    await page.keyboard.press('Enter')
    await expect(area('سیستم')).toHaveAttribute('aria-pressed', 'true')
    await expect(area('کاربران')).toHaveClass(/has-page/)
    await expect(page).toHaveURL(/\/admin\/tickets$/)
    // A group opens and closes from the keyboard, and says so.
    const settings = menu.locator('.ws-toggle', { hasText: 'تنظیمات و نگهداری' })
    await settings.focus()
    await page.keyboard.press('Enter')
    await expect(settings).toHaveAttribute('aria-expanded', 'true')
    await expect(menu.locator('a[href="/admin/settings"]')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(settings).toHaveAttribute('aria-expanded', 'false')
    await expect(menu.locator('a[href="/admin/settings"]')).toBeHidden()
    await area('کاربران').click()
    // The finder reaches every area: it narrows the menu to what matches and opens it; nothing matching says so.
    const finder = menu.locator('.admin-nav-search input')
    if (!phone) {
      await page.locator('main.app-main').click({ position: { x: 5, y: 5 } })
      await page.keyboard.press('/')
      await expect(finder).toBeFocused()
    }
    await finder.fill('درگاه')
    await expect(menu.locator('a[href="/admin/gateways"]')).toBeVisible()
    await expect(menu.locator('a[href="/admin/tickets"]')).toHaveCount(0)
    await finder.fill('zzzz-nothing')
    await expect(menu.locator('.ws-empty')).toBeVisible()
    await finder.fill('')
    if (!phone) {
      // The top bar names where this page sits.
      await expect(page.locator('.dash-top .dash-crumbs b[aria-current="page"]')).toHaveText('تیکت‌ها')
      await expect(page.locator('.dash-top .dash-crumb-group')).toHaveText(['کاربران', 'پشتیبانی'])
      // The side column fits the screen: the menu scrolls inside it, the signed-in row stays in view.
      const side = await page.locator('aside.side').boundingBox()
      expect(Math.round(side!.height), label).toBe(900)
      await expect(page.locator('aside.side .ws-foot .ws-out')).toBeInViewport()
      // Every icon tile is a square: a stretched tile means an older rule won.
      const tiles = await page.locator('aside.side .ws-tile').evaluateAll((nodes) => nodes.map((node) => { const box = node.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)] }))
      expect(tiles.length, label).toBeGreaterThan(2)
      expect(tiles.filter(([w, h]) => w !== 32 || h !== 32), label).toEqual([])
      await accessible(page, ['aside.side', 'header.dash-top'], label)
    }
    expect(errors, label).toEqual([])
    await context.close()
  }
})

test('the account menu keeps its groups, remembers a closed one and works on a phone', async ({ browser, baseURL }) => {
  test.skip(!hasAdmin(), 'administrator session required')
  test.setTimeout(300_000)
  for (const [theme, width] of MODES) {
    const { context, page, errors } = await open(browser, baseURL!, theme, width)
    const label = `account ${theme}/${width}`
    await page.goto('/dashboard/wallet', { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await expect(page.locator('.app-shell.user-shell')).toBeVisible({ timeout: 60_000 })
    const phone = width < 900
    if (phone) await page.locator('.mobile-bar .icon-btn').click()
    const menu = page.locator(phone ? '#dashboard-mobile-navigation' : 'aside.side nav.side-nav')
    // Every group starts open, so nothing is hidden from a member who has not arranged the menu.
    const here = menu.locator('a[href="/dashboard/wallet"]')
    await expect(here).toHaveAttribute('aria-current', 'page')
    await expect(menu.locator('a[href="/dashboard/tickets"]')).toBeVisible()
    await expect(menu.locator('a[href="/dashboard/profile"]')).toBeVisible()
    await expect(menu.locator('a[href="/dashboard/collections"]')).toBeVisible()
    // A group the member closes stays closed after a reload (kept on the device), and opens again on request.
    const mine = menu.locator('.ws-toggle', { hasText: 'محتوای من' })
    await mine.click()
    await expect(mine).toHaveAttribute('aria-expanded', 'false')
    await expect(menu.locator('a[href="/dashboard/collections"]')).toBeHidden()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.app-shell.user-shell')).toBeVisible({ timeout: 60_000 })
    if (phone) await page.locator('.mobile-bar .icon-btn').click()
    await expect(menu.locator('.ws-toggle', { hasText: 'محتوای من' })).toHaveAttribute('aria-expanded', 'false')
    await expect(menu.locator('a[href="/dashboard/collections"]')).toBeHidden()
    await menu.locator('.ws-toggle', { hasText: 'محتوای من' }).click()
    await expect(menu.locator('a[href="/dashboard/collections"]')).toBeVisible()
    if (phone) {
      await accessible(page, ['.mobile-bar', '#dashboard-mobile-navigation'], `${label} drawer`)
      // Choosing a page closes the drawer.
      await menu.locator('a[href="/dashboard/tickets"]').click()
      await page.waitForURL('**/dashboard/tickets')
      await expect(page.locator('#dashboard-mobile-navigation')).toBeHidden()
    } else {
      await expect(page.locator('.dash-top .dash-crumbs b[aria-current="page"]')).toHaveText('کیف پول')
      await expect(page.locator('.dash-top .dash-crumb-group')).toHaveText('خرید و پرداخت')
      await expect(page.locator('aside.side .ws-foot .ws-out')).toBeInViewport()
      await accessible(page, ['aside.side', 'header.dash-top'], label)
    }
    expect(errors, label).toEqual([])
    await context.close()
  }
})
