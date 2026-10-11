import { test } from '@playwright/test'
import { execFileSync } from 'node:child_process'

test('import operators retain authority, provenance and rollback direction in the compiled application', () => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1', 'Owned disposable fixture required')
  test.setTimeout(90_000)
  execFileSync(process.execPath, ['scripts/import-execution-authority.browser.cjs'], { env: process.env, stdio: 'inherit', timeout: 80_000 })
})

test('existing magazine, cinema and music imports and rollback use actual compiled dispatch', () => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1', 'Owned disposable fixture required')
  test.setTimeout(120_000)
  execFileSync(process.execPath, ['scripts/imports.integration.cjs'], {
    env: { ...process.env, TEST_BASE_URL: 'http://localhost:3100', IMPORT_TEST_SCOPE: 'modules' },
    stdio: 'inherit', timeout: 110_000,
  })
})
