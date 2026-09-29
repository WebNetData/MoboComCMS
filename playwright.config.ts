import { defineConfig, devices } from '@playwright/test'

/**
 * Browser regression suite (npm run test:e2e).
 *
 *   E2E_BASE_URL          test an already running site (a staging server); otherwise a dev server is started on :3100
 *   E2E_ADMIN_EMAIL/PASSWORD  enables the tests that need an administrator
 *   PLAYWRIGHT_CHROMIUM_PATH  use an installed Chromium instead of the one `npx playwright install` downloads
 *
 * The tests only read and toggle settings they restore; they never delete data.
 */
const external = process.env.E2E_BASE_URL
const port = 3100

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: external || `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: external ? undefined : {
    command: `npx next dev -p ${port}`,
    url: `http://localhost:${port}/api/health/ready`,
    reuseExistingServer: true,
    timeout: 240_000,
    env: { NEXTAUTH_URL: `http://localhost:${port}` },
  },
})
