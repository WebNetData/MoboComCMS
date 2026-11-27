const assert = require('node:assert/strict')
const { randomUUID, randomBytes } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const { encode } = require('next-auth/jwt')

if (!/test_/.test(new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid').pathname)) throw new Error('Disposable database required')
process.env.NEXTAUTH_SECRET = randomBytes(32).toString('hex')
process.env.NEXTAUTH_URL = 'https://mobocom.invalid'
const db = new PrismaClient()
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  react: { ...require('react'), cache: fn => fn },
})
const { GET, POST } = load('src/modules/ai/server/http/management-reviews.ts')
const { runManagementReviews } = load('src/modules/ai/server/management-review.ts')
const { clearAdminPolicyCache } = load('src/modules/identity/server/access.ts')
const origin = process.env.NEXTAUTH_URL
const stamp = 'review-' + randomUUID()
const snapshots = new Map()
const ownerIds = []
const roles = []

async function fixture(label) {
  const role = await db.role.create({ data: { name: stamp + label, permissions: 'tickets.handle' } })
  roles.push(role.id)
  const user = await db.user.create({ data: { email: stamp + label + '@example.invalid', role: 'ADMIN', roleId: role.id, passwordHash: '!' } })
  ownerIds.push(user.id)
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(user.id), authAt: Date.now() } })
  const request = (body, from = origin) => new NextRequest(origin + '/api/admin/ai/management/reviews', {
    method: body ? 'POST' : 'GET', headers: { origin: from, 'content-type': 'application/json', cookie: '__Secure-next-auth.session-token=' + token },
    ...(body && { body: JSON.stringify(body) }),
  })
  return { role, user, request }
}

async function main() {
  try {
    for (const [key, value] of [
      ['security.policy.v1', '{"requireAdmin2fa":false}'], ['extension.ai-assistant.state.v1', '{"enabled":true,"settings":{}}'],
      ['extension.livechat.state.v1', '{"enabled":true,"settings":{}}'],
    ]) {
      snapshots.set(key, await db.setting.findUnique({ where: { key } }))
      await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
    }
    clearAdminPolicyCache()
    const owner = await fixture('-owner'), other = await fixture('-other')
    const customer = await db.user.create({ data: { email: stamp + '-customer@example.invalid', passwordHash: '!' } })
    ownerIds.push(customer.id)
    const department = await db.ticketDepartment.create({ data: { slug: stamp, nameFa: stamp, nameEn: stamp, roleIds: JSON.stringify([owner.role.id]) } })
    await db.ticket.create({ data: { userId: owner.user.id, subject: 'private fixture', department: stamp, updatedAt: new Date(Date.now() - 172800000) } })
    await db.crmOpportunity.create({ data: {
      userId: customer.id, assigneeId: owner.user.id, title: stamp, stageChangedAt: new Date(Date.now() - 15 * 86400000),
    } })
    const command = body => POST(owner.request(body))

    assert.equal((await POST(owner.request({ action: 'snapshot' }, 'https://else.invalid'))).status, 403)
    assert.equal((await command({ action: 'schedule', cadence: 'DAILY', version: 0 })).status, 200)
    assert.equal((await command({ action: 'schedule', cadence: 'WEEKLY', version: 0 })).status, 409)
    const now = new Date()
    const due = new Date(now.getTime() - 60000)
    await db.aiManagementSchedule.update({ where: { ownerId: owner.user.id }, data: { nextRunAt: due } })
    const outcomes = await Promise.all([runManagementReviews(now), runManagementReviews(now)])
    assert.equal(outcomes.reduce((sum, item) => sum + item.completed, 0), 1)
    const history = await (await GET(owner.request())).json()
    assert.equal(history.reviews.length, 1)
    assert.equal(history.reviews[0].findings[0].count, 1)
    assert.equal(history.reviews[0].findings[0].id, 'support.stale')
    const sales = history.reviews[0].findings.find(finding => finding.id === 'crm.sales-stale')
    assert.equal(sales.count, 1)
    assert.equal(sales.href, '/admin/crm/opportunities?stale=1&owner=mine')
    assert.ok(!JSON.stringify(sales).includes(stamp))
    assert.equal(history.nextRunAt, new Date(now.getTime() + 86400000).toISOString())
    assert.equal((await (await GET(other.request())).json()).reviews.length, 0)
    const review = history.reviews[0]
    const decision = { action: 'decide', id: review.id, version: review.version, signalId: 'support.stale', decision: 'APPROVED' }
    assert.equal((await POST(other.request(decision))).status, 404)
    assert.equal((await command({ ...decision, decision: 'DONE', outcome: 'tested' })).status, 409)
    assert.equal((await command(decision)).status, 200)
    assert.equal((await command(decision)).status, 409)
    const done = await command({ ...decision, version: review.version + 1, decision: 'DONE', outcome: 'پاسخ بررسی شد' })
    assert.equal(done.status, 200)
    assert.equal((await done.json()).reviews[0].findings[0].outcome, 'پاسخ بررسی شد')
    assert.equal(await db.auditLog.count({ where: { actorUserId: owner.user.id, action: 'ai.management.decision' } }), 2)

    await db.ticketDepartment.update({ where: { id: department.id }, data: { roleIds: '[]' } })
    assert.equal((await (await GET(owner.request())).json()).reviews.length, 0)
    assert.equal((await command({ ...decision, version: review.version + 2 })).status, 404)
    await db.aiManagementSchedule.update({ where: { ownerId: owner.user.id }, data: { nextRunAt: now } })
    await db.user.update({ where: { id: owner.user.id }, data: { sessionsRevokedAt: new Date(Date.now() + 1000) } })
    assert.equal((await runManagementReviews()).completed, 0)
    assert.equal((await db.aiManagementSchedule.findUniqueOrThrow({ where: { ownerId: owner.user.id } })).cadence, 'OFF')
    assert.equal(await db.aiManagementReview.count({ where: { ownerId: owner.user.id } }), 1)
    assert.equal((await POST(other.request({ action: 'snapshot' }))).status, 200)
    console.log('AI review schedule and claims, retries, ownership, revoked scope, decision audit and session revocation passed')
  } finally {
    await db.ticket.deleteMany({ where: { department: stamp } })
    await db.ticketDepartment.deleteMany({ where: { slug: stamp } })
    await db.auditLog.deleteMany({ where: { actorUserId: { in: ownerIds }, action: { startsWith: 'ai.management.' } } })
    await db.user.deleteMany({ where: { id: { in: ownerIds } } })
    await db.role.deleteMany({ where: { id: { in: roles } } })
    for (const [key, row] of snapshots) {
      if (row) await db.setting.update({ where: { key }, data: { value: row.value } })
      else await db.setting.deleteMany({ where: { key } })
    }
    await db.$disconnect()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
