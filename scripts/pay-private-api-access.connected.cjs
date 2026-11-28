const assert = require('node:assert/strict')
const { randomBytes, randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { NextRequest } = require('next/server')

assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/mobocom_pay_test_/)
process.env.NEXTAUTH_SECRET = randomBytes(32).toString('hex')
process.env.NEXTAUTH_URL = 'https://pay-fixture.invalid'
const origin = process.env.NEXTAUTH_URL
const db = new PrismaClient()
const stamp = randomUUID()
const users = []
let merchant, previous
let payEnabled = true
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  '@/extensions/server/modules': { isModuleEnabled: async () => payEnabled },
  '@/modules/account/server/section-access': { userOpensSection: async () => true },
  react: { ...require('react'), cache: callback => callback },
})
const { GET, POST, DELETE } = load('src/modules/identity/server/http/keys/route.ts')
const { resolveApiCaller } = load('src/modules/public-api/server/api-keys.ts')

async function fixture(name, role = 'CUSTOMER') {
  const user = await db.user.create({ data: { email: `${stamp}-${name}@example.invalid`, passwordHash: '!', role } })
  users.push(user.id)
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id), authAt: Date.now() } })
  return { id: user.id, token }
}

function request(actor, method = 'GET', suffix = '', from = origin) {
  const headers = { 'content-type': 'application/json', cookie: `__Secure-next-auth.session-token=${actor.token}` }
  if (from) headers.origin = from
  return new NextRequest(origin + '/api/keys' + suffix, {
    method, headers, ...(method === 'POST' ? { body: JSON.stringify({ name: 'fixture' }) } : {}),
  })
}

async function main() {
  const regular = await fixture('regular')
  const owner = await fixture('merchant')
  const admin = await fixture('admin', 'ADMIN')
  previous = await db.setting.findUnique({ where: { key: 'publicApiEnabled' } })
  await db.setting.upsert({ where: { key: 'publicApiEnabled' }, create: { key: 'publicApiEnabled', value: 'true' }, update: { value: 'true' } })
  merchant = await db.payMerchant.create({ data: { id: randomUUID(), userId: owner.id, name: stamp, website: 'https://merchant.invalid', status: 'ACTIVE' } })

  assert.equal((await GET(request(regular))).status, 404)
  assert.equal((await POST(request(regular, 'POST'))).status, 404)
  assert.equal((await GET(request(admin))).status, 200)
  assert.equal((await POST(request(owner, 'POST', '', null))).status, 403)
  assert.equal((await POST(request(owner, 'POST', '', 'https://other.invalid'))).status, 403)
  const created = await POST(request(owner, 'POST'))
  assert.equal(created.status, 201)
  assert.match(created.headers.get('cache-control'), /no-store/)
  const { key } = await created.json()
  const listed = await GET(request(owner))
  assert.equal(listed.status, 200)
  assert.equal((await listed.json()).keys[0].token, undefined)
  assert.equal((await DELETE(request(admin, 'DELETE', '?id=' + key.id))).status, 404)
  assert.equal((await DELETE(request(regular, 'DELETE', '?id=' + key.id))).status, 404)
  const previousKey = await db.apiKey.create({ data: { userId: regular.id, name: 'existing', token: randomBytes(32).toString('hex') } })
  assert.equal((await DELETE(request(regular, 'DELETE', '?id=' + previousKey.id))).status, 200)

  const bearer = new NextRequest(origin + '/api/v2/pay/payments', { headers: { authorization: `Bearer ${key.token}` } })
  assert.equal((await resolveApiCaller(bearer)).userId, owner.id)
  await db.user.update({ where: { id: owner.id }, data: { sessionsRevokedAt: new Date(Date.now() + 1000) } })
  assert.equal(await resolveApiCaller(request(owner)), null)
  await db.user.update({ where: { id: owner.id }, data: { sessionsRevokedAt: null, status: 'PENDING' } })
  assert.equal(await resolveApiCaller(bearer), null)
  await db.user.update({ where: { id: owner.id }, data: { status: 'ACTIVE' } })
  payEnabled = false
  assert.equal((await GET(request(owner))).status, 404)
  payEnabled = true
  assert.equal((await DELETE(request(owner, 'DELETE', '?id=' + key.id))).status, 200)
  assert.equal(await resolveApiCaller(bearer), null)
  console.log('Personal keys: browser eligibility, owner-only revocation, no-store, one-time reveal, Origin and current standing passed')
}

main().finally(async () => {
  await db.apiKey.deleteMany({ where: { userId: { in: users } } })
  if (merchant) await db.payMerchant.delete({ where: { id: merchant.id } })
  await db.user.deleteMany({ where: { id: { in: users } } })
  if (previous) await db.setting.update({ where: { key: previous.key }, data: { value: previous.value } })
  else if (previous === null) await db.setting.deleteMany({ where: { key: 'publicApiEnabled' } })
  await db.$disconnect()
}).catch(error => { console.error(error); process.exitCode = 1 })
