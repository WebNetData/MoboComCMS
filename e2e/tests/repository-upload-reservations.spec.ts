import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { test, expect } from '../helpers'
import { writeZip } from '../../src/modules/packages/domain/zip'

test('Repository keeps staging hidden and commits one ready upload over concurrent real HTTP requests', async ({ admin, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'requires disposable compiled fixture')
  const db = new PrismaClient(), stamp = `e2e-upload-${Date.now().toString(36)}`, key = 'extension.repository.state.v1'
  const moduleBefore = await db.setting.findUnique({ where: { key } })
  let productId: number | undefined
  try {
    await db.setting.upsert({ where: { key }, create: { key, value: '{"enabled":true,"settings":{}}' }, update: { value: '{"enabled":true,"settings":{}}' } })
    const product = await db.repoProduct.create({ data: { slug: stamp, name: stamp, active: true } }); productId = product.id
    const tokenHash = 'c'.repeat(64)
    const staged = await db.repoRelease.create({ data: { productId, version: '0.9.0', fileId: `${randomUUID()}.zip`, sha256: 'a'.repeat(64), size: 1, storageState: 'STAGING', uploadTokenHash: tokenHash, published: false } })
    const headers = { 'x-request-id': stamp }, before = await db.repoRelease.findUnique({ where: { id: staged.id } })
    const listing = await admin.get('/api/admin/repository?view=products')
    expect(listing.status()).toBe(200)
    expect((await listing.json()).products.find((row: { id: number }) => row.id === productId).releases).toEqual([])
    expect((await admin.post('/api/admin/repository', { headers, data: { op: 'release.publish', id: staged.id, published: false } })).status()).toBe(409)
    expect((await admin.post('/api/admin/repository', { headers, data: { op: 'product.delete', id: productId } })).status()).toBe(409)
    const diagnostic = await admin.get(`/api/admin/repository?view=archives&afterReleaseId=${staged.id - 1}&limit=1`)
    expect(diagnostic.status()).toBe(200)
    const report = await diagnostic.json()
    expect(report.groups.unsafe).toContainEqual(expect.objectContaining({ releaseId: staged.id, reason: 'upload-in-progress' }))
    expect(JSON.stringify(report)).not.toContain(tokenHash)
    expect(await db.repoRelease.findUnique({ where: { id: staged.id } })).toEqual(before)
    expect(await db.auditLog.count({ where: { requestId: stamp } })).toBe(0)
    await db.repoRelease.delete({ where: { id: staged.id } })
    const zip = writeZip(new Map<string, Buffer>([
      ['manifest.json', Buffer.from(JSON.stringify({ id: stamp, name: stamp, version: '1.0.0', kind: 'plugin', runtime: 'declarative', slots: { 'home.before-main': 'slots/banner.html' } }))],
      ['slots/banner.html', Buffer.from('<p>owned</p>')],
    ]))
    const upload = () => admin.post('/api/admin/repository/upload', { headers, multipart: { productId: String(productId), file: { name: 'owned.zip', mimeType: 'application/zip', buffer: zip } } })
    const responses = await Promise.all([upload(), upload()])
    expect(responses.map(response => response.status()).sort()).toEqual([200, 409])
    const rows = await db.repoRelease.findMany({ where: { productId, version: '1.0.0' } })
    expect(rows).toHaveLength(1); expect(rows[0].storageState).toBe('READY'); expect(rows[0].uploadTokenHash).toBeNull(); expect(rows[0].published).toBe(true)
    const audits = await db.auditLog.findMany({ where: { requestId: stamp } })
    expect(audits.filter(row => row.action === 'repository.release.reserve')).toHaveLength(1)
    expect(audits.filter(row => row.action === 'repository.release.upload')).toHaveLength(1)
  } finally {
    try {
      try {
        if (productId) {
          // These rows belong only to this disposable fixture; fence any interrupted request before cleanup.
          await db.repoRelease.deleteMany({ where: { productId, storageState: 'STAGING' } })
          expect((await admin.post('/api/admin/repository', { headers: { 'x-request-id': stamp }, data: { op: 'product.delete', id: productId } })).status()).toBe(200)
          await db.auditLog.deleteMany({ where: { requestId: stamp } })
        }
      } finally {
        if (moduleBefore) await db.setting.upsert({ where: { key }, create: { key, value: moduleBefore.value }, update: { value: moduleBefore.value } })
        else await db.setting.deleteMany({ where: { key } })
      }
    } finally { await db.$disconnect() }
  }
})
