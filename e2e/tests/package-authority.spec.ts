import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { test, expect, watchErrors } from '../helpers'
import { writeZip } from '../../src/modules/packages/domain/zip'

test('package management uses current canonical permissions and signed session standing', async ({ admin, browser, baseURL }) => {
  test.skip(process.env.MOBOCOM_ISOLATED_FIXTURE !== '1' || baseURL !== 'https://e2e.mobocom.test:3443', 'requires disposable compiled PostgreSQL fixture')
  const db = new PrismaClient(), id = `e2e-pkg-auth-${Date.now().toString(36)}`
  const role = await db.role.create({ data: { name: id, permissions: 'settings.manage' } })
  const actor = await db.user.create({ data: { email: id + '@example.invalid', passwordHash: 'owned fixture', role: 'ADMIN', roleId: role.id } })
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } })
  const sign = async (authAt: number) => context.addCookies([{ name: '__Secure-next-auth.session-token', value: await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { uid: String(actor.id), sub: String(actor.id), role: 'ADMIN', authAt } }), url: baseURL! }])
  try {
    await sign(Date.now() - 5000)
    const manifest = { id, name: id, kind: 'plugin', runtime: 'declarative', version: '1.0.0' }
    expect((await admin.post('/api/admin/packages', { multipart: { file: { name: 'owned.zip', mimeType: 'application/zip', buffer: writeZip(new Map([['manifest.json', Buffer.from(JSON.stringify(manifest))]])) } } })).status()).toBe(200)
    const page = await context.newPage(), errors = watchErrors(page)
    await page.goto(`/admin/extensions/editor?package=${id}`)
    await expect(page.getByRole('textbox', { name: 'manifest.json', exact: true })).toHaveValue(JSON.stringify(manifest))
    expect(errors).toEqual([])
    const patch = () => context.request.patch(`/api/admin/packages/${id}`, { data: { enabled: true } })
    expect((await patch()).status()).toBe(200)
    const key = `package.${id}.v1`, original = await db.setting.findUniqueOrThrow({ where: { key } })
    const unchanged = async () => expect(await db.setting.findUniqueOrThrow({ where: { key } })).toEqual(original)
    await db.role.update({ where: { id: role.id }, data: { permissions: 'dashboard.view' } })
    expect((await patch()).status()).toBe(403)
    await unchanged()
    await db.role.update({ where: { id: role.id }, data: { permissions: 'settings.manage' } })
    await db.user.update({ where: { id: actor.id }, data: { status: 'SUSPENDED' } })
    expect((await patch()).status()).toBe(403)
    await unchanged()
    await db.user.update({ where: { id: actor.id }, data: { status: 'ACTIVE' } })
    const denial = await db.accessRestriction.create({ data: { userId: actor.id, scope: 'GLOBAL', effectKey: 'identity.suspend', capabilities: '["identity.authenticate"]', reason: 'owned browser fixture', startsAt: new Date(Date.now() - 1000) } })
    expect((await patch()).status()).toBe(403)
    await unchanged()
    await db.accessRestriction.update({ where: { id: denial.id }, data: { revokedAt: new Date(), revocationReason: 'owned recovery' } })
    await db.user.update({ where: { id: actor.id }, data: { passwordChangedAt: new Date() } })
    expect((await patch()).status()).toBe(403)
    await unchanged()
    await sign(Date.now())
    expect((await patch()).status()).toBe(200)
    expect((await db.auditLog.findFirstOrThrow({ where: { targetType: 'package', targetId: id, actorUserId: actor.id }, orderBy: { id: 'desc' } })).action).toBe('package.enable')
  } finally {
    await context.close()
    await admin.delete(`/api/admin/packages/${id}`)
    await db.auditLog.deleteMany({ where: { targetType: 'package', targetId: id } })
    await db.accessRestriction.deleteMany({ where: { userId: actor.id } })
    await db.user.deleteMany({ where: { id: actor.id, email: actor.email } })
    await db.role.deleteMany({ where: { id: role.id, name: id } })
    await db.$disconnect()
  }
})
