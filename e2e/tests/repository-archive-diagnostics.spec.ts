import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { test, expect } from '../helpers'

test('Repository archive observation uses actual guarded HTTP without changing files or records', async ({ admin, playwright, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'requires disposable compiled fixture')
  const db = new PrismaClient(), stamp = `e2e-archive-${Date.now().toString(36)}`, key = 'extension.repository.state.v1'
  const moduleBefore = await db.setting.findUnique({ where: { key } })
  const directory = resolve('storage/repository'), fileId = `${randomUUID()}.zip`, filename = join(directory, fileId)
  const bytes = Buffer.from('owned archive inspection fixture')
  let productId: number | undefined, ownsFile = false
  const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } })
  try {
    await db.setting.upsert({ where: { key }, create: { key, value: '{"enabled":true,"settings":{}}' }, update: { value: '{"enabled":true,"settings":{}}' } })
    await mkdir(directory, { recursive: true }); await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 }); ownsFile = true
    const product = await db.repoProduct.create({ data: { slug: stamp, name: stamp } }); productId = product.id
    const release = await db.repoRelease.create({ data: { productId, version: '1.0.0', fileId, size: bytes.length, sha256: 'a'.repeat(64) } })
    const missing = await db.repoRelease.create({ data: { productId, version: '1.0.1', fileId: `${randomUUID()}.zip`, size: 1, sha256: createHash('sha256').update(bytes).digest('hex') } })
    const snapshot = () => db.repoProduct.findUnique({ where: { id: productId }, include: { releases: { orderBy: { id: 'asc' } } } })
    const before = await snapshot(), audits = await db.auditLog.count({ where: { requestId: stamp } })
    const response = await admin.get(`/api/admin/repository?view=archives&afterReleaseId=${release.id - 1}&limit=2&verifyHashes=true`, { headers: { 'x-request-id': stamp } })
    expect(response.status(), await response.text()).toBe(200)
    const report = await response.json()
    expect(report.mutationAllowed).toBe(false); expect(report.verifyHashes).toBe(true)
    expect(report.groups.mismatch).toContainEqual(expect.objectContaining({ releaseId: release.id, fileId, reason: 'hash-mismatch' }))
    expect(report.groups.missing).toContainEqual(expect.objectContaining({ releaseId: missing.id, reason: 'missing' }))
    expect(report.scannedReleases).toBe(2)
    expect((await admin.get('/api/admin/repository?view=archives&afterFileId=../.env')).status()).toBe(400)
    expect([401, 403]).toContain((await guest.get('/api/admin/repository?view=archives')).status())
    expect(await snapshot()).toEqual(before); expect(await readFile(filename)).toEqual(bytes)
    expect(await db.auditLog.count({ where: { requestId: stamp } })).toBe(audits)
  } finally {
    try {
      if (productId) await db.repoProduct.deleteMany({ where: { id: productId, slug: stamp } })
      if (ownsFile) { expect(resolve(filename)).toBe(join(directory, fileId)); await unlink(filename) }
      if (moduleBefore) await db.setting.upsert({ where: { key }, create: { key, value: moduleBefore.value }, update: { value: moduleBefore.value } })
      else await db.setting.deleteMany({ where: { key } })
    } finally { await guest.dispose(); await db.$disconnect() }
  }
})
