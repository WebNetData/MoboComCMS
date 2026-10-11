import { createServer } from 'node:http'
import { generateKeyPairSync, sign } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { test, expect } from '../helpers'
import { buildCertificate, canonicalJson } from '../../src/modules/repository/domain/repository'

for (const op of ['activate', 'deactivate', 'refresh'] as const) for (const change of ['unrelated', 'replacement'] as const) {
  test(`repository ${op} preserves ${change} license changes during HTTP`, async ({ admin, baseURL }) => {
    test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'requires disposable compiled fixture')
    const db = new PrismaClient(), id = `e2e-license-map-${Date.now().toString(36)}`, headers = { 'x-request-id': id }
    const configKey = 'repository.client.v1', moduleKey = 'extension.repository.state.v1', licenseKey = 'repository.licenses.v1'
    const originals = new Map<string, { key: string; value: string } | null>()
    for (const key of [configKey, moduleKey, licenseKey]) originals.set(key, await db.setting.findUnique({ where: { key } }))
    const pair = generateKeyPairSync('ed25519'), publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    let delayed = false, arrived!: () => void, release!: () => void
    const downloading = new Promise<void>(resolve => { arrived = resolve }), gate = new Promise<void>(resolve => { release = resolve })
    const server = createServer(async (req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.url?.includes('/meta')) { res.end(JSON.stringify({ name: id, publicKey })); return }
      const chunks: Buffer[] = []; for await (const part of req) chunks.push(Buffer.from(part))
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (delayed) { arrived(); await gate }
      const certificate = buildCertificate({ licenseId: 12345, product: input.slug, site: input.site, status: 'ACTIVE', updatesUntil: new Date(Date.now() + 86400000), now: new Date() })
      res.end(JSON.stringify({ certificate, signature: sign(null, Buffer.from(canonicalJson(certificate)), pair.privateKey).toString('base64url') }))
    })
    let pending: ReturnType<typeof admin.post> | undefined
    try {
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const address = server.address(); if (!address || typeof address === 'string') throw Error('fixture did not bind')
      const url = `http://127.0.0.1:${address.port}`
      for (const [key, value] of [[moduleKey, '{"enabled":true,"settings":{}}'], [licenseKey, '{}']]) await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
      const meta = await (await admin.post('/api/admin/repository/client', { headers, data: { op: 'meta', url } })).json()
      expect((await admin.post('/api/admin/repository/client', { headers, data: { op: 'connect', url, fingerprint: meta.fingerprint } })).status()).toBe(200)
      expect((await admin.post('/api/admin/repository/client', { headers, data: { op: 'activate', slug: id, key: 'MBC-AAAAA-AAAAA-AAAAA-AAAAA' } })).status()).toBe(200)
      delayed = true
      pending = admin.post('/api/admin/repository/client', { headers, data: { op, slug: id, key: 'MBC-BBBBB-BBBBB-BBBBB-BBBBB' } })
      let timer!: ReturnType<typeof setTimeout>
      try { await Promise.race([downloading, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('compiled command did not contact vendor')), 10000) })]) } finally { clearTimeout(timer) }
      const map = JSON.parse((await db.setting.findUniqueOrThrow({ where: { key: licenseKey } })).value)
      const other = { ...map[id], certificate: { ...map[id].certificate, product: `${id}-other` } }
      if (change === 'unrelated') map[`${id}-other`] = other
      else map[id] = { ...map[id], keyEnc: 'MBC-CCCCC-CCCCC-CCCCC-CCCCC' }
      await db.setting.update({ where: { key: licenseKey }, data: { value: JSON.stringify(map) } })
      release()
      const result = await pending, denied = change === 'replacement' && op !== 'refresh'
      expect(result.status(), await result.text()).toBe(denied ? 409 : 200)
      const current = JSON.parse((await db.setting.findUniqueOrThrow({ where: { key: licenseKey } })).value)
      if (change === 'replacement') expect(current).toEqual(map)
      else {
        expect(current[`${id}-other`]).toEqual(other)
        if (op === 'deactivate') expect(current[id]).toBeUndefined()
      }
      expect(await db.auditLog.count({ where: { requestId: id, action: `repository.client.${op}` } })).toBe((op === 'activate' ? 1 : 0) + (denied ? 0 : 1))
      if (op === 'deactivate' && change === 'unrelated') {
        expect((await admin.post('/api/admin/repository/client', { headers, data: { op, slug: id } })).status()).toBe(200)
        expect(JSON.parse((await db.setting.findUniqueOrThrow({ where: { key: licenseKey } })).value)).toEqual(current)
        expect(await db.auditLog.count({ where: { requestId: id, action: 'repository.client.deactivate' } })).toBe(2)
      }
    } finally {
      release(); await pending?.catch(() => undefined)
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
      try { expect((await admin.post('/api/admin/repository/client', { headers, data: { op: 'disconnect' } })).status()).toBe(200) }
      finally {
        await db.auditLog.deleteMany({ where: { targetType: 'repository', requestId: id } })
        for (const [key, row] of originals) {
          if (row) await db.setting.upsert({ where: { key }, create: { key, value: row.value }, update: { value: row.value } })
          else await db.setting.deleteMany({ where: { key } })
        }
        await db.$disconnect()
      }
    }
  })
}
