import fs from 'node:fs'
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'
import { ADMIN_STATE } from './paths'

export { expect }
export const hasAdmin = () => fs.existsSync(ADMIN_STATE)

/** Collects script errors; a page that throws on load is a failed page. */
export function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

export const test = base.extend<{ admin: APIRequestContext }>({
  admin: async ({ playwright, baseURL }, use) => {
    test.skip(!hasAdmin(), 'set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run administrator tests')
    const context = await playwright.request.newContext({ baseURL, storageState: ADMIN_STATE, extraHTTPHeaders: { origin: baseURL! } })
    await use(context)
    await context.dispose()
  },
})

/** A visitor's request: no cookies, asking for a page the way a browser does. */
export const asGuest = (playwright: { request: { newContext: (o: object) => Promise<APIRequestContext> } }, baseURL: string | undefined, headers: Record<string, string> = {}) =>
  playwright.request.newContext({ baseURL, extraHTTPHeaders: { accept: 'text/html,application/xhtml+xml', ...headers } })

/** The login page offers phone sign-in first; the e-mail form sits behind a tab. */
export async function openEmailLogin(page: Page) {
  await page.goto('/login', { waitUntil: 'networkidle', timeout: 180_000 })
  if (!(await page.locator('#login-email').isVisible())) await page.getByRole('tab', { name: /ایمیل|e-?mail/i }).first().click()
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 30_000 })
}
