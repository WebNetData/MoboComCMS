import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { test, expect } from '../helpers'

for (const mode of ['same', 'distinct', 'legacy', 'shortfall'] as const) {
  test(`repository actual buyer purchase ${mode} retains one payment obligation`, async ({ playwright, baseURL }) => {
    test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443' || !process.env.NEXTAUTH_SECRET, 'requires disposable compiled fixture')
    const db = new PrismaClient(), id = `e2e-purchase-${randomUUID()}`, snapshots = new Map<string, { key: string; value: string } | null>()
    let userId = 0, productId = 0, buyer: Awaited<ReturnType<typeof playwright.request.newContext>> | undefined
    try {
      for (const key of ['repository.vendor.v1', 'extension.repository.state.v1']) snapshots.set(key, await db.setting.findUnique({ where: { key } }))
      for (const [key, value] of [['repository.vendor.v1', '{"enabled":true,"name":"owned fixture"}'], ['extension.repository.state.v1', '{"enabled":true,"settings":{}}']]) await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
      const user = await db.user.create({ data: { email: `${id}@example.invalid`, passwordHash: 'owned fixture', role: 'CUSTOMER' } }); userId = user.id
      const product = await db.repoProduct.create({ data: { slug: id, name: id, currency: 'IRT', priceMinor: 123n, active: true } }); productId = product.id
      const starting = mode === 'distinct' ? 150n : mode === 'shortfall' ? 100n : mode === 'legacy' ? 377n : 500n
      await db.walletAccount.create({ data: { userId, currency: 'IRT', balanceMinor: starting } })
      const token = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { uid: String(userId), sub: String(userId), role: user.role, authAt: Date.now() } })
      buyer = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL!, 'x-forwarded-for': `10.128.${Math.floor(userId / 250) % 250}.${userId % 250 + 1}` }, storageState: { cookies: [{ name: '__Secure-next-auth.session-token', value: token, domain: new URL(baseURL!).hostname, path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }], origins: [] } })
      const requestId = 'owned-purchase-12345', buy = (key: string) => buyer!.post('/api/repo/mine', { data: { op: 'buy', productId, requestId: key } })
      if (mode === 'legacy') await db.walletTx.create({ data: { userId, amount: -123, amountMinor: -123n, balanceAfter: 377, balanceAfterMinor: 377n, currency: 'IRT', type: 'PURCHASE', status: 'DONE', idempotencyKey: `repo:buy:${userId}:${productId}:${requestId}` } })
      const before = await db.walletTx.findMany({ where: { userId }, orderBy: { id: 'asc' } })
      if (mode === 'same' || mode === 'distinct') {
        const responses = await Promise.all([buy(requestId), buy(mode === 'same' ? requestId : `${requestId}-other`)])
        expect(responses.map(x => x.status()).sort()).toEqual(mode === 'same' ? [200, 200] : [200, 402])
        if (mode === 'same') expect((await responses[0].json()).licenseId).toBe((await responses[1].json()).licenseId)
        expect(await db.repoLicense.count({ where: { userId, productId } })).toBe(1)
        expect(await db.walletTx.count({ where: { userId } })).toBe(1)
        expect((await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId, currency: 'IRT' } } })).balanceMinor).toBe(mode === 'same' ? 377n : 27n)
        expect((await db.repoProduct.findUniqueOrThrow({ where: { id: productId } })).sold).toBe(1)
        const mine = await (await buyer.get('/api/repo/mine')).json(), granted = mine.licenses.find((x: { productId: number }) => x.productId === productId)
        expect(granted.key).toMatch(/^MBC-/)
        expect((await db.repoLicense.findUniqueOrThrow({ where: { id: granted.id } })).keyEnc).not.toBe(granted.key)
      } else {
        const response = await buy(requestId); expect(response.status(), await response.text()).toBe(mode === 'legacy' ? 409 : 402)
        expect(await db.walletTx.findMany({ where: { userId }, orderBy: { id: 'asc' } })).toEqual(before)
        expect(await db.repoLicense.count({ where: { userId, productId } })).toBe(0)
        expect((await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId, currency: 'IRT' } } })).balanceMinor).toBe(starting)
        expect((await db.repoProduct.findUniqueOrThrow({ where: { id: productId } })).sold).toBe(0)
      }
    } finally {
      try {
        if (productId) await db.repoProduct.deleteMany({ where: { id: productId, slug: id } })
        if (userId) { await db.walletTx.deleteMany({ where: { userId } }); await db.walletAccount.deleteMany({ where: { userId } }); await db.user.deleteMany({ where: { id: userId, email: `${id}@example.invalid` } }) }
      } finally {
        try { for (const [key, row] of snapshots) { if (row) await db.setting.upsert({ where: { key }, create: { key, value: row.value }, update: { value: row.value } }); else await db.setting.deleteMany({ where: { key } }) } }
        finally { await buyer?.dispose(); await db.$disconnect() }
      }
    }
  })
}
