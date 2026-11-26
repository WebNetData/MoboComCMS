const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')

const url = new URL(process.env.DATABASE_URL)
assert.match(url.pathname, /test|check/i, 'use an isolated test database')
const db = new PrismaClient()
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  'next-auth/jwt': { getToken: async ({ req }) => ({ uid: req.headers.get('x-fixture-user'), authAt: Date.now() }) },
  '@/platform/config/env': { authSecret: () => 'crm-follow-up-fixture-only' },
})
const { GET, POST, PATCH } = load('src/modules/livechat/server/http/crm-follow-ups.ts')
const { tehranDay } = load('src/shared/time/day.ts')
const { erasePersonalRows } = load('src/modules/identity/server/erasure/personal.ts')
const stamp = randomUUID().slice(0, 12)
const ids = [], roleIds = []

function call(method, actor, userId, body) {
  const handler = { GET, POST, PATCH }[method]
  return handler(new NextRequest(`http://localhost/api/admin/crm/follow-ups?userId=${userId}`, {
    method, headers: { Origin: 'http://localhost', 'x-fixture-user': String(actor.id), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }))
}

async function person(name, data = {}) {
  const user = await db.user.create({ data: { name, email: `${stamp}-${name}@example.invalid`, passwordHash: '!', ...data } })
  ids.push(user.id)
  return user
}

async function main() {
  const role = await db.role.create({ data: { name: stamp, permissions: 'tickets.handle' } })
  roleIds.push(role.id)
  const manager = await person('manager', { role: 'ADMIN' })
  const a = await person('support-a', { role: 'ADMIN', roleId: role.id })
  const b = await person('support-b', { role: 'ADMIN', roleId: role.id })
  const customer = await person('customer')
  const other = await person('other')
  const fields = { title: 'پیگیری خصوصی آزمایشی', dueDay: tehranDay() }
  assert.equal((await call('GET', customer, customer.id)).status, 403)
  assert.equal((await call('GET', manager, 2_147_483_648)).status, 400)
  assert.equal((await call('POST', a, customer.id, { ...fields, dueDay: '2027-02-30' })).status, 400)
  assert.equal((await call('POST', a, customer.id, { ...fields, assigneeId: b.id })).status, 403)
  assert.equal((await call('POST', manager, customer.id, { ...fields, assigneeId: other.id })).status, 409)
  const first = await call('POST', a, customer.id, fields)
  assert.equal(first.status, 201)
  const one = await first.json()
  const listed = await call('GET', a, customer.id)
  assert.equal(listed.headers.get('cache-control'), 'private, no-store')
  assert.equal((await listed.json()).rows[0].assigneeId, a.id)
  assert.equal((await call('PATCH', b, customer.id, { ...one, status: 'DONE' })).status, 403)
  assert.equal((await call('PATCH', manager, other.id, { ...one, status: 'DONE' })).status, 404)
  const changed = await call('PATCH', manager, customer.id, { ...fields, ...one, title: 'عنوان ویرایش‌شده', assigneeId: b.id })
  assert.equal(changed.status, 200)
  const two = await changed.json()
  assert.equal((await call('PATCH', b, customer.id, { ...one, status: 'DONE' })).status, 409)
  const racing = await Promise.all(['DONE', 'CANCELLED'].map(status => call('PATCH', b, customer.id, { ...two, status })))
  assert.deepEqual(racing.map(response => response.status).sort(), [200, 409])
  const closed = await db.crmFollowUp.findUniqueOrThrow({ where: { id: one.id } })
  assert.equal(closed.assigneeId, b.id)
  assert.equal(closed.version, 3)
  assert.equal(closed.title, 'عنوان ویرایش‌شده')
  const audit = await db.auditLog.findMany({ where: { action: { startsWith: 'crm.follow_up.' }, targetId: String(customer.id) } })
  assert.equal(audit.length, 3)
  assert(audit.every(row => !row.metadata.includes(fields.title) && !row.metadata.includes(closed.title)))
  await db.$transaction(tx => erasePersonalRows(tx, b.id))
  const transferred = await db.crmFollowUp.findUniqueOrThrow({ where: { id: one.id } })
  assert.equal(transferred.assigneeId, null)
  assert.equal(transferred.version, 4)
  await db.$transaction(async tx => {
    await tx.user.update({ where: { id: customer.id }, data: { erasedAt: new Date() } })
    await erasePersonalRows(tx, customer.id)
  })
  assert.equal(await db.crmFollowUp.count({ where: { userId: customer.id } }), 0)
  assert.equal((await call('GET', manager, customer.id)).status, 404)
  assert.equal((await call('POST', manager, customer.id, fields)).status, 404)
  console.log('CRM follow-ups PostgreSQL passed: access, assignment, date validation, concurrent claims, audit privacy and erasure')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await db.crmFollowUp.deleteMany({ where: { userId: { in: ids } } })
    await db.auditLog.deleteMany({ where: { actorUserId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
    await db.role.deleteMany({ where: { id: { in: roleIds } } })
  } finally { await db.$disconnect() }
})
