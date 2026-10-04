// Docker-local existing JWT/Profile/Admin contracts; remove only namespaced users/role.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt')
const db = new PrismaClient(), base = 'http://localhost:3000', seed = `iac${Date.now().toString(36)}`
const users = []; let role
async function main() {
  role = await db.role.create({ data: { name: seed, permissions: 'cms.products' } })
  const customer = await db.user.create({ data: { email: `${seed}-customer@example.invalid`, passwordHash: 'test-only' } }); users.push(customer.id)
  const staff = await db.user.create({ data: { email: `${seed}-staff@example.invalid`, passwordHash: 'test-only', role: 'ADMIN', roleId: role.id, totpEnabledAt: new Date('2026-01-01') } }); users.push(staff.id)
  const superAdmin = await db.user.create({ data: { email: `${seed}-super@example.invalid`, passwordHash: 'test-only', role: 'ADMIN', totpEnabledAt: new Date('2026-01-01') } }); users.push(superAdmin.id)
  const authAt = Date.now()
  const token = (user, secret = process.env.NEXTAUTH_SECRET) => encode({ secret, token: { uid: String(user.id), sub: String(user.id), email: user.email, role: 'ADMIN', authAt } })
  const request = (route, cookie) => fetch(base + route, { headers: cookie ? { cookie: `next-auth.session-token=${cookie}` } : {}, signal: AbortSignal.timeout(60000) })
  const customerToken = await token(customer), staffToken = await token(staff), superToken = await token(superAdmin)
  assert.equal((await request('/api/profile')).status, 401)
  let response = await request('/api/profile', customerToken); assert.equal(response.status, 200); assert.equal((await response.json()).id, customer.id)
  assert.equal((await request('/api/profile', await token(customer, 'invalid-fixture-signing-secret'))).status, 401)
  assert.equal((await request('/api/admin/cms?type=products', customerToken)).status, 403, 'database customer role wins over ADMIN JWT claim')
  assert.equal((await request('/api/admin/cms?type=products', staffToken)).status, 200)
  assert.equal((await request('/api/admin/settings', staffToken)).status, 403)
  assert.equal((await request('/api/admin/settings', superToken)).status, 200, 'legacy no-role super-admin remains supported')
  await db.role.update({ where: { id: role.id }, data: { permissions: '' } })
  assert.equal((await request('/api/admin/cms?type=products', staffToken)).status, 403, 'empty custom role does not become super-admin')
  await db.user.update({ where: { id: customer.id }, data: { status: 'BANNED' } }); assert.equal((await request('/api/profile', customerToken)).status, 401)
  await db.user.update({ where: { id: customer.id }, data: { status: 'ACTIVE', passwordChangedAt: new Date(authAt + 60000) } }); assert.equal((await request('/api/profile', customerToken)).status, 401)
  console.log('Identity PostgreSQL/API: startup-compatible JWT, guest/bad-signature rejection, current DB role/status/permission checks, empty custom role denial, legacy super-admin and password revocation passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } })
  if (role) await db.role.delete({ where: { id: role.id } })
  await db.$disconnect()
})
