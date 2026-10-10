import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test, expect } from '@playwright/test'

const exec = promisify(execFile)

test('a magazine-only manager saves content and cannot edit other sections', async ({ baseURL }, testInfo) => {
  test.setTimeout(300_000)
  test.skip(!process.env.DATABASE_URL || !process.env.NEXTAUTH_SECRET, 'requires the local test database and session secret')
  const fixtureHosts = process.env.MOBOCOM_ISOLATED_FIXTURE === '1' ? ['localhost', '127.0.0.1', 'e2e.mobocom.test'] : ['localhost', '127.0.0.1']
  test.skip(!baseURL || !fixtureHosts.includes(new URL(baseURL).hostname), 'creates isolated fixtures only on a local test app')
  const { stdout } = await exec(process.execPath, ['scripts/section-manager.browser.cjs'], {
    timeout: 290_000,
    env: { ...process.env, E2E_BASE_URL: baseURL, E2E_ARTIFACT_DIR: testInfo.outputPath('section-manager') },
    windowsHide: true,
  })
  expect(stdout).toContain('save/reopen/revisions')
  if (process.env.E2E_EXPECT_BLOCK_BODY === '1') expect(stdout).toContain('metadata + block body')
})
