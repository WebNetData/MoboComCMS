// Production workflow owners against disposable PostgreSQL; the provider is an in-memory double.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const { encode } = require('next-auth/jwt')
assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable test database required')
const db = new PrismaClient(), stamp = `smsflow-${crypto.randomUUID()}`, secret = crypto.randomBytes(32).toString('hex')
const savedEnv = { PANEL_CREDENTIAL_KEY: process.env.PANEL_CREDENTIAL_KEY, STORE_DELIVERY_KEY: process.env.STORE_DELIVERY_KEY }
process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex')
process.env.STORE_DELIVERY_KEY = crypto.randomBytes(32).toString('hex')
const phones = Array.from({ length: 4 }, () => `+989${String(crypto.randomInt(0, 1000000000)).padStart(9, '0')}`)
let calls = [], before, last, formId, submissionId, owned = false
const users = [], roles = [], notificationIds = [], broadcastJobs = []
const mockProvider = async (...args) => { calls.push(args); return { ok: true, id: '12345', error: '' } }
const mocks = {
  '@/platform/database/prisma': { db }, '@/platform/config/env': { authSecret: () => secret },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/modules/settings/server': { getSettings: async () => ({ siteUrl: 'http://site.invalid' }) },
  '@/platform/http/rate-limit': { rateLimitStrict: async () => ({ ok: true }) },
  '@/extensions/server/modules': { isModuleEnabled: async () => true, getModuleStates: async () => ({}) },
  '@/modules/sms/server/ippanel': { sendText: mockProvider, sendPattern: mockProvider, credit: async () => { throw Error('unexpected credit') } },
  react: { ...require('react'), cache: fn => fn },
}
const loader = require('./connected-source-loader.cjs')
const load = loader(mocks), sms = load('src/modules/sms/server/sms.ts')
const stages = load('src/modules/forms/server/stage-sms.ts'), forms = load('src/modules/forms/server/paid.ts')
const inbox = load('src/modules/notifications/server/inbox.ts'), broadcast = load('src/modules/sms/server/broadcast.ts')
const api = load('src/modules/sms/server/http/admin.ts')
async function user(label, phone, permissions) {
  let roleId = null
  if (permissions) { const role = await db.role.create({ data: { name: `${stamp}-${label}`, permissions } }); roles.push(role.id); roleId = role.id }
  const row = await db.user.create({ data: { name: label, email: `${stamp}-${label}@example.invalid`, passwordHash: 'fixture-only', role: permissions ? 'ADMIN' : 'CUSTOMER', roleId, phone: phone || '', phoneVerifiedAt: phone ? new Date() : null, smsAlerts: !!phone } })
  users.push(row.id); return row
}
async function config(change = {}) {
  const current = await sms.getSmsConfig(), visible = sms.publicSmsConfig(current)
  await sms.saveSmsConfig({ ...visible, ...change, revision: visible.revision })
  last = (await db.setting.findUniqueOrThrow({ where: { key: 'sms.config.v1' } })).value
}
async function request(handler, method, viewer, query = '', body, origin = 'http://site.invalid') {
  const headers = { 'Content-Type': 'application/json', host: 'site.invalid' }
  if (origin) headers.Origin = origin
  if (viewer) headers.cookie = `next-auth.session-token=${await encode({ secret, token: { uid: viewer.id, authAt: new Date().toISOString() } })}`
  const response = await handler(new NextRequest(`http://site.invalid/api/admin/sms${query}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }))
  return { status: response.status, body: await response.json() }
}
async function main() {
  before = await db.setting.findUnique({ where: { key: 'sms.config.v1' } })
  assert.equal(await db.user.count({ where: { phone: { in: phones } } }), 0)
  assert.equal(await db.smsLog.count({ where: { phone: { in: phones } } }), 0)
  // Broadcast must not enqueue for unrelated people in a reused database.
  assert.equal(await db.user.count({ where: { status: 'ACTIVE', smsAlerts: true, phoneVerifiedAt: { not: null } } }), 0, 'broadcast fixture requires no unrelated opted-in users')
  owned = true
  const manager = await user('manager', null, 'dashboard.view,settings.manage')
  const software = await user('software', null, 'dashboard.view,software.manage')
  const customer = await user('customer', phones[0]), other = await user('other', phones[1])
  await config({ enabled: true, apiKey: stamp, fromNumber: '3000505', events: { ...(await sms.getSmsConfig()).events, FORM_STAGE: { enabled: true, text: '{message}', pattern: '' }, ORDER_STATUS: { enabled: true, text: '{title} {name}', pattern: '' } } })
  const workflow = [{ key: 'OPEN', label: 'Open' }, { key: 'REPAIRING', label: 'Repair', sms: true, message: `Ready {code} ${stamp}` }, { key: 'WAITING', label: 'Waiting', sms: true, message: `Waiting {code} ${stamp}` }]
  const form = await db.siteForm.create({ data: { slug: stamp, title: stamp, settings: JSON.stringify({ workflow }) } }); formId = form.id
  const data = JSON.stringify([{ id: 'name', type: 'text', value: 'Fixture' }, { id: 'mobile', type: 'mobile', value: phones[0] }])
  const row = await db.formSubmission.create({ data: { formId, data, stage: 'OPEN', pickupCode: '738291', receiptToken: stamp } }); submissionId = row.id
  const job = async () => db.backgroundJob.findFirstOrThrow({ where: { kind: 'forms.stage-sms', dedupeKey: { startsWith: `form-stage:${row.id}:` } }, orderBy: { id: 'desc' } })
  const deliver = j => stages.deliverFormStageSms(JSON.parse(j.payload), { id: j.id, attempts: 1 })
  await forms.workOnSubmission(row.id, manager, { stage: 'REPAIRING' }, true)
  const first = await job(); assert.equal((await db.formSubmission.findUniqueOrThrow({ where: { id: row.id } })).stage, 'REPAIRING')
  assert(!first.payload.includes('738291')); assert(!first.payload.includes(phones[0])); assert.equal(calls.length, 0)
  assert.equal((await deliver(first)).delivery, 'SENT'); assert.equal((await deliver(first)).delivery, 'SENT'); assert.equal(calls.length, 1)
  await forms.workOnSubmission(row.id, manager, { stage: 'WAITING' }, true)
  const second = await job(); assert.notEqual(first.id, second.id)
  await db.formSubmission.update({ where: { id: row.id }, data: { pickupCode: '111222' } }); assert.equal((await deliver(second)).skipped, 'changed')
  await db.formSubmission.update({ where: { id: row.id }, data: { pickupCode: '738291', data: data.replace(phones[0], phones[2]) } }); assert.equal((await deliver(second)).skipped, 'changed')
  await db.formSubmission.update({ where: { id: row.id }, data: { data, userId: customer.id } })
  await db.user.update({ where: { id: customer.id }, data: { smsAlerts: false } })
  await forms.workOnSubmission(row.id, manager, { stage: 'REPAIRING' }, true)
  const third = await job(); assert.equal((await deliver(third)).skipped, 'preference')
  await db.user.update({ where: { id: customer.id }, data: { smsAlerts: true } })
  await config({ events: { ...(await sms.getSmsConfig()).events, FORM_STAGE: { enabled: false, text: '{message}', pattern: '' } } })
  assert.equal((await deliver(third)).skipped, 'disabled'); assert.equal(calls.length, 1)
  const failLoad = loader({ ...mocks, '@/modules/operations/server/enqueue': { enqueue: async () => { throw Error('synthetic enqueue failure') } } })
  await assert.rejects(failLoad('src/modules/forms/server/paid.ts').workOnSubmission(row.id, manager, { stage: 'WAITING' }, true), /synthetic enqueue failure/)
  assert.equal((await db.formSubmission.findUniqueOrThrow({ where: { id: row.id } })).stage, 'REPAIRING'); assert.equal((await job()).id, third.id)
  const notice = await db.userNotification.create({ data: { userId: customer.id, kind: 'ORDER_STATUS', dedupeKey: stamp, titleEn: stamp, titleFa: stamp, href: '/' } }); notificationIds.push(notice.id)
  assert.equal((await inbox.deliverInboxCopy(notice.id, 'sms', { attempts: 1 })).delivery, 'SENT')
  await db.user.update({ where: { id: customer.id }, data: { name: 'changed', phone: phones[2] } })
  await config({ events: { ...(await sms.getSmsConfig()).events, ORDER_STATUS: { enabled: true, text: 'Changed {title}', pattern: '' } } })
  assert.equal((await inbox.deliverInboxCopy(notice.id, 'sms', { attempts: 2 })).delivery, 'SENT'); assert.equal(calls.length, 2)
  await assert.rejects(sms.notifyUserEventResult({ ...notice, userId: other.id }, { deliveryKey: `notification:${notice.id}:sms` }), e => e.status === 409)
  const beforeBroadcast = calls.length
  const queued = await sms.broadcast({ to: 'verified', text: stamp }); assert.equal(queued.queued, 2); assert.equal(calls.length, beforeBroadcast)
  const jobs = await db.backgroundJob.findMany({ where: { kind: 'sms.broadcast', createdAt: { gte: notice.createdAt } } }); broadcastJobs.push(...jobs.map(j => j.id)); assert.equal(jobs.length, 2)
  for (const j of jobs) assert(!j.payload.includes(stamp) && !j.payload.includes(phones[1]))
  const sealed = load('src/modules/catalog/server/digital-delivery.ts')
  const byUser = Object.fromEntries(jobs.map(j => [JSON.parse(sealed.decryptDigitalDelivery(JSON.parse(j.payload).sealed)).userId, j]))
  await db.user.update({ where: { id: other.id }, data: { smsAlerts: false } })
  assert.equal((await broadcast.deliverBroadcast(JSON.parse(byUser[other.id].payload), 1)).status, 'SKIPPED')
  assert.equal((await broadcast.deliverBroadcast(JSON.parse(byUser[customer.id].payload), 1)).status, 'SENT')
  assert.equal((await broadcast.deliverBroadcast(JSON.parse(byUser[customer.id].payload), 2)).status, 'SENT'); assert.equal(calls.length, beforeBroadcast + 1)
  const report = await request(api.GET, 'GET', manager, `?phone=${encodeURIComponent(phones[0])}&pageSize=10&page=1`)
  assert.equal(report.status, 200); assert(report.body.pagination.total >= 1); assert(!JSON.stringify(report.body.log).includes('738291'))
  const page2 = await request(api.GET, 'GET', manager, `?phone=${encodeURIComponent(phones[0])}&pageSize=10&page=2`)
  assert.equal(page2.status, 200); assert.equal(page2.body.pagination.page, 2); assert.equal(page2.body.pagination.total, report.body.pagination.total)
  assert.equal((await request(api.GET, 'GET', manager, '?pageSize=9')).status, 400)
  assert.equal((await request(api.GET, 'GET', software)).status, 403); assert.equal((await request(api.GET, 'GET', null)).status, 403)
  for (const method of ['PUT', 'POST']) assert.equal((await request(api[method], method, manager, '', {}, null)).status, 403)
  assert.equal((await request(api.POST, 'POST', manager, '', { action: 'broadcast', to: 'verified', text: stamp })).status, 400)
  console.log('PASS SMS workflow connected checks')
}
main().finally(async () => {
  try {
    if (owned) {
      if (submissionId) await db.backgroundJob.deleteMany({ where: { dedupeKey: { startsWith: `form-stage:${submissionId}:` } } })
      const ownNotices = await db.userNotification.findMany({ where: { userId: { in: users } }, select: { id: true } })
      for (const notice of ownNotices) await db.backgroundJob.deleteMany({ where: { dedupeKey: { startsWith: `notification:${notice.id}:` } } })
      // If an assertion interrupted the broadcast before collection, identify only our sealed fixtures.
      const pending = await db.backgroundJob.findMany({ where: { kind: 'sms.broadcast' } })
      const decrypt = load('src/modules/catalog/server/digital-delivery.ts').decryptDigitalDelivery
      for (const item of pending) { try { if (users.includes(JSON.parse(decrypt(JSON.parse(item.payload).sealed)).userId)) broadcastJobs.push(item.id) } catch {} }
      await db.backgroundJob.deleteMany({ where: { id: { in: broadcastJobs } } })
      await db.smsLog.deleteMany({ where: { OR: [{ phone: { in: phones } }, { userId: { in: users } }] } })
      await db.userNotification.deleteMany({ where: { userId: { in: users } } })
      if (formId) await db.siteForm.deleteMany({ where: { id: formId } })
      await db.auditLog.deleteMany({ where: { actorUserId: { in: users } } })
      await db.user.deleteMany({ where: { id: { in: users } } }); await db.role.deleteMany({ where: { id: { in: roles } } })
    }
    if (last !== undefined) { const result = before ? await db.setting.updateMany({ where: { key: 'sms.config.v1', value: last }, data: { value: before.value } }) : await db.setting.deleteMany({ where: { key: 'sms.config.v1', value: last } }); assert.equal(result.count, 1, 'settings changed concurrently; preserve them') }
  } finally { for (const [key, value] of Object.entries(savedEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value; await db.$disconnect() }
}).catch(error => { console.error(error); process.exitCode = 1 })
