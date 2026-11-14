// Read-only workdesk composition against disposable PostgreSQL fixtures.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable test database required')

const db = new PrismaClient()
const stamp = `workdesk-${Date.now().toString(36)}`
const userIds = [], roleIds = [], formIds = [], ticketIds = [], departmentSlugs = []
let viewer = null, storeDisabled = false, capturedStoreScope = null
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  react: { ...require('react'), cache: fn => fn },
  'next-auth/jwt': { getToken: async () => viewer ? { uid: viewer.id, authAt: new Date().toISOString() } : null },
  '@/extensions/server/modules': { moduleGuard: async id => id === 'store' && storeDisabled ? new Response(null, { status: 404 }) : null },
  '@/modules/store/server/orders': { adminOrders: async (_input, scope) => {
    capturedStoreScope = scope
    return { total: 1, orders: [{ id: 901, customer: { name: 'Fixture buyer' }, preview: [{ name: 'Fixture item' }], createdAt: new Date(), assigneeId: scope.manager ? null : scope.actorId }] }
  } },
})
const workdesk = load('src/modules/reporting/server/workdesk.ts')
const api = load('src/modules/reporting/server/http/admin/workdesk/route.ts')

async function user(label, permissions) {
  const role = await db.role.create({ data: { name: `${stamp}-${label}`, permissions } })
  roleIds.push(role.id)
  const row = await db.user.create({ data: { name: label, email: `${stamp}-${label}@example.invalid`, passwordHash: 'fixture-only', role: 'ADMIN', roleId: role.id } })
  userIds.push(row.id)
  return { ...row, roleRef: { permissions } }
}

async function main() {
  try {
    const handler = await user('handler', 'forms.handle,tickets.handle,store.orders.handle')
    const colleague = await user('colleague', 'forms.handle,tickets.handle,store.orders.handle')
    const manager = await user('manager', 'cms.pages,forms.handle,tickets.handle,tickets.departments.manage,orders.manage')
    const wrongSection = await user('magazine-only', 'cms.posts')

    const form = await db.siteForm.create({ data: { slug: `${stamp}-form`, title: 'Fixture repair', published: true, settings: JSON.stringify({ handlers: [handler.id] }) } })
    formIds.push(form.id)
    const ownAnswer = await db.formSubmission.create({ data: { formId: form.id, data: '[]', stage: 'OPEN', assigneeId: handler.id } })
    const colleagueAnswer = await db.formSubmission.create({ data: { formId: form.id, data: '[]', stage: 'OPEN', assigneeId: colleague.id } })

    const department = await db.ticketDepartment.create({ data: { slug: `${stamp.slice(0, 20).toUpperCase()}_OPS`, nameFa: 'Fixture', nameEn: 'Fixture', roleIds: JSON.stringify([handler.roleId, manager.roleId]) } })
    departmentSlugs.push(department.slug)
    const ownTicket = await db.ticket.create({ data: { userId: handler.id, subject: `${stamp} own`, department: department.slug, assignedToId: handler.id } })
    const colleagueTicket = await db.ticket.create({ data: { userId: handler.id, subject: `${stamp} held`, department: department.slug, assignedToId: colleague.id } })
    ticketIds.push(ownTicket.id, colleagueTicket.id)

    const req = new NextRequest('http://localhost/api/admin/workdesk')
    assert.equal((await api.GET(req)).status, 403, 'guest has no day view')
    viewer = handler
    const scoped = await workdesk.adminWorkdesk(req)
    const response = await api.GET(req)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /no-store/)
    const formQueue = scoped.find((queue) => queue.key === 'forms')
    const supportQueue = scoped.find((queue) => queue.key === 'support')
    assert.equal(formQueue.available, true)
    assert.deepEqual(formQueue.items.map((item) => item.id), [String(ownAnswer.id)], 'Forms includes only the assigned handler’s work')
    assert.equal(formQueue.count, 1)
    assert.equal(supportQueue.available, true)
    assert.deepEqual(supportQueue.items.map((item) => item.id), [String(ownTicket.id)], 'Support excludes work held by another agent')
    assert.deepEqual(capturedStoreScope, { actorId: handler.id, manager: false }, 'Store owner receives actor-scoped work visibility')
    const custom = await db.formSubmission.create({ data: { formId: form.id, data: '[{"value":"private-answer"}]', secrets: 'private-lock', stage: 'DIAGNOSING', assigneeId: handler.id } })
    await db.formSubmission.create({ data: { formId: form.id, data: '[]', stage: 'OPEN', payStatus: 'UNPAID', amountMinor: 100n, currency: 'IRT' } })
    const extended = (await workdesk.adminWorkdesk(req)).find(queue => queue.key === 'forms')
    assert.equal(extended.count, 2, 'custom active stages are included and unpaid work is excluded')
    assert(extended.items.some(item => item.id === String(custom.id)))
    assert(!JSON.stringify(extended).includes('private-'), 'summary never reads or projects form answers and locks')

    viewer = wrongSection
    const denied = await workdesk.adminWorkdesk(req)
    assert.ok(denied.every((queue) => !queue.available), 'unrelated section permission exposes no queue')

    viewer = manager
    const managed = await workdesk.adminWorkdesk(req)
    assert.ok(managed.find((queue) => queue.key === 'support').items.some((item) => item.id === String(colleagueTicket.id)), 'department manager may see colleague-held tickets')
    assert.deepEqual(capturedStoreScope, { actorId: manager.id, manager: true }, 'Store manager keeps the owner’s manager scope')

    viewer = handler
    storeDisabled = true
    const disabled = await workdesk.adminWorkdesk(req)
    assert.deepEqual(disabled.find((queue) => queue.key === 'store'), { key: 'store', available: false, reason: 'disabled' }, 'disabled Store is unavailable, not an empty queue')
    console.log('PASS workdesk PostgreSQL fixtures: Forms handler assignment, Support department and held-ticket scope, Store owner scope, unrelated permission denial, disabled-module state')
  } finally {
    await db.formSubmission.deleteMany({ where: { formId: { in: formIds } } })
    await db.siteForm.deleteMany({ where: { id: { in: formIds } } })
    await db.ticket.deleteMany({ where: { id: { in: ticketIds } } })
    await db.ticketDepartment.deleteMany({ where: { slug: { in: departmentSlugs } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.role.deleteMany({ where: { id: { in: roleIds } } })
    await db.$disconnect()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
