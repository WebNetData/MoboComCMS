const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')

if (!/test_/.test(new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid').pathname)) {
  throw new Error('Disposable database required')
}

const db = new PrismaClient()
const stamp = 'ai-management-' + randomUUID()
const disabled = new Set()
const actor = { id: 7, email: 'manager@example.invalid', role: 'ADMIN', roleId: 42, permissions: ['tickets.handle'] }
let current = actor
let changesDuringModel = false
let rejectDepartment = false
let providerCalls = 0
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  '@/extensions/server/modules': { isModuleEnabled: async id => !disabled.has(id) },
  '@/modules/identity/server/access': {
    requireAdmin: async () => current,
    currentAdminHasPermission: (user, permission) => user.permissions.includes(permission),
  },
  '@/modules/support/server/department-access': {
    allowedDepartmentSlugs: async () => {
      if (rejectDepartment) throw new Error('fixture data source unavailable')
      return [stamp]
    },
  },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }) },
  '@/platform/audit/server': { auditAdmin: async () => {} },
  '../admin-context': { withPersonalAi: async (_id, fn) => fn() },
  '../client': {
    generate: async ({ user }) => {
      providerCalls++
      assert.deepEqual(JSON.parse(user).map(row => [row.id, row.count]), [['support.stale', 1]])
      assert.ok(!user.includes(stamp))
      if (changesDuringModel) current = { ...actor, permissions: [] }
      return { model: 'fixture', text: '{"advice":[{"signalId":"support.stale","text":"مسئول پیگیری را بررسی کنید."}]}' }
    },
    AiError: class extends Error {},
  },
})

const { GET, POST } = load('src/modules/ai/server/http/management.ts')
const { managementAdvice } = load('src/modules/ai/domain/management.ts')
const { listOpportunities } = load('src/modules/livechat/server/crm-opportunities/index.ts')
const site = 'https://mobocom.invalid'
const request = (body, origin = site) => new NextRequest(site + '/api/admin/ai/management',
  body === undefined ? {} : { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function main() {
  const user = await db.user.create({ data: { email: stamp + '@example.invalid', passwordHash: '!' } })
  const staff = await db.user.create({ data: { email: stamp + '-staff@example.invalid', passwordHash: '!', role: 'ADMIN' } })
  const colleague = await db.user.create({ data: { email: stamp + '-colleague@example.invalid', passwordHash: '!', role: 'ADMIN' } })
  actor.id = staff.id
  try {
    const updatedAt = new Date(Date.now() - 2 * 86_400_000)
    await db.ticket.createMany({ data: [
      { userId: user.id, department: stamp, subject: stamp, status: 'OPEN', updatedAt },
      { userId: user.id, department: stamp + '-other', subject: stamp + '-private', status: 'OPEN', updatedAt },
      { userId: user.id, department: stamp, subject: stamp, status: 'CLOSED', updatedAt },
      { userId: user.id, department: stamp, subject: stamp, status: 'OPEN' },
    ] })
    const response = await GET(request())
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    const report = await response.json()
    assert.deepEqual(report.sections.map(section => [section.id, section.state, section.signals[0].count]), [
      ['support', 'attention', 1],
      ['crm', 'clear', 0],
    ])
    assert.ok(!JSON.stringify(report).includes(stamp))

    const old = new Date(Date.now() - 15 * 86_400_000)
    await db.crmOpportunity.createMany({ data: [
      { userId: user.id, assigneeId: staff.id, title: stamp, stageChangedAt: old },
      { userId: user.id, assigneeId: colleague.id, title: stamp + '-colleague', stageChangedAt: old },
      { userId: user.id, title: stamp + '-unassigned', stageChangedAt: old },
      { userId: user.id, assigneeId: staff.id, title: stamp + '-recent' },
      { userId: user.id, assigneeId: staff.id, title: stamp + '-closed', stage: 'LOST', closedAt: old, stageChangedAt: old },
    ] })
    async function checkSales(expectedCount, owner) {
      const result = await (await GET(request())).json()
      const crm = result.sections.find(section => section.id === 'crm')
      const signal = crm.signals.find(item => item.id === 'crm.sales-stale')
      assert.equal(crm.state, 'attention')
      assert.equal(signal.count, expectedCount)
      assert.equal(signal.destination.href, '/admin/crm/opportunities?stale=1&owner=' + owner)
      assert.ok(!JSON.stringify(crm).includes(stamp))
      const board = await listOpportunities(current, { owner, stale: true, page: 1 })
      assert.equal(board.stats.stale, signal.count)
      assert.equal(board.rows.length, signal.count)
    }
    await checkSales(1, 'mine')
    current = { ...actor, permissions: [...actor.permissions, 'users.manage'] }
    await checkSales(3, 'all')
    current = actor
    disabled.add('livechat')
    assert.deepEqual((await (await GET(request())).json()).sections.map(section => section.id), ['support'])
    disabled.delete('livechat')

    rejectDepartment = true
    const partial = await (await GET(request())).json()
    assert.equal(partial.sections[0].state, 'unavailable')
    assert.deepEqual(partial.sections[0].signals, [])
    rejectDepartment = false
    assert.equal((await POST(request({ section: 'pay' }))).status, 403)
    assert.equal((await POST(request({ section: 'support' }, 'https://other.invalid'))).status, 403)
    assert.equal((await POST(request({ section: 'new' }))).status, 422)
    assert.equal(providerCalls, 0)
    const advice = await POST(request({ section: 'support' }))
    assert.equal(advice.status, 200)
    assert.equal((await advice.json()).advice[0].signalId, 'support.stale')
    changesDuringModel = true
    assert.equal((await POST(request({ section: 'support' }))).status, 409)
    current = null
    assert.equal((await GET(request())).status, 403)
    disabled.add('ai-assistant')
    assert.equal((await GET(request())).status, 404)
    assert.throws(() => managementAdvice('{"advice":[{"signalId":"foreign","text":"test"}]}', new Set(['support.stale'])))
    assert.throws(() => managementAdvice('{"advice":[{"signalId":"support.stale","text":"<img>"}]}', new Set(['support.stale'])))
    console.log('Management report: CRM scope and board parity, department filter, partial failure, cache, module, origin, grounded responses and permission changes verified')
  } finally {
    await db.ticket.deleteMany({ where: { userId: user.id } })
    await db.user.delete({ where: { id: user.id } })
    await db.user.deleteMany({ where: { id: { in: [staff.id, colleague.id] } } })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
