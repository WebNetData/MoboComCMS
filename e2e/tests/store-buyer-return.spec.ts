import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test, expect } from '@playwright/test'

const exec = promisify(execFile)

test('a real buyer pays with wallet, receives a code and returns it through the staff workflow', async ({ baseURL }, testInfo) => {
  test.setTimeout(600_000)
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || !process.env.STORE_DELIVERY_KEY, 'requires a disposable local test database and delivery encryption key')
  test.skip(!baseURL || !['localhost', '127.0.0.1', 'e2e.mobocom.test'].includes(new URL(baseURL).hostname), 'never creates financial fixtures on a deployed site')
  const { stdout } = await exec(process.execPath, ['scripts/store-buyer-return.browser.cjs'], {
    timeout: 590_000,
    env: { ...process.env, E2E_BASE_URL: baseURL, E2E_ARTIFACT_DIR: testInfo.outputPath('buyer-return') },
    windowsHide: true,
  })
  expect(stdout).toContain('Real buyer return: wallet checkout/replay')
})
