import { randomUUID, createHash } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { test, expect } from '../helpers'

test('Repository buyer download rejects altered archives through actual HTTP and preserves counters', async ({ admin, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'requires disposable compiled fixture')
  const db = new PrismaClient(), stamp = `e2e-owner-integrity-${Date.now().toString(36)}`, keys = ['extension.repository.state.v1', 'repository.vendor.v1']
  const settings = await db.setting.findMany({ where: { key: { in: keys } } })
  const directory = resolve('storage/repository'), fileId = `${randomUUID()}.zip`, filename = join(directory, fileId), bytes = Buffer.from('owned original archive')
  let productId: number | undefined, ownsFile = false
  try {
    await db.setting.upsert({ where: { key: keys[0] }, create: { key: keys[0], value: '{"enabled":true,"settings":{}}' }, update: { value: '{"enabled":true,"settings":{}}' } })
    await db.setting.upsert({ where: { key: keys[1] }, create: { key: keys[1], value: '{"enabled":true,"name":"owned"}' }, update: { value: '{"enabled":true,"name":"owned"}' } })
    const user = await db.user.findUniqueOrThrow({ where: { email: process.env.E2E_ADMIN_EMAIL! } })
    const product = await db.repoProduct.create({ data: { slug: stamp, name: stamp, active: true } }); productId = product.id
    await db.repoRelease.create({ data: { productId, version: '1.0.0', fileId, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length } })
    const license = await db.repoLicense.create({ data: { productId, userId: user.id, source: 'GRANT', keyHash: stamp, keyEnc: 'owned', keyLast4: 'TEST' } })
    await mkdir(directory, { recursive: true }); await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 }); ownsFile = true
    const read = () => admin.get(`/api/repo/mine/download?license=${license.id}`)
    const snapshot = () => db.repoProduct.findUnique({ where: { id: productId }, include: { releases: true, licenses: true } })
    const healthy = await read(); expect(healthy.status()).toBe(200); expect(await healthy.body()).toEqual(bytes)
    expect(healthy.headers()['cache-control']).toBe('private, no-store'); expect(healthy.headers()['x-content-type-options']).toBe('nosniff')
    await writeFile(filename, Buffer.from('owned changed archive')); const before = await snapshot()
    expect((await read()).status()).toBe(500); expect(await snapshot()).toEqual(before)
    await writeFile(filename, bytes); expect((await read()).status()).toBe(200)
  } finally {
    try {
      if (productId) await db.repoProduct.deleteMany({ where: { id: productId, slug: stamp } })
      if (ownsFile) { expect(resolve(filename)).toBe(join(directory, fileId)); await unlink(filename) }
    } finally {
      try { for (const key of keys) { const row = settings.find(item => item.key === key); if (row) await db.setting.upsert({ where: { key }, create: { key, value: row.value }, update: { value: row.value } }); else await db.setting.deleteMany({ where: { key } }) } }
      finally { await db.$disconnect() }
    }
  }
})
