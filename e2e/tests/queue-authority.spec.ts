import { test } from '@playwright/test'
import { execFileSync } from 'node:child_process'

test('manual jobs recheck current authority in the compiled queue and retain explicit retry history', () => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1', 'owned disposable fixture required')
  test.setTimeout(90_000)
  execFileSync(process.execPath, ['scripts/queue-authority.browser.cjs'], { env: process.env, stdio: 'inherit', timeout: 80_000 })
})
