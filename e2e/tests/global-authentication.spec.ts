import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test, expect } from '@playwright/test'
const exec = promisify(execFile)

test('global restriction denies stale sessions, keys and new password login', async ({ baseURL }) => {
  test.setTimeout(120_000)
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'requires disposable compiled PostgreSQL fixture')
  const { stdout } = await exec(process.execPath, ['scripts/global-authentication.browser.cjs'], { timeout: 110_000, env: { ...process.env, E2E_BASE_URL: baseURL } })
  expect(stdout).toContain('actual compiled global authentication')
})
