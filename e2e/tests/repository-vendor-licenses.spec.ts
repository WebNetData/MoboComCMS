import { PrismaClient } from '@prisma/client'
import { test, expect } from '../helpers'

for (const op of ['grant', 'status', 'extend', 'site', 'concurrent'] as const) {
  test(`repository vendor license ${op} preserves committed rows and success audit`, async ({ admin, baseURL }) => {
    test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'requires disposable compiled fixture')
    const db = new PrismaClient(), id = `e2e-vendor-${Date.now().toString(36)}`, headers = { 'x-request-id': id }, moduleKey = 'extension.repository.state.v1'
    const moduleBefore = await db.setting.findUnique({ where: { key: moduleKey } })
    let productId: number | undefined
    try {
      await db.setting.upsert({ where: { key: moduleKey }, create: { key: moduleKey, value: '{"enabled":true,"settings":{}}' }, update: { value: '{"enabled":true,"settings":{}}' } })
      const product = await db.repoProduct.create({ data: { slug: id, name: id, siteLimit: 2, supportDays: 30 } }); productId = product.id
      const base = new Date(Date.now() + 10 * 86400000)
      const license = await db.repoLicense.create({ data: { productId, keyHash: id, keyEnc: id, keyLast4: 'owned', updatesUntil: base } })
      const activation = await db.repoActivation.create({ data: { licenseId: license.id, site: 'owned.invalid', active: true } })
      const invoke = (days = 2) => admin.post('/api/admin/repository', { headers, data: { op: `license.${op === 'concurrent' ? 'extend' : op}`, id: license.id, productId, email: 'owned@example.invalid', status: 'REVOKED', days, site: 'https://owned.invalid' } })
      let grantedKey = ''
      if (op === 'concurrent') {
        const responses = await Promise.all([invoke(2), invoke(3)])
        for (const response of responses) expect(response.status(), await response.text()).toBe(200)
        expect((await db.repoLicense.findUniqueOrThrow({ where: { id: license.id } })).updatesUntil?.getTime()).toBe(base.getTime() + 5 * 86400000)
      } else {
        const response = await invoke(); expect(response.status(), await response.text()).toBe(200)
        if (op === 'grant') {
          const result = await response.json(); grantedKey = result.key
          expect(grantedKey).toMatch(/^MBC-/)
          const stored = await db.repoLicense.findUniqueOrThrow({ where: { id: result.id } })
          expect(stored.keyEnc).not.toBe(grantedKey); expect(stored.source).toBe('GRANT'); expect(stored.productId).toBe(productId)
          expect(await db.repoLicense.count({ where: { productId } })).toBe(2)
        }
        if (op === 'status') expect((await db.repoLicense.findUniqueOrThrow({ where: { id: license.id } })).status).toBe('REVOKED')
        if (op === 'extend') expect((await db.repoLicense.findUniqueOrThrow({ where: { id: license.id } })).updatesUntil?.getTime()).toBe(base.getTime() + 2 * 86400000)
        if (op === 'site') expect((await db.repoActivation.findUniqueOrThrow({ where: { id: activation.id } })).active).toBe(false)
      }
      const audits = await db.auditLog.findMany({ where: { requestId: id, action: `repository.license.${op === 'concurrent' ? 'extend' : op}` } })
      expect(audits).toHaveLength(op === 'concurrent' ? 2 : 1)
      if (grantedKey) expect(JSON.stringify(audits)).not.toContain(grantedKey)
    } finally {
      try {
        await db.auditLog.deleteMany({ where: { requestId: id, targetType: 'repository' } })
        if (productId) await db.repoProduct.deleteMany({ where: { id: productId, slug: id } })
        if (moduleBefore) await db.setting.upsert({ where: { key: moduleKey }, create: { key: moduleKey, value: moduleBefore.value }, update: { value: moduleBefore.value } })
        else await db.setting.deleteMany({ where: { key: moduleKey } })
      } finally { await db.$disconnect() }
    }
  })
}
