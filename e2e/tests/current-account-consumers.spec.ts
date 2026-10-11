import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test, expect } from '@playwright/test'
const exec = promisify(execFile)

test('account restrictions reach advertiser, owner-download and form endpoints', async ({ baseURL }) => {
  test.setTimeout(120_000)
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'requires disposable compiled PostgreSQL fixture')
  const { stdout } = await exec(process.execPath, ['scripts/current-account-consumers.browser.cjs'], { timeout: 110_000, env: { ...process.env, E2E_BASE_URL: baseURL } })
  expect(stdout).toContain('actual compiled current-account consumers')
})
