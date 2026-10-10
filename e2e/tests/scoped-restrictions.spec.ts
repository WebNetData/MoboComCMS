import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test, expect } from '@playwright/test'
const exec = promisify(execFile)
test('forum manager adds and independently revokes scoped restrictions', async ({ baseURL }, testInfo) => {
  test.setTimeout(180_000)
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'requires a disposable compiled PostgreSQL fixture')
  const { stdout } = await exec(process.execPath, ['scripts/scoped-restrictions.browser.cjs'], { timeout: 170_000, env: { ...process.env, E2E_BASE_URL: baseURL, E2E_ARTIFACT_DIR: testInfo.outputPath('scoped-restrictions') } })
  expect(stdout).toContain('actual issue/overlap/single revoke')
})
