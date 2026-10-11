import { createServer } from 'node:http'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { test, expect } from '../helpers'
import { canonicalJson } from '../../src/modules/repository/domain/repository'
import { writeZip } from '../../src/modules/packages/domain/zip'

for (const change of ['module-disabled', 'disconnected', 'key-changed'] as const) {
  test(`repository install rejects ${change} while its real HTTP download is pending`, async ({ admin, baseURL }) => {
    test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'requires disposable compiled fixture')
    const db = new PrismaClient(), id = `e2e-repo-admit-${Date.now().toString(36)}`
    const headers = { 'x-request-id': id }
    const configKey = 'repository.client.v1', moduleKey = 'extension.repository.state.v1', receiptKey = 'repository.installed.v1', indexKey = 'packages.index.v1', packageKey = `package.${id}.v1`
    const originals = new Map<string, { key: string; value: string } | null>()
    for (const key of [configKey, moduleKey, receiptKey, indexKey]) originals.set(key, await db.setting.findUnique({ where: { key } }))
    const pair = generateKeyPairSync('ed25519'), publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const archive = writeZip(new Map([['manifest.json', Buffer.from(JSON.stringify({ id, name: id, kind: 'plugin', runtime: 'declarative', version: '1.0.0' }))]]))
    const release = { slug: id, version: '1.0.0', sha256: createHash('sha256').update(archive).digest('hex'), size: archive.length }
    let arrived!: () => void, releaseDownload!: () => void
    const downloading = new Promise<void>(resolve => { arrived = resolve }), downloadGate = new Promise<void>(resolve => { releaseDownload = resolve })
    const server = createServer(async (req, res) => {
      if (req.url?.includes('/download/')) { arrived(); await downloadGate; res.writeHead(200, { 'content-type': 'application/zip' }); res.end(archive); return }
      res.setHeader('content-type', 'application/json')
      if (req.url?.startsWith('/api/repo/v1/meta')) res.end(JSON.stringify({ name: id, publicKey }))
      else res.end(JSON.stringify({ products: [{ slug: id, name: id, kind: 'PLUGIN', price: '0', latest: { ...release, runtime: 'declarative', requiresCore: '', signature: sign(null, Buffer.from(canonicalJson(release)), pair.privateKey).toString('base64url') } }] }))
    })
    let pending: ReturnType<typeof admin.post> | undefined
    try {
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('fixture server did not bind')
      const url = `http://127.0.0.1:${address.port}`
      await db.setting.upsert({ where: { key: moduleKey }, create: { key: moduleKey, value: '{"enabled":true,"settings":{}}' }, update: { value: '{"enabled":true,"settings":{}}' } })
      const meta = await (await admin.post('/api/admin/repository/client', { headers, data: { op: 'meta', url } })).json()
      const connected = await admin.post('/api/admin/repository/client', { headers, data: { op: 'connect', url, fingerprint: meta.fingerprint } })
      expect(connected.status(), await connected.text()).toBe(200)
      pending = admin.post('/api/admin/repository/client', { headers, data: { op: 'install', slug: id } })
      let timer!: ReturnType<typeof setTimeout>
      try { await Promise.race([downloading, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('compiled client did not request download')), 10_000) })]) } finally { clearTimeout(timer) }
      if (change === 'module-disabled') await db.setting.update({ where: { key: moduleKey }, data: { value: '{"enabled":false,"settings":{}}' } })
      else if (change === 'disconnected') await db.setting.deleteMany({ where: { key: configKey } })
      else {
        const current = JSON.parse((await db.setting.findUniqueOrThrow({ where: { key: configKey } })).value)
        current.publicKey = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString()
        await db.setting.update({ where: { key: configKey }, data: { value: JSON.stringify(current) } })
      }
      releaseDownload()
      const result = await pending
      expect(result.status(), await result.text()).toBe(change === 'module-disabled' ? 404 : 409)
      expect(await db.setting.findUnique({ where: { key: packageKey } })).toBeNull()
      for (const key of [receiptKey, indexKey]) expect(await db.setting.findUnique({ where: { key } })).toEqual(originals.get(key))
      expect(await db.auditLog.count({ where: { action: 'repository.client.install', targetId: id } })).toBe(0)
    } finally {
      releaseDownload()
      await pending?.catch(() => undefined)
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
      try {
        await db.setting.upsert({ where: { key: moduleKey }, create: { key: moduleKey, value: '{"enabled":true,"settings":{}}' }, update: { value: '{"enabled":true,"settings":{}}' } })
        expect((await admin.post('/api/admin/repository/client', { headers, data: { op: 'disconnect' } })).status()).toBe(200)
      } finally {
        await db.auditLog.deleteMany({ where: { targetType: 'repository', requestId: id } })
        await db.setting.deleteMany({ where: { key: packageKey } })
        for (const [key, row] of originals) {
          if (row) await db.setting.upsert({ where: { key }, create: { key, value: row.value }, update: { value: row.value } })
          else await db.setting.deleteMany({ where: { key } })
        }
        await db.$disconnect()
      }
    }
  })
}
