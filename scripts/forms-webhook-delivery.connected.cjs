// Real Forms and queue owners against disposable PostgreSQL. No network is contacted.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const sourceLoader = require('./connected-source-loader.cjs')

assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable test database required')
if (process.getuid) assert.notEqual(process.getuid(), 0, 'run connected checks as a non-root user')

const db = new PrismaClient()
const stamp = `form-hook-${crypto.randomUUID()}`
const calls = []
let behavior = async (_url, _body, _headers, options) => await options.beforeSend() ? { status: 204 } : null
let enabled = true
let formId, userId, orderId
process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex')
process.env.STORE_DELIVERY_KEY = crypto.randomBytes(32).toString('hex')

class PublicHttpsNotSentError extends Error {}
class PublicHttpsDestinationError extends Error {}

const mocks = {
  '@/platform/database/prisma': { db },
  '@/platform/config/env': { authSecret: () => 'synthetic-fixture-secret' },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/extensions/server/modules': { isModuleEnabled: async () => enabled, getModuleStates: async () => ({}) },
  '@/modules/mail/server/mailer': { sendMail: async () => ({ ok: true }) },
  '@/modules/notifications/server/inbox': { createInboxEvent: async () => ({}) },
  '@/modules/automation/server/engine': { emitAutomation: async () => {} },
  '@/platform/http/public-https-post': {
    PublicHttpsNotSentError,
    PublicHttpsDestinationError,
    publicHttpsPost: async (...args) => { calls.push(args); return behavior(...args) },
  },
  react: { ...require('react'), cache: fn => fn },
}
const load = sourceLoader(mocks)
const domain = load('src/modules/forms/domain/forms.ts')
const service = load('src/modules/forms/server/service.ts')
const hooks = load('src/modules/forms/server/webhooks')
const actorRequest = new NextRequest('https://site.invalid/api/admin/forms/webhooks', { headers: { origin: 'https://site.invalid' } })

async function main() {
  const user = await db.user.create({ data: { name: stamp, email: `${stamp}@example.invalid`, passwordHash: 'fixture-only', role: 'ADMIN' } })
  userId = user.id
  const form = await db.siteForm.create({ data: {
    slug: stamp, title: stamp, published: true,
    fields: JSON.stringify([
      { id: 'name', label: 'Name', type: 'text', required: true, options: [] },
      { id: 'secret', label: 'Secret', type: 'secret', required: true, options: [] },
    ]),
    settings: JSON.stringify({ webhooks: [{ url: 'https://fixture.example.invalid/hook?fixture=1', secret: 'fixture-signing-secret', events: ['submitted', 'paid', 'stage'] }] }),
  } })
  formId = form.id

  const actor = { id: user.id, email: user.email }
  const parsed = domain.parseForm(form)
  const fixture = { answers: { name: { label: 'Name', type: 'text', value: 'Example' } } }
  const count = () => db.formWebhookDelivery.count({ where: { formId } })
  const rows = () => db.formWebhookDelivery.findMany({ where: { formId }, orderBy: { id: 'asc' } })
  const deliver = row => hooks.deliverFormWebhook({ deliveryId: row.id, version: row.version })
  const current = row => db.formWebhookDelivery.findUniqueOrThrow({ where: { id: row.id } })

  // A transaction rollback keeps the entry, intent and job inseparable.
  await assert.rejects(db.$transaction(async tx => {
    const entry = await tx.formSubmission.create({ data: { formId, data: '[]' } })
    await hooks.queueFormWebhooks(tx, parsed, 'submitted', entry.id, 0, fixture)
    throw Error('fixture rollback')
  }), /fixture rollback/)
  assert.equal(await db.formSubmission.count({ where: { formId } }), 0)
  assert.equal(await count(), 0)

  const fault = sourceLoader({ ...mocks, '@/modules/operations/server/enqueue': { enqueue: async () => { throw Error('fixture queue failure') } } })
  await assert.rejects(fault('src/modules/forms/server/service.ts').submitForm(form.slug, { values: { name: 'Example', secret: 'failure-fixture' } }, { userId: null, ip: '192.0.2.2' }), /fixture queue failure/)
  assert.equal(await db.formSubmission.count({ where: { formId } }), 0, 'failed queue write rolls back the public submission')
  assert.equal(await count(), 0)

  // Exercise the normal producer so password sealing precedes delivery capture.
  const password = 'synthetic-secret-never-dispatched'
  await service.submitForm(form.slug, { values: { name: 'Example', secret: password } }, { userId: null, ip: '192.0.2.1' })
  const entry = await db.formSubmission.findFirstOrThrow({ where: { formId } })
  const first = (await rows())[0]
  assert.ok(first, 'submitted intent is recorded')
  assert.equal(first.submissionId, entry.id)
  assert.equal(first.status, 'PENDING')
  assert(!first.body.includes('Example') && !first.body.includes(password), 'durable payload is encrypted')
  const jobs = await db.backgroundJob.findMany({ where: { kind: 'forms.webhook-delivery' } })
  assert.equal(jobs.filter(job => JSON.parse(job.payload).deliveryId === first.id).length, 1)

  // A revoked module during the transport boundary cannot emit a request.
  behavior = async (_url, _body, _headers, options) => {
    enabled = false
    assert.equal(await options.beforeSend(), false)
    return null
  }
  await deliver(first)
  assert.notEqual((await db.formWebhookDelivery.findUniqueOrThrow({ where: { id: first.id } })).status, 'DELIVERED')
  enabled = true

  let row = await current(first)
  assert.equal(row.status, 'RETRY')
  assert.equal(row.failure, 'MODULE_PAUSED')
  assert.equal(row.attempts, 0)
  await db.formWebhookDelivery.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
  behavior = async (_url, _body, _headers, options) => { assert.equal(await options.beforeSend(), true); throw new PublicHttpsNotSentError() }
  await deliver(row)
  row = await current(row)
  assert.equal(row.status, 'RETRY')
  assert.equal(row.failure, 'NOT_SENT')
  assert(row.nextAttemptAt > new Date())
  assert.equal(row.attempts, 1)
  await db.formWebhookDelivery.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
  behavior = async (_url, _body, _headers, options) => await options.beforeSend() ? { status: 204 } : null
  const previousCalls = calls.length
  await Promise.all([deliver(row), deliver(row)])
  row = await current(row)
  assert.equal(calls.length, previousCalls + 1, 'one worker may claim a version')
  assert.equal(row.status, 'DELIVERED')
  assert.equal(row.body, '')
  const [destination, body, headers] = calls.at(-1)
  assert.equal(destination, 'https://fixture.example.invalid/hook?fixture=1')
  assert.equal(headers['x-mobocom-event-id'], first.eventId)
  assert.equal(headers['x-mobocom-signature'], `sha256=${crypto.createHmac('sha256', 'fixture-signing-secret').update(body).digest('hex')}`)
  assert.equal(JSON.parse(body).entryId, entry.id)
  assert.equal(JSON.parse(body).answers.name.value, 'Example')
  assert.equal(JSON.parse(body).answers.secret.value, domain.SECRET_MASK)
  assert(!body.includes(password), 'unsealed secret never enters outbound body')

  // An ambiguous request remains held until a manager explicitly replays it.
  const paid = load('src/modules/forms/server/paid.ts')
  await paid.workOnSubmission(entry.id, actor, { stage: 'IN_PROGRESS' }, true)
  assert.equal((await db.formSubmission.findUniqueOrThrow({ where: { id: entry.id } })).stage, 'IN_PROGRESS')
  row = (await rows()).at(-1)
  assert.equal(row.event, 'stage')
  behavior = async (_url, _body, _headers, options) => { assert.equal(await options.beforeSend(), true); throw Error('fixture response lost') }
  await deliver(row)
  row = await current(row)
  assert.equal(row.status, 'UNKNOWN')
  assert.equal(row.failure, 'RESPONSE_UNKNOWN')
  const uncertainBody = calls.at(-1)[1]
  const history = await hooks.listFormWebhookDeliveries(formId, { status: 'UNKNOWN' })
  assert.equal(history.rows.length, 1)
  assert.equal(history.rows[0].id, row.id)
  assert.equal(history.rows[0].replayable, true)
  assert(!JSON.stringify(history).includes('fixture-signing-secret') && !JSON.stringify(history).includes(uncertainBody))
  const uncertainCalls = calls.length
  await deliver(row)
  assert.equal(calls.length, uncertainCalls, 'uncertain delivery is never automatically repeated')

  await assert.rejects(hooks.replayFormWebhook(actorRequest, actor, formId, row.id, 'verified with recipient', false))
  await assert.rejects(hooks.replayFormWebhook(actorRequest, actor, formId, row.id, 'no', true))
  const attempts = await Promise.allSettled([
    hooks.replayFormWebhook(actorRequest, actor, formId, row.id, 'verified with recipient', true),
    hooks.replayFormWebhook(actorRequest, actor, formId, row.id, 'verified with recipient', true),
  ])
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1, 'only one concurrent replay is admitted')
  const replay = attempts.find(result => result.status === 'fulfilled').value
  assert.equal(replay.eventId, row.eventId)
  assert.equal(await db.auditLog.count({ where: { actorUserId: userId, action: 'forms.webhooks.replay', targetType: 'form-webhook-delivery', targetId: String(row.id) } }), 1)
  row = await current(row)
  behavior = async (_url, _body, _headers, options) => await options.beforeSend() ? { status: 200 } : null
  await deliver(row)
  assert.equal((await current(row)).status, 'DELIVERED')
  assert.equal(calls.at(-1)[2]['x-mobocom-event-id'], replay.eventId)
  assert.equal(calls.at(-1)[1], uncertainBody)

  // Changing a saved endpoint cannot forward an existing payload to the new address.
  await db.$transaction(tx => hooks.queueFormWebhooks(tx, parsed, 'stage', entry.id, 2, { stage: 'DONE' }))
  row = (await rows()).at(-1)
  await db.siteForm.update({ where: { id: formId }, data: { settings: JSON.stringify({ webhooks: [{ url: 'https://other.example.invalid/hook', secret: 'fixture-signing-secret', events: ['submitted', 'paid', 'stage'] }] }) } })
  const beforeChanged = calls.length
  await deliver(row)
  assert.equal(calls.length, beforeChanged)
  assert.equal((await current(row)).status, 'CANCELLED')

  // Saved paused destinations allow a synthetic test with no customer data.
  await db.siteForm.update({ where: { id: formId }, data: { settings: JSON.stringify({ webhooks: [{ url: 'https://fixture.example.invalid/hook?fixture=1', secret: 'fixture-signing-secret', events: ['submitted'], enabled: false }] }) } })
  const synthetic = await hooks.testFormWebhook(actorRequest, actor, formId, 0)
  row = await db.formWebhookDelivery.findUniqueOrThrow({ where: { id: synthetic.id } })
  assert.equal(row.submissionId, null)
  await deliver(row)
  const sent = JSON.parse(calls.at(-1)[1])
  assert.equal(sent.event, 'test')
  assert(!('answers' in sent) && !('entryId' in sent) && !JSON.stringify(sent).includes(password))
  assert.equal(await db.auditLog.count({ where: { actorUserId: userId, action: 'forms.webhooks.test', targetType: 'form-webhook-delivery', targetId: String(row.id) } }), 1)

  // An interrupted in-flight attempt becomes uncertain. Expired payloads are scrubbed.
  const interrupted = await hooks.testFormWebhook(actorRequest, actor, formId, 0)
  await db.formWebhookDelivery.update({ where: { id: interrupted.id }, data: { status: 'IN_FLIGHT', nextAttemptAt: new Date(Date.now() - 1000) } })
  await hooks.reconcileFormWebhookDeliveries()
  assert.equal((await db.formWebhookDelivery.findUniqueOrThrow({ where: { id: interrupted.id } })).status, 'UNKNOWN')
  await db.formWebhookDelivery.update({ where: { id: interrupted.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
  await hooks.reconcileFormWebhookDeliveries()
  assert.equal((await db.formWebhookDelivery.findUniqueOrThrow({ where: { id: interrupted.id } })).body, '')

  await db.siteForm.update({ where: { id: formId }, data: { settings: form.settings } })
  await db.$transaction(tx => hooks.queueFormWebhooks(tx, parsed, 'stage', entry.id, 3, { stage: 'OPEN' }))
  row = (await rows()).at(-1)
  await db.$transaction(tx => hooks.eraseFormWebhookPayloads(tx, [entry.id]))
  const erased = await current(row)
  assert.equal(erased.status, 'CANCELLED')
  assert.equal(erased.body, '')
  const beforeErased = calls.length
  await deliver(row)
  assert.equal(calls.length, beforeErased)

  // Repeated fulfillment of the same paid order admits exactly one paid intent.
  const paidEntry = await db.formSubmission.create({ data: { formId, userId, data: '[]', payStatus: 'UNPAID', amountMinor: 100n, currency: 'IRT' } })
  const order = await db.order.create({ data: { userId, status: 'PAID', totalAmount: 100, totalMinor: 100n, currency: 'IRT', meta: JSON.stringify({ kind: 'form', submissionId: paidEntry.id, formId, formTitle: form.title }) } })
  orderId = order.id
  await Promise.all([paid.fulfillFormOrder(orderId), paid.fulfillFormOrder(orderId)])
  assert.equal((await db.formSubmission.findUniqueOrThrow({ where: { id: paidEntry.id } })).payStatus, 'PAID')
  assert.equal(await db.formWebhookDelivery.count({ where: { submissionId: paidEntry.id, event: 'paid' } }), 1)
  console.log('PASS Forms webhook delivery connected checks')
}

main().finally(async () => {
  try {
    if (formId) {
      const rows = await db.formWebhookDelivery.findMany({ where: { formId }, select: { id: true } })
      const deliveryIds = new Set(rows.map(row => row.id))
      const jobs = await db.backgroundJob.findMany({ where: { kind: 'forms.webhook-delivery' }, select: { id: true, payload: true } })
      const ownedJobs = jobs.filter(job => { try { return deliveryIds.has(JSON.parse(job.payload).deliveryId) } catch { return false } }).map(job => job.id)
      await db.backgroundJob.deleteMany({ where: { id: { in: ownedJobs } } })
      await db.formWebhookDelivery.deleteMany({ where: { formId } })
      await db.siteForm.deleteMany({ where: { id: formId } })
    }
    if (userId) {
      await db.auditLog.deleteMany({ where: { actorUserId: userId } })
      if (orderId) await db.order.deleteMany({ where: { id: orderId } })
      await db.user.deleteMany({ where: { id: userId } })
    }
  } finally { await db.$disconnect() }
}).catch(error => { console.error(error); process.exitCode = 1 })
