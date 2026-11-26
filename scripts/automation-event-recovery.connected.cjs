const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const url = new URL(process.env.DATABASE_URL)
assert.match(url.pathname, /test|check/i, 'use an isolated test database')
const db = new PrismaClient()
const stamp = 'auto-review-' + randomUUID()
const keys = []
let failUser = 0
let expireId = 0
const deliveries = []
const subjectKey = { startsWith: stamp + ':' }
const scopeEvents = ({ args, query }) => query({ ...args, where: { ...args.where, subjectKey } })
const dataReader = db.$extends({ query: {
  user: { async findUnique({ args, query }) {
    if (args.where.id === failUser) throw new Error('Synthetic preparation failure')
    return query(args)
  } },
  automationEvent: { findMany: scopeEvents, updateMany: scopeEvents, deleteMany: scopeEvents, count: scopeEvents },
  automationRule: { findMany: ({ args, query }) => query({ ...args, where: { ...args.where, name: stamp } }) },
  automationRun: { deleteMany: ({ args, query }) => query({ ...args, where: { ...args.where, rule: { name: stamp } } }) },
} })
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db: dataReader },
  '@/modules/automation/server/availability': { automationAvailable: async () => true, assertAutomationAvailable: async () => {} },
  '@/extensions/server/modules': { isModuleEnabled: async () => true, moduleGuard: async () => null },
  '@/modules/identity/server/access': { requirePerm: async (req, permission) => permission === 'automation.manage' && req.headers.get('x-fixture') === 'authorized' ? { id: 1 } : null },
  '@/platform/observability/logger': { logEvent: () => {} },
  '@/modules/settings/server': { getSettings: async () => ({}) },
  '@/modules/notifications/server/inbox': { createInboxEvent: async input => {
    deliveries.push(input)
    if (expireId && input.titleFa === 'stale:one') await db.automationEvent.update({ where: { id: expireId }, data: { leaseExpiresAt: new Date(0) } })
  } },
  '@/modules/mail/server/mailer': { sendMail: async () => { throw Error('No provider allowed') } },
  '@/modules/sms/server/sms': { getSmsConfig: async () => ({}), sendSms: async () => { throw Error('No provider allowed') } },
})
const { processAutomation } = load('src/modules/automation/server/engine.ts')
const { GET } = load('src/modules/automation/server/http/admin.ts')
const users = []
let rule
const get = id => db.automationEvent.findUniqueOrThrow({ where: { id } })
const ruleActions = ['one','two'].map(suffix => ({ type: 'notify_user', params: { title: `{probe}:${suffix}`, text: 'Fixture', href: '/dashboard' } }))
async function main() {
  const user = await db.user.create({ data: { email: stamp + '@example.invalid', passwordHash: '!' } })
  users.push(user.id)
  const origin = new Date(Date.now() - 60_000)
  rule = await db.automationRule.create({ data: { name: stamp, trigger: 'order.paid', actions: JSON.stringify(ruleActions), createdAt: origin } })
  async function event(probe, properties = {}) {
    const row = await db.automationEvent.create({ data: {
      name: 'order.paid', subjectKey: `${stamp}:${probe}`, userId: user.id, payload: JSON.stringify({ probe }), ...properties,
    } })
    keys.push(row.id)
    return row.id
  }
  const old = new Date(0)
  const pre = await event('pre', { leaseToken: 'dead-worker', leaseExpiresAt: old })
  const post = await event('post', { leaseToken: 'dead-worker', leaseExpiresAt: old, effectStartedAt: old })
  const receipt = await event('receipt', { name: 'crm.engagement.queued', dedupeKey: stamp, processedAt: old })
  await Promise.all([processAutomation(), processAutomation()])
  assert((await get(pre)).processedAt)
  assert.deepEqual(deliveries.map(row => row.titleFa), ['pre:one', 'pre:two'])
  assert.equal((await get(post)).processingError, 'EFFECT_LEASE_EXPIRED')
  assert((await get(post)).needsReviewAt)
  assert.equal((await get(receipt)).processedAt.getTime(), 0)
  assert.equal((await get(receipt)).needsReviewAt, null)

  const failed = await event('failure')
  failUser = user.id
  await processAutomation()
  const wait = await get(failed)
  assert.equal(wait.processedAt, null)
  assert.equal(wait.effectStartedAt, null)
  assert(wait.leaseExpiresAt.getTime() > Date.now())
  failUser = 0
  await db.automationEvent.update({ where: { id: failed }, data: { leaseExpiresAt: old } })
  await processAutomation()
  assert((await get(failed)).processedAt)

  expireId = await event('stale')
  await processAutomation()
  await processAutomation()
  assert((await get(expireId)).needsReviewAt)
  assert.deepEqual(deliveries.filter(row => row.titleFa.startsWith('stale:')).map(row => row.titleFa), ['stale:one'])

  const url = 'http://localhost/api/admin/automation'
  assert.equal((await GET(new NextRequest(url))).status, 403)
  const response = await GET(new NextRequest(url, { headers: { 'x-fixture': 'authorized' } }))
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const { recovery } = await response.json()
  assert.equal(recovery.needsReview, 2)
  assert.deepEqual(recovery.recent.map(row => row.id).sort(), [post, expireId].sort())
  assert.deepEqual(Object.keys(recovery.recent[0]).sort(), ['id', 'name', 'needsReviewAt', 'processingError'])
  console.log('PostgreSQL engine: recovered untouched work, quarantined possible effects, fenced later actions, retained CRM receipts.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await db.automationEvent.deleteMany({ where: { id: { in: keys } } })
    if (rule) await db.automationRule.delete({ where: { id: rule.id } })
    await db.user.deleteMany({ where: { id: { in: users } } })
  } finally { await db.$disconnect() }
})
