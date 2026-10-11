import { createServer } from 'node:http'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { test, expect } from '../helpers'
import { canonicalJson, buildCertificate } from '../../src/modules/repository/domain/repository'
import { writeZip } from '../../src/modules/packages/domain/zip'

for (const change of ['module-disabled', 'disconnected', 'key-changed', 'license-removed', 'license-key-changed', 'license-updates-changed', 'license-renewed', 'license-expired-cache'] as const) {
  test(`repository install handles ${change} while its real HTTP download is pending`, async ({ admin, baseURL }) => {
    test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'requires disposable compiled fixture')
    const db = new PrismaClient(), id = `e2e-repo-admit-${Date.now().toString(36)}`
    const headers = { 'x-request-id': id }
    const paid = change.startsWith('license-'), ownedLicense = 'MBC-AAAAA-AAAAA-AAAAA-AAAAA'
    const configKey = 'repository.client.v1', moduleKey = 'extension.repository.state.v1', receiptKey = 'repository.installed.v1', licenseKey = 'repository.licenses.v1', indexKey = 'packages.index.v1', packageKey = `package.${id}.v1`
    const originals = new Map<string, { key: string; value: string } | null>()
    for (const key of [configKey, moduleKey, receiptKey, licenseKey, indexKey]) originals.set(key, await db.setting.findUnique({ where: { key } }))
    const pair = generateKeyPairSync('ed25519'), publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const archive = writeZip(new Map([['manifest.json', Buffer.from(JSON.stringify({ id, name: id, kind: 'plugin', runtime: 'declarative', version: '1.0.0' }))]]))
    const release = { slug: id, version: '1.0.0', sha256: createHash('sha256').update(archive).digest('hex'), size: archive.length }
    let arrived!: () => void, releaseDownload!: () => void
    const downloading = new Promise<void>(resolve => { arrived = resolve }), downloadGate = new Promise<void>(resolve => { releaseDownload = resolve })
    const server = createServer(async (req, res) => {
      if (req.url?.includes('/download/')) { arrived(); await downloadGate; res.writeHead(200, { 'content-type': 'application/zip' }); res.end(archive); return }
      res.setHeader('content-type', 'application/json')
      if (req.url?.includes('/licenses/activate')) {
        const chunks: Buffer[] = []; for await (const part of req) chunks.push(Buffer.from(part))
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const certificate = buildCertificate({ licenseId: 12345, product: id, site: input.site, status: 'ACTIVE', updatesUntil: new Date(Date.now() + 86400000), now: new Date() })
        res.end(JSON.stringify({ certificate, signature: sign(null, Buffer.from(canonicalJson(certificate)), pair.privateKey).toString('base64url') })); return
      }
      if (req.url?.startsWith('/api/repo/v1/meta')) res.end(JSON.stringify({ name: id, publicKey }))
      else res.end(JSON.stringify({ products: [{ slug: id, name: id, kind: 'PLUGIN', price: paid ? '1000' : '0', latest: { ...release, runtime: 'declarative', requiresCore: '', signature: sign(null, Buffer.from(canonicalJson(release)), pair.privateKey).toString('base64url') } }] }))
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
      if (paid) {
        expect((await admin.post('/api/admin/repository/client', { headers, data: { op: 'activate', slug: id, key: ownedLicense } })).status()).toBe(200)
        if (change === 'license-expired-cache') {
          const licenses = JSON.parse((await db.setting.findUniqueOrThrow({ where: { key: licenseKey } })).value)
          licenses[id].certificate.expiresAt = new Date(Date.now() - 86400000).toISOString()
          licenses[id].signature = sign(null, Buffer.from(canonicalJson(licenses[id].certificate)), pair.privateKey).toString('base64url')
          await db.setting.update({ where: { key: licenseKey }, data: { value: JSON.stringify(licenses) } })
        }
      }
      pending = admin.post('/api/admin/repository/client', { headers, data: { op: 'install', slug: id } })
      let timer!: ReturnType<typeof setTimeout>
      try { await Promise.race([downloading, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('compiled client did not request download')), 10_000) })]) } finally { clearTimeout(timer) }
      if (change === 'module-disabled') await db.setting.update({ where: { key: moduleKey }, data: { value: '{"enabled":false,"settings":{}}' } })
      else if (change === 'disconnected') await db.setting.deleteMany({ where: { key: configKey } })
      else if (change === 'key-changed') {
        const current = JSON.parse((await db.setting.findUniqueOrThrow({ where: { key: configKey } })).value)
        current.publicKey = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString()
        await db.setting.update({ where: { key: configKey }, data: { value: JSON.stringify(current) } })
      } else if (change === 'license-removed') {
        const licenses = JSON.parse((await db.setting.findUniqueOrThrow({ where: { key: licenseKey } })).value); delete licenses[id]
        await db.setting.update({ where: { key: licenseKey }, data: { value: JSON.stringify(licenses) } })
      } else if (change !== 'license-expired-cache') {
        const licenses = JSON.parse((await db.setting.findUniqueOrThrow({ where: { key: licenseKey } })).value)
        if (change === 'license-key-changed') licenses[id].keyEnc = 'MBC-BBBBB-BBBBB-BBBBB-BBBBB'
        else {
          if (change === 'license-updates-changed') licenses[id].certificate.updatesUntil = new Date(Date.now() - 86400000).toISOString()
          else licenses[id].certificate.expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
          licenses[id].signature = sign(null, Buffer.from(canonicalJson(licenses[id].certificate)), pair.privateKey).toString('base64url')
        }
        await db.setting.update({ where: { key: licenseKey }, data: { value: JSON.stringify(licenses) } })
      }
      releaseDownload()
      const result = await pending
      const allowed = change === 'license-renewed' || change === 'license-expired-cache'
      expect(result.status(), await result.text()).toBe(allowed ? 200 : change === 'module-disabled' ? 404 : change === 'license-removed' ? 403 : 409)
      if (allowed) expect(await db.setting.findUnique({ where: { key: packageKey } })).not.toBeNull()
      else {
        expect(await db.setting.findUnique({ where: { key: packageKey } })).toBeNull()
        for (const key of [receiptKey, indexKey]) expect(await db.setting.findUnique({ where: { key } })).toEqual(originals.get(key))
      }
      expect(await db.auditLog.count({ where: { action: 'repository.client.install', targetId: id } })).toBe(allowed ? 1 : 0)
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
