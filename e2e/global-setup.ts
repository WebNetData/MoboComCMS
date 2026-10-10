import { chromium, type FullConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { openEmailLogin } from './helpers'
import { ADMIN_STATE } from './paths'

/** Signs in once as the administrator (when credentials are given) and keeps the session for the tests that need it. */

export default async function globalSetup(config: FullConfig) {
  fs.mkdirSync(path.dirname(ADMIN_STATE), { recursive: true })
  fs.rmSync(ADMIN_STATE, { force: true })
  const email = process.env.E2E_ADMIN_EMAIL
  const password = process.env.E2E_ADMIN_PASSWORD
  if (!email || !password) return
  const baseURL = String(config.projects[0].use.baseURL)
  const browser = await chromium.launch(config.projects[0].use.launchOptions)
  const page = await (await browser.newContext({ baseURL, ignoreHTTPSErrors: config.projects[0].use.ignoreHTTPSErrors })).newPage()
  await openEmailLogin(page)
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.locator('form.auth-form button.btn-primary').first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 120_000 })
  await page.context().storageState({ path: ADMIN_STATE })
  await browser.close()
}
