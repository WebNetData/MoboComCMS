import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { writeZip } from '../../src/modules/packages/domain/zip'
import { test, expect } from '../helpers'

test('Repository explicitly enables reviewed recovery and promotes a verified independent copy through real HTTP', async ({ admin, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'requires disposable compiled fixture')
  const db = new PrismaClient(), stamp = `e2e-recovery-${Date.now().toString(36)}`, keys = ['extension.repository.state.v1', 'repository.vendor.v1']
  const settings = await db.setting.findMany({ where: { key: { in: keys } } }), directory = resolve('storage/repository'), files = new Set<string>()
  let productId: number | undefined
  try {
    await db.setting.upsert({ where: { key: keys[0] }, create: { key: keys[0], value: '{"enabled":true,"settings":{}}' }, update: { value: '{"enabled":true,"settings":{}}' } })
    await db.setting.upsert({ where: { key: keys[1] }, create: { key: keys[1], value: '{"archiveRecoveryEnabled":false}' }, update: { value: '{"archiveRecoveryEnabled":false}' } })
    const product = await db.repoProduct.create({ data: { slug: stamp, name: stamp } }); productId = product.id
    const bytes = writeZip(new Map<string, Buffer>([
      ['manifest.json', Buffer.from(JSON.stringify({ id: stamp, name: stamp, version: '1.0.0', kind: 'plugin', runtime: 'declarative', slots: { 'home.before-main': 'slots/banner.html' } }))],
      ['slots/banner.html', Buffer.from('<p>owned</p>')],
    ])), fileId = `${randomUUID()}.zip`, filename = join(directory, fileId), privateHash = 'c'.repeat(64)
    await mkdir(directory, { recursive: true }); await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 }); files.add(filename)
    const row = await db.repoRelease.create({ data: { productId, version: '1.0.0', fileId, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), published: false, storageState: 'STAGING', uploadTokenHash: privateHash } })
    const preview = async () => { const response = await admin.get(`/api/admin/repository?view=upload-recovery&releaseId=${row.id}`); expect(response.status()).toBe(200); return response.json() }
    const post = (evidence: string, acknowledgeReviewed = true) => admin.post('/api/admin/repository', { headers: { 'x-request-id': stamp }, data: { op: 'release.recover', releaseId: row.id, evidence, acknowledgeReviewed } })
    const off = await preview(); expect(off.canPromote).toBe(false); expect((await post(off.evidence)).status()).toBe(403)
    expect((await admin.post('/api/admin/repository', { headers: { 'x-request-id': stamp }, data: { op: 'settings', enabled: false, name: 'owned', archiveRecoveryEnabled: true } })).status()).toBe(200)
    const shown = await preview(); expect(shown.canPromote).toBe(true); expect(JSON.stringify(shown)).not.toContain(privateHash)
    expect((await post(shown.evidence, false)).status()).toBe(400)
    const response = await post(shown.evidence); expect(response.status(), await response.text()).toBe(200)
    const ready = await db.repoRelease.findUniqueOrThrow({ where: { id: row.id } }); files.add(join(directory, ready.fileId))
    expect(ready.storageState).toBe('READY'); expect(ready.uploadTokenHash).toBeNull(); expect(ready.published).toBe(true); expect(ready.fileId).not.toBe(fileId)
    expect(await readFile(join(directory, ready.fileId))).toEqual(bytes); expect(await readFile(filename)).toEqual(bytes)
    expect((await post(shown.evidence)).status()).toBe(409)
    expect(await db.auditLog.count({ where: { requestId: stamp, action: 'repository.release.recover' } })).toBe(1)
  } finally {
    try { if (productId) await db.repoProduct.deleteMany({ where: { id: productId, slug: stamp } }); await db.auditLog.deleteMany({ where: { requestId: stamp } }); for (const file of files) { expect(resolve(file).startsWith(directory + '/')).toBe(true); await unlink(file) } }
    finally { try { for (const key of keys) { const row = settings.find(item => item.key === key); if (row) await db.setting.upsert({ where: { key }, create: { key, value: row.value }, update: { value: row.value } }); else await db.setting.deleteMany({ where: { key } }) } } finally { await db.$disconnect() } }
  }
})
