import { test, expect } from '@playwright/test'

/** A person installs the site in the browser: system check → tables → site → administrator → features → done → sign in. */
test.describe.configure({ mode: 'serial' })

const EMAIL = 'owner@example.com'
const PASSWORD = 'Zebra-Quartz-Lamp-2049'

test('a fresh site leads everywhere to the installer', async ({ request, playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL, maxRedirects: 0 })
  const home = await anon.get('/')
  expect(home.status()).toBe(307)
  expect(home.headers().location).toContain('/install')
  const api = await anon.get('/api/store/products')
  expect(api.status()).toBe(503)
  // The health check stays reachable (it reports the missing tables itself instead of redirecting).
  const health = await anon.get('/api/health/ready')
  expect(health.headers().location).toBeUndefined()
  const status = await (await request.get('/api/install')).json()
  expect(status.mode).toBe('needs-schema')
  expect(JSON.stringify(status)).not.toContain('fresh.db?')
  await anon.dispose()
})

test('the wizard installs the site', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page).toHaveURL(/\/install$/)

  // 1. system check
  await expect(page.getByRole('heading', { name: /خوش آمدید/ })).toBeVisible()
  await expect(page.locator('.checks li.fail')).toHaveCount(0)
  await page.getByRole('button', { name: 'شروع نصب' }).click()

  // 2. tables
  await expect(page.getByRole('heading', { name: /ساخت جدول/ })).toBeVisible()
  await page.getByRole('button', { name: 'ساخت جدول‌ها' }).click()

  // 3. site
  await expect(page.getByRole('heading', { name: 'مشخصات سایت' })).toBeVisible({ timeout: 240_000 })
  await page.getByRole('button', { name: 'ادامه' }).click()
  await expect(page.getByText('نام سایت را وارد کنید')).toBeVisible()
  await page.getByLabel('نام سایت').fill('فروشگاه آزمایشی')
  await page.getByLabel('شعار (اختیاری)').fill('نصب از مرورگر')
  await page.getByRole('button', { name: 'ادامه' }).click()

  // 4. administrator: weak and mismatching passwords are refused
  await expect(page.getByRole('heading', { name: 'حساب مدیر' })).toBeVisible()
  await page.getByLabel('نام', { exact: true }).fill('مدیر آزمایشی')
  await page.getByLabel('ایمیل').fill(EMAIL)
  await page.getByLabel('گذرواژه', { exact: true }).fill('short1')
  await page.getByLabel('تکرار گذرواژه').fill('short1')
  await page.getByRole('button', { name: 'ادامه' }).click()
  await expect(page.getByRole('alert')).toContainText('۱۰ نویسه')
  await page.getByLabel('گذرواژه', { exact: true }).fill(PASSWORD)
  await page.getByLabel('تکرار گذرواژه').fill(`${PASSWORD}x`)
  await page.getByRole('button', { name: 'ادامه' }).click()
  await expect(page.getByRole('alert')).toContainText('یکسان نیست')
  // A common password is refused before the request is made
  await page.getByLabel('گذرواژه', { exact: true }).fill('Passw0rd12345')
  await page.getByLabel('تکرار گذرواژه').fill('Passw0rd12345')
  await page.getByRole('button', { name: 'ادامه' }).click()
  await expect(page.getByRole('alert')).toContainText('رایج')
  await page.getByLabel('گذرواژه', { exact: true }).fill(PASSWORD)
  await page.getByLabel('تکرار گذرواژه').fill(PASSWORD)
  await page.getByRole('button', { name: 'ادامه' }).click()

  // 5. features: turn the forum off
  await expect(page.getByRole('heading', { name: 'امکانات سایت' })).toBeVisible()
  const forum = page.locator('.feature').filter({ has: page.getByText('تالار گفتمان', { exact: true }) })
  await expect(forum).toHaveCount(1)
  await forum.locator('input').uncheck()
  await page.getByRole('button', { name: 'ادامه' }).click()

  // 6. review and install
  await expect(page.getByRole('heading', { name: 'مرور و نصب' })).toBeVisible()
  await expect(page.locator('.summary')).toContainText('فروشگاه آزمایشی')
  await expect(page.locator('.summary')).toContainText(EMAIL)
  await page.getByRole('button', { name: 'نصب سایت' }).click()
  await expect(page.getByRole('heading', { name: /نصب کامل شد/ })).toBeVisible({ timeout: 120_000 })

  // The installer closes for good
  expect((await request.get('/api/install')).status()).toBe(404)
  expect((await request.get('/install')).status()).toBe(404)
  expect((await request.post('/api/install', { data: { op: 'site' }, headers: { origin: 'http://localhost:3200' } })).status()).toBe(404)
  expect(errors).toEqual([])
})

test('the site works and the administrator can sign in', async ({ page, request }) => {
  const home = await request.get('/')
  expect(home.status()).toBe(200)
  expect(await home.text()).toContain('فروشگاه آزمایشی')
  await page.goto('/login', { waitUntil: 'networkidle', timeout: 240_000 })
  if (!(await page.locator('#login-email').isVisible())) await page.getByRole('tab', { name: /ایمیل|e-?mail/i }).first().click()
  await page.locator('#login-email').fill(EMAIL)
  await page.locator('#login-password').fill(PASSWORD)
  await page.locator('form').filter({ has: page.locator('#login-password') }).getByRole('button', { name: /ورود|Sign in/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120_000 })
  await page.goto('/admin', { waitUntil: 'networkidle', timeout: 240_000 })
  await expect(page).toHaveURL(/\/admin/)
  // The forum was switched off in the wizard
  expect((await request.get('/forum')).status()).toBe(404)
})
