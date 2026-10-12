import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { test, expect } from '@playwright/test'

const agent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36 MoboComFixture/${randomUUID()}`
test.use({ userAgent: agent })

test('real public page beacons count repeat views once per visitor and ignore non-object JSON', async ({ page, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1', 'requires a disposable analytics database')
  test.skip(!baseURL || !['localhost', '127.0.0.1', 'e2e.mobocom.test'].includes(new URL(baseURL).hostname), 'never writes analytics fixtures to a deployed site')
  const db = new PrismaClient()
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const total = () => db.analyticsDaily.findUnique({ where: { day_path: { day, path: '*' } } })
  const origin = new URL(baseURL!).origin
  try {
    const before = await total()
    const beforePath = await db.analyticsDaily.findUnique({ where: { day_path: { day, path: '/music' } } })
    for (let i = 0; i < 2; i++) {
      const beacon = page.waitForResponse(response => response.url().endsWith('/api/analytics/collect') && response.request().method() === 'POST')
      const result = await page.goto('/music')
      expect(result?.status()).toBe(200)
      const collected = await beacon
      expect(collected.status()).toBe(204)
      expect((await collected.request().allHeaders()).origin).toBe(origin)
    }
    const after = await total()
    expect(after!.views - (before?.views || 0)).toBe(2)
    expect(after!.visitors - (before?.visitors || 0)).toBe(1)
    // Chromium does not expose sendBeacon Blob bodies through postData().
    // Verify the actual persisted path instead of substituting a fetch or stub.
    const afterPath = await db.analyticsDaily.findUniqueOrThrow({ where: { day_path: { day, path: '/music' } } })
    expect(afterPath.views - (beforePath?.views || 0)).toBe(2)
    const rejected = await page.evaluate(async () => {
      const response = await fetch('/api/analytics/collect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' })
      return { status: response.status, cache: response.headers.get('cache-control') }
    })
    expect(rejected.status).toBe(204)
    expect(rejected.cache).toContain('no-store')
    expect(await total()).toEqual(after)
  } finally {
    await db.$disconnect()
    // Counters belong to the disposable database; do not reset shared daily history.
  }
})
