import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * Web installer test (npm run test:e2e:install): starts a dev server on :3200 with an EMPTY SQLite database and
 * a private config folder, then installs the site through the wizard like a person would. Nothing else is touched.
 */
const port = 3200
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobocom-install-'))

export default defineConfig({
  testDir: './e2e-install',
  timeout: 300_000,
  expect: { timeout: 60_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev -p ${port}`,
    url: `http://localhost:${port}/install`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { DATABASE_URL: `file:${path.join(dir, 'fresh.db')}`, INSTALL_CONFIG_DIR: path.join(dir, 'config'), NEXTAUTH_URL: `http://localhost:${port}` },
  },
})
