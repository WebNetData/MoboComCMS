import { test, expect, watchErrors } from '../helpers'

// Draft-only UI regression: connected tests cover persistence/claims/audit.
// No site settings or taxonomy rows are written by this scenario.
test('menu drafts retain nested edits, icons, visibility and section switching', async ({ admin, browser, baseURL }) => {
  test.setTimeout(240_000)
  const context = await browser.newContext({ baseURL, storageState: await admin.storageState() })
  const page = await context.newPage()
  const errors = watchErrors(page)
  const writes: string[] = []
  page.on('request', request => {
    if (request.url().endsWith('/api/admin/site') && request.method() === 'PUT') writes.push('site')
    if (request.url().endsWith('/api/admin/mega-menu') && request.method() === 'POST' && !request.postDataJSON()?.preview) writes.push('mega')
  })
  // Development StrictMode can issue two initial reads. A late first response
  // must never replace the draft that was loaded by the current request.
  let reads = 0
  let delayedRead = Promise.resolve()
  await page.route('**/api/admin/site', async route => {
    if (route.request().method() !== 'GET') return route.continue()
    if (++reads !== 1) return route.continue()
    const response = await route.fetch()
    delayedRead = new Promise<void>(resolve => setTimeout(resolve, 3000))
    await delayedRead
    await route.fulfill({ response }).catch(() => {}) // The obsolete request can be aborted.
  })
  try {
    // Menus have their own page (owner, 2026-10-28): the header tree is the first tab of «مدیریت منوها».
    await page.goto('/admin/menus?tab=header', { waitUntil: 'domcontentloaded', timeout: 180_000 })
    const heading = page.getByRole('heading', { name: 'منوی اصلی هدر', exact: true })
    await expect(heading).toBeVisible({ timeout: 90_000 })
    const menu = page.locator('section').filter({ has: heading }).first()
    await menu.getByRole('button', { name: '+ افزودن لینک', exact: true }).click()
    const root = menu.locator('ol').first().locator(':scope > li').last()
    const title = 'پیش‌نویس آزمون ناوبری'
    const titleField = root.getByRole('textbox', { name: 'عنوان', exact: true }).first()
    await titleField.fill('')
    await titleField.pressSequentially(title)
    await root.getByRole('textbox', { name: 'نشانی مقصد', exact: true }).first().fill('/blog?navigation=draft')
    await root.getByLabel('آیکن', { exact: true }).first().selectOption('star')
    await delayedRead
    await expect(titleField).toHaveValue(title)
    await root.getByRole('button', { name: '+ افزودن زیرمنو', exact: true }).click()
    const child = root.locator('ol').first().locator(':scope > li').first()
    await child.locator('summary').first().click()
    await child.getByRole('textbox', { name: 'عنوان', exact: true }).first().fill('فرزند آزمون')
    await child.getByLabel('آیکن', { exact: true }).first().selectOption('')
    await child.getByRole('checkbox', { name: 'نمایش لینک و زیرمنوها', exact: true }).first().uncheck()
    await expect(child.locator('summary').first()).toContainText('پنهان')
    await child.getByRole('button', { name: 'یک سطح بالاتر', exact: true }).click()
    const promoted = menu.locator('ol').first().locator(':scope > li').last()
    await expect(promoted.getByRole('textbox', { name: 'عنوان', exact: true }).first()).toHaveValue('فرزند آزمون')
    await promoted.getByRole('button', { name: 'زیرمنوی مورد قبلی', exact: true }).click()
    await expect(root.locator('ol').first().locator(':scope > li')).toHaveCount(1)
    await root.getByRole('button', { name: 'حذف', exact: true }).first().click()
    const namedRoot = menu.locator('ol').first().locator(':scope > li').filter({ has: page.getByText(title, { exact: true }) })
    await namedRoot.getByRole('button', { name: `بالا بردن ${title}`, exact: true }).click()
    await expect(namedRoot.getByRole('alert')).toContainText(title)
    await namedRoot.getByRole('button', { name: 'انصراف', exact: true }).click()
    await namedRoot.getByRole('button', { name: `پایین بردن ${title}`, exact: true }).click()
    await expect(titleField).toHaveValue(title)
    await root.getByRole('button', { name: 'حذف', exact: true }).first().click()
    await root.getByRole('button', { name: 'حذف از فهرست', exact: true }).click()
    await expect(menu.getByText(title, { exact: true })).toHaveCount(0)

    const sectionPage = await context.newPage()
    const sectionErrors = watchErrors(sectionPage)
    await sectionPage.goto('/admin/mega-menu', { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await sectionPage.getByRole('tab', { name: /مجله/ }).click()
    await expect(sectionPage.getByRole('heading', { name: 'منوی بخش مجله', exact: true })).toBeVisible()
    const custom = sectionPage.locator('section.sh-panel').filter({ has: sectionPage.getByRole('heading', { name: 'منوها و زیرمنوهای دلخواه', exact: true }) })
    await custom.getByRole('button', { name: '+ افزودن لینک', exact: true }).click()
    const entry = custom.locator('ol').first().locator(':scope > li').last()
    await entry.getByRole('textbox', { name: 'عنوان', exact: true }).first().fill(title)
    await entry.getByLabel('آیکن', { exact: true }).first().selectOption('music')
    await sectionPage.getByRole('tab', { name: /فروشگاه/ }).click()
    await sectionPage.getByRole('tab', { name: /مجله/ }).click()
    await expect(entry.getByRole('textbox', { name: 'عنوان', exact: true }).first()).toHaveValue(title)
    await expect(entry.getByLabel('آیکن', { exact: true }).first()).toHaveValue('music')
    const journalTab = sectionPage.getByRole('tab', { name: /مجله/ })
    await journalTab.focus()
    await journalTab.press('ArrowDown')
    await expect(sectionPage.getByRole('tab', { name: /موزیک/ })).toBeFocused()
    await expect(sectionPage.getByRole('tab', { name: /موزیک/ })).toHaveAttribute('aria-selected', 'true')
    await sectionPage.getByRole('tab', { name: /موزیک/ }).press('Home')
    await expect(sectionPage.getByRole('tab', { name: /فروشگاه/ })).toBeFocused()
    expect(writes).toEqual([])
    expect([...errors, ...sectionErrors]).toEqual([])
  } finally {
    await context.close()
  }
})
