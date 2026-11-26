const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')

assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'use an isolated test database')
const db = new PrismaClient()
const stamp = randomUUID().slice(0, 12)
const userIds = [], roleIds = []
let enabled = true
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  react: { ...require('react'), cache: fn => fn },
  'next-auth/jwt': { getToken: async ({ req }) => ({ uid: req.headers.get('x-fixture-user'), authAt: Date.now() }) },
  '@/platform/config/env': { authSecret: () => 'crm-follow-up-queue-fixture-only' },
  '@/extensions/server/modules': {
    moduleGuard: async id => id === 'livechat' && !enabled ? new Response(null, { status: 404 }) : null,
    isModuleEnabled: async id => id !== 'forms',
  },
  '@/modules/store/server/orders': { adminOrders: async () => ({ total: 0, orders: [] }) },
})
const { GET_QUEUE, PATCH } = load('src/modules/livechat/server/http/crm-follow-ups.ts')
const workdesk = load('src/modules/reporting/server/http/admin/workdesk/route.ts')
const { tehranDay } = load('src/shared/time/day.ts')

async function person(label, permissions, fields) {
  let roleId
  if (permissions) {
    const role = await db.role.create({ data: { name: `${stamp}-${label}`, permissions } })
    roleIds.push(role.id)
    roleId = role.id
  }
  const record = await db.user.create({ data: {
    email: `${stamp}-${label}@example.invalid`, name: label, passwordHash: '!',
    ...(roleId ? { roleId, role: 'ADMIN' } : {}), ...fields,
  } })
  userIds.push(record.id)
  return record
}

function request(actor, path, data) {
  return new NextRequest(`http://localhost/api/admin/${path}`, {
    method: data ? 'PATCH' : 'GET',
    headers: { Origin: 'http://localhost', 'x-fixture-user': String(actor?.id ?? ''), 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}),
  })
}

const mine = (actor, query = '') => GET_QUEUE(request(actor, `crm/follow-ups/queue?${query}`))
const dashboard = async actor => (await (await workdesk.GET(request(actor, 'workdesk'))).json()).queues.find(q => q.key === 'crm')

async function main() {
  const a = await person('a', 'tickets.handle')
  const b = await person('b', 'support.chat')
  const manager = await person('manager', 'users.manage')
  const wrong = await person('wrong', 'cms.posts')
  const buyer = await person('buyer')
  const erased = await person('erased', null, { erasedAt: new Date() })
  const now = new Date()
  const today = tehranDay(now), past = tehranDay(new Date(now.getTime() - 2 * 86400000)), future = tehranDay(new Date(now.getTime() + 2 * 86400000))
  const create = (title, dueDay, assigneeId, extra) =>
    db.crmFollowUp.create({ data: { title: stamp + ':' + title, userId: buyer.id, dueDay, assigneeId, ...extra } })
  const overdue = await create('overdue', past, a.id)
  const current = await create('today', today, a.id)
  const upcoming = await create('upcoming', future, a.id)
  const colleague = await create('colleague', today, b.id)
  const unassigned = await create('unassigned', today, null)
  await create('closed', past, a.id, { status: 'DONE' })
  await create('private', past, a.id, { userId: erased.id })
  await create('staff-as-customer', past, a.id, { userId: b.id })
  for (let i = 0; i < 20; i++) await create(`page-${i}`, future, a.id)

  assert.equal((await mine(null)).status, 403)
  assert.equal((await mine(buyer)).status, 403)
  assert.equal((await mine(wrong)).status, 403)
  assert.equal((await mine(a, 'scope=all')).status, 403)
  assert.equal((await mine(a, `scope=${b.id}`)).status, 403)
  assert.equal((await mine(manager, `scope=${buyer.id}`)).status, 400)
  assert.equal((await mine(a, 'bucket=invalid')).status, 400)
  const response = await mine(a)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const first = await response.json()
  assert.deepEqual(first.counts, { overdue: 1, today: 1, upcoming: 21 })
  assert.equal(first.pageCount, 2)
  assert.equal(first.items.length, 20)
  assert.deepEqual(first.items.slice(0, 3).map(row => row.id), [overdue.id, current.id, upcoming.id])
  const second = await (await mine(a, 'page=2')).json()
  assert.equal(second.items.length, 3)
  assert(second.items.every(row => !first.items.some(candidate => candidate.id === row.id)))
  const ownToday = await (await mine(a, 'bucket=today')).json()
  assert.deepEqual(ownToday.items.map(row => row.id), [current.id])
  assert.deepEqual(ownToday.staff, [])
  const scoped = await (await mine(manager, `scope=${b.id}`)).json()
  assert.deepEqual(scoped.items.map(row => row.id), [colleague.id])
  assert(!scoped.staff.some(person => person.id === wrong.id))
  const managerToday = await (await mine(manager, 'scope=all&bucket=today')).json()
  const fixtureItems = managerToday.items.filter(row => row.title.startsWith(stamp))
  assert.deepEqual(fixtureItems.map(row => row.id), [current.id, colleague.id, unassigned.id])
  assert.deepEqual((await (await mine(manager, 'scope=unassigned')).json()).items.filter(row => row.title.startsWith(stamp)).map(row => row.id), [unassigned.id])
  assert.equal((await (await mine(manager)).json()).items.length, 0)
  const summary = await dashboard(a)
  assert.equal(summary.count, 23)
  assert.deepEqual(summary.due, first.counts)
  assert.equal(summary.items.length, 5)
  assert(summary.items.every(row => row.assigneeId === a.id && row.href.endsWith('#follow-ups-heading')))
  assert.equal(await dashboard(wrong), undefined)

  const route = `crm/follow-ups?userId=${buyer.id}`
  const done = { id: current.id, version: current.version, status: 'DONE' }
  assert.equal((await PATCH(request(b, route, done))).status, 403)
  assert.equal((await PATCH(request(a, route, done))).status, 200)
  assert.equal((await PATCH(request(a, route, done))).status, 409)
  assert.equal((await db.crmFollowUp.findUniqueOrThrow({ where: { id: current.id } })).status, 'DONE')
  assert.equal((await (await mine(a, 'bucket=today')).json()).items.length, 0)
  assert.equal(await db.auditLog.count({ where: { action: 'crm.follow_up.update', targetId: String(buyer.id) } }), 1)
  enabled = false
  assert.equal((await mine(a)).status, 404)
  assert.equal(await dashboard(a), undefined)
  console.log('CRM follow-up queue passed: private scopes, Tehran dates, stable paging, dashboard composition, versioned completion and module off.')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await db.crmFollowUp.deleteMany({ where: { userId: { in: userIds } } })
    await db.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.role.deleteMany({ where: { id: { in: roleIds } } })
  } finally { await db.$disconnect() }
})
