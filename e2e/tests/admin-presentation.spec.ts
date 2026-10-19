import { test, expect, watchErrors } from '../helpers'
import type { Page } from '@playwright/test'

async function publicStyles(page: Page) {
  return page.evaluate(() => {
    const sample = document.createElement('div')
    sample.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none'
    sample.innerHTML = '<button class="btn btn-secondary">نمونه</button><h3 class="h3">نمونه</h3><table class="table"><tbody><tr><th>نمونه</th><td>نمونه</td></tr></tbody></table><div class="sh-sticky-save">نمونه</div>'
    document.body.append(sample)
    const result = [...sample.querySelectorAll('*')].map(element => {
      const css = getComputedStyle(element)
      return [css.color, css.backgroundColor, css.fontSize, css.fontWeight, css.padding, css.borderRadius, css.position, css.overflowX]
    })
    sample.remove()
    return result
  })
}

test('Admin styles do not leak into public pages after client navigation', async ({ admin, browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: await admin.storageState() })
  const page = await context.newPage(), errors = watchErrors(page)
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main').first()).toBeVisible()
    const before = await publicStyles(page)
    await page.goto('/admin/audit', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'گزارش فعالیت‌ها', exact: true })).toBeVisible()
    await page.evaluate(() => Object.assign(window, { __adminNavigationProof: 'same-document' }))
    const home = page.locator('.dash-top-link[href="/"]')
    // Exercise AppLink's actual client transition in this tab.
    await home.evaluate(element => element.removeAttribute('target'))
    await home.click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.admin-shell')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__adminNavigationProof)).toBe('same-document')
    expect(await publicStyles(page)).toEqual(before)
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('Admin article edit persists and retains its draft on a failed save', async ({ admin, browser, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const slug = `e2e-admin-presentation-${Date.now()}`
  const created = await admin.post('/api/admin/cms?type=posts', { headers: { Origin: origin }, data: { slug, title: 'آزمون ظاهر پنل', status: 'DRAFT', content: '<p>متن اولیه محفوظ است.</p>' } })
  expect(created.status()).toBe(200)
  const item = await created.json()
  const context = await browser.newContext({ baseURL, storageState: await admin.storageState() })
  const page = await context.newPage(), errors = watchErrors(page)
  try {
    await page.goto(`/admin/posts?edit=${item.id}`, { waitUntil: 'domcontentloaded' })
    const title = page.getByLabel('عنوان', { exact: true })
    await expect(title).toHaveValue('آزمون ظاهر پنل')
    await title.fill('عنوان حفظ‌شده پس از خطا')
    let fail = true
    await page.route('**/api/admin/cms?type=posts', async route => {
      if (fail && route.request().method() === 'PATCH') { fail = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'خطای آزمایشی ذخیره' }) }); return }
      await route.continue()
    })
    await page.getByRole('button', { name: 'ذخیره', exact: true }).click()
    await expect(page.getByText('خطای آزمایشی ذخیره', { exact: true })).toBeVisible()
    await expect(title).toHaveValue('عنوان حفظ‌شده پس از خطا')
    const saved = page.waitForResponse(response => response.url().endsWith('/api/admin/cms?type=posts') && response.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'ذخیره', exact: true }).click()
    expect((await saved).status()).toBe(200)
    await page.reload()
    await expect(title).toHaveValue('عنوان حفظ‌شده پس از خطا')
    const response = await admin.get(`/api/admin/cms?type=posts&id=${item.id}`), rows = await response.json()
    expect(rows[0].title).toBe('عنوان حفظ‌شده پس از خطا')
    expect(rows[0].content).toBe('<p>متن اولیه محفوظ است.</p>')
    expect(rows[0].status).toBe('DRAFT')
    expect(errors).toEqual([])
  } finally {
    await context.close()
    const removed = await admin.delete(`/api/admin/cms?type=posts&id=${item.id}`, { headers: { Origin: origin } })
    expect(removed.status()).toBe(200)
  }
})

test('Audit filters retain current results when an older request finishes late and recover from errors', async ({ admin, browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: await admin.storageState() })
  const page = await context.newPage(), errors = watchErrors(page)
  let release = () => {}, fail = false
  const delayed = new Promise<void>(resolve => { release = resolve })
  const row = (action: string) => ({ id: 1, actorUserId: 1, actorEmail: 'test@example.invalid', action, targetType: 'setting', targetId: '0', requestId: 'owned-browser', metadata: { test: true }, ip: '', createdAt: '2026-10-19T12:00:00.000Z' })
  await page.route('**/api/admin/audit?*', async route => {
    const action = new URL(route.request().url()).searchParams.get('action')
    if (action === 'slow') await delayed
    if (fail) { fail = false; await route.fulfill({ status: 503, json: { error: 'owned failure' } }); return }
    await route.fulfill({ json: { items: action === 'none' ? [] : [row(action === 'slow' ? 'stale.result' : 'current.result')], nextCursor: null } })
  })
  try {
    await page.goto('/admin/audit?targetType=posts&targetId=42', { waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('نوع مورد', { exact: true })).toHaveValue('posts')
    await expect(page.getByLabel('شناسهٔ مورد', { exact: true })).toHaveValue('42')
    await expect(page.getByText('current.result', { exact: true })).toBeVisible()
    await expect(page.locator('.audit-log').getByRole('link', { name: 'نسخه‌ها', exact: true })).toHaveCount(0)
    await page.getByLabel('عملیات', { exact: true }).fill('slow')
    await page.getByRole('button', { name: 'اعمال فیلتر', exact: true }).click()
    await expect(page.getByRole('region', { name: 'رخدادها' })).toHaveAttribute('aria-busy', 'true')
    await page.getByRole('button', { name: 'پاک کردن', exact: true }).click()
    await expect(page.getByRole('region', { name: 'رخدادها' })).toHaveAttribute('aria-busy', 'false')
    const stale = page.waitForResponse(response => response.url().includes('/api/admin/audit?') && new URL(response.url()).searchParams.get('action') === 'slow')
    release()
    await (await stale).finished()
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(page.getByText('current.result', { exact: true })).toBeVisible()
    await expect(page.getByText('stale.result', { exact: true })).toHaveCount(0)
    await page.getByText('جزئیات', { exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('details')).toHaveAttribute('open', '')
    fail = true
    await page.getByRole('button', { name: 'اعمال فیلتر', exact: true }).click()
    await expect(page.locator('.audit-log').getByRole('alert')).toContainText('دریافت گزارش ممکن نشد')
    await page.getByRole('button', { name: 'اعمال فیلتر', exact: true }).click()
    await expect(page.getByText('current.result', { exact: true })).toBeVisible()
    await page.getByLabel('عملیات', { exact: true }).fill('none')
    await page.getByLabel('عملیات', { exact: true }).press('Enter')
    await expect(page.getByText('رخدادی با این فیلتر پیدا نشد.', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  } finally { release(); await context.close() }
})
