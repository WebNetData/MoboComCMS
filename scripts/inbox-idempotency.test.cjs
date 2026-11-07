const { test } = require('node:test')
const assert = require('node:assert/strict')

// Database concurrency, rollback and queue dedupe live in the registered connected check.
test('inbox replay preserves its owner and delivery distinguishes retryable provider failures', async () => {
  const event = { id: 1, userId: 1, kind: 'TEST', dedupeKey: 'one', titleEn: 'One', titleFa: 'یک', href: '/dashboard/notifications' }
  const deliveries = { sms: 0, mail: 0, push: 0 }
  let failMail = true, pushFailure = 'none'
  const mocks = {
    '@/platform/database/prisma': { db: { userNotification: { findUnique: async ({ where }) => where.id === 1 || where.dedupeKey === 'one' ? event : null } } },
    '@/modules/sms/server/sms': { notifyUserEvent: async () => { deliveries.sms++; return true } },
    '@/modules/mail/server/mailer': { notifyUserEmail: async () => { deliveries.mail++; return failMail ? false : true } },
    '@/modules/push/server/push': { pushToUser: async () => { deliveries.push++; return { sent: pushFailure === 'none' ? 1 : 0, failed: pushFailure === 'none' ? 0 : 1, retryable: pushFailure === 'transient' ? 1 : 0 } } },
  }
  const load = require('./connected-source-loader.cjs')(mocks)
  const { createInboxEvent, deliverInboxCopy } = load('src/modules/notifications/server/inbox.ts')
  assert.equal(await createInboxEvent({ ...event, titleEn: 'Replacement' }), event)
  assert.deepEqual(deliveries, { sms: 0, mail: 0, push: 0 }, 'a replay never calls external providers')
  await assert.rejects(createInboxEvent({ ...event, userId: 2 }), /dedupe key collision/)
  await assert.rejects(createInboxEvent({ ...event, userId: 0 }), /invalid inbox event/)
  await assert.rejects(createInboxEvent({ ...event, href: '//evil.invalid' }), /invalid inbox event/)
  await deliverInboxCopy(1, 'sms')
  await assert.rejects(deliverInboxCopy(1, 'email'), /Email provider/)
  failMail = false
  await deliverInboxCopy(1, 'email')
  await deliverInboxCopy(1, 'push')
  pushFailure = 'permanent'
  await deliverInboxCopy(1, 'push')
  pushFailure = 'transient'
  await assert.rejects(deliverInboxCopy(1, 'push'), /Push provider/)
  pushFailure = 'none'
  await deliverInboxCopy(1, 'push')
  assert.deepEqual(deliveries, { sms: 1, mail: 2, push: 4 })
  assert.deepEqual(await deliverInboxCopy(99, 'email'), { skipped: 'removed' })
  await assert.rejects(deliverInboxCopy(1, 'invalid'), /invalid notification delivery/)
})
