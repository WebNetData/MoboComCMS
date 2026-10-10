import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test, expect } from '@playwright/test'

const exec = promisify(execFile)

test('a magazine-only manager saves content and cannot edit other sections', async ({ baseURL }, testInfo) => {
  test.setTimeout(300_000)
  test.skip(!process.env.DATABASE_URL || !process.env.NEXTAUTH_SECRET, 'requires the local test database and session secret')
  test.skip(!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'creates isolated fixtures only on a local test app')
  const { stdout } = await exec(process.execPath, ['scripts/section-manager.browser.cjs'], {
    timeout: 290_000,
    env: { ...process.env, E2E_BASE_URL: baseURL, E2E_ARTIFACT_DIR: testInfo.outputPath('section-manager') },
    windowsHide: true,
  })
  expect(stdout).toContain('save/reopen/revisions')
  if (process.env.E2E_EXPECT_BLOCK_BODY === '1') expect(stdout).toContain('metadata + block body')
})
