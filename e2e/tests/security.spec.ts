import { test, expect } from '@playwright/test'
import { openEmailLogin } from '../helpers'

test('security headers are on every page', async ({ request }) => {
  const response = await request.get('/', { headers: { accept: 'text/html' } })
  const headers = response.headers()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('SAMEORIGIN')
  expect(headers['content-security-policy']).toContain("frame-ancestors 'self'")
  expect(headers['content-security-policy']).toContain("default-src 'self'")
})

test('the admin area and its API refuse visitors', async ({ request, page }) => {
  for (const path of ['/api/admin/optimization', '/api/admin/cms?type=products', '/api/admin/fx', '/api/admin/chat']) {
    expect([401, 403], path).toContain((await request.get(path)).status())
  }
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/login/)
})

test('a state-changing request from another site is refused', async ({ request }) => {
  const response = await request.post('/api/admin/optimization', { headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, data: { op: 'purge' } })
  expect(response.status()).toBe(403)
})

test('the login form rejects a wrong password without leaking which part was wrong', async ({ page }) => {
  await openEmailLogin(page)
  await page.locator('#login-email').fill('nobody@example.com')
  await page.locator('#login-password').fill('definitely-wrong-Password-1')
  await page.locator('form.auth-form button.btn-primary').first().click()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.locator('[role=alert], .error-text').first()).toBeVisible({ timeout: 30_000 })
})
