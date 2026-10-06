// Real PostgreSQL notices and queue jobs. The code under test only ever sees this script's members: every
// read and delete of notices and jobs is narrowed to them, and the digest cursor (one row for the whole
// site) is kept in memory, so the local database's own notices, jobs and cursor are not touched.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `notif-policy-${Date.now()}`
const state = { policy: {}, mail: [], mailResult: true, settings: new Map(), users: [], jobKeys: [] }
const mineJobs = () => ({ OR: [{ dedupeKey: { in: state.jobKeys } }, ...state.users.map(id => ({ dedupeKey: { startsWith: `notification-digest:${id}:` } }))] })
const narrowed = (model, methods, scope) => new Proxy(model, { get: (target, key) => methods.includes(key) ? args => target[key]({ ...args, where: { AND: [args.where || {}, scope()] } }) : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
const db = new Proxy(prisma, { get: (target, key) =>
  key === 'userNotification' ? narrowed(target.userNotification, ['findMany', 'deleteMany', 'count', 'groupBy'], () => ({ userId: { in: state.users } }))
  : key === 'backgroundJob' ? narrowed(target.backgroundJob, ['findMany', 'count'], mineJobs)
  : key === 'setting' ? { findUnique: async ({ where }) => state.settings.has(where.key) ? { key: where.key, value: state.settings.get(where.key) } : null, upsert: async ({ where, update }) => { state.settings.set(where.key, update.value) } }
  : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
const cache = new Map()
function load(file) {
  const full = path.resolve(file)
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText)(name => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/modules/settings/server') return { readJsonSetting: async () => state.policy, writeJsonSetting: async (_key, value) => { state.policy = value } }
    if (name === '@/modules/mail/server/mailer') return { notifyUserEmail: async event => { state.mail.push(event); return state.mailResult } }
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`)
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const DAY = 86_400_000
// 2026-10-07 10:00 in Tehran (+03:30), and four hours earlier.
const ten = new Date('2026-10-07T06:30:00Z'), six = new Date('2026-10-07T02:30:00Z')

async function main() {
  const policy = load('src/modules/notifications/server/policy.ts')
  // One after the other: members are walked in id order.
  const member = name => prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only' } })
  const a = await member('a'), b = await member('b'), c = await member('c')
  state.users = [a.id, b.id, c.id]
  let n = 0
  const notice = (user, data = {}) => prisma.userNotification.create({ data: { userId: user.id, kind: 'FORUM_REPLY', dedupeKey: `${seed}-${n++}`, titleEn: 'x', titleFa: `اعلان ${n}`, href: '/forum', ...data } })
  const left = async user => (await prisma.userNotification.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } })).map(row => row.titleFa)

  // ---- keeping time: nothing goes until the owner sets it; read ones by when they were read, all by their age
  const now = new Date()
  const readLongAgo = await notice(a, { titleFa: 'read long ago', readAt: new Date(now - 40 * DAY), createdAt: new Date(now - 50 * DAY) })
  await notice(a, { titleFa: 'read lately', readAt: new Date(now - 10 * DAY), createdAt: new Date(now - 200 * DAY) })
  await notice(a, { titleFa: 'old and unread', createdAt: new Date(now - 60 * DAY) })
  await notice(a, { titleFa: 'ancient and unread', createdAt: new Date(now - 400 * DAY) })
  await notice(b, { titleFa: 'b read long ago', readAt: new Date(now - 31 * DAY), createdAt: new Date(now - 31 * DAY) })
  assert.deepEqual(await policy.pruneNotifications(100, now), { removed: 0 }, 'off by default')
  assert.deepEqual(await policy.getNotificationPolicy(), { readDays: 0, unreadDays: 0, digest: { enabled: false, hour: 9 } })
  await policy.saveNotificationPolicy({ readDays: 30 })
  assert.deepEqual(await policy.pruneNotifications(1, now), { removed: 1 }, 'a pass removes no more than its batch')
  assert.deepEqual(await policy.pruneNotifications(100, now), { removed: 1 })
  assert.deepEqual([await left(a), await left(b)], [['read lately', 'old and unread', 'ancient and unread'], []], 'read notices past thirty days went; unread ones and recently read ones stayed')
  assert.equal(await prisma.userNotification.count({ where: { id: readLongAgo.id } }), 0)
  await policy.saveNotificationPolicy({ readDays: 30, unreadDays: 365 })
  assert.deepEqual(await policy.pruneNotifications(100, now), { removed: 1 })
  assert.deepEqual(await left(a), ['read lately', 'old and unread'], 'a notice older than a year went whether read or not')
  assert.deepEqual((await policy.saveNotificationPolicy({ readDays: 90, unreadDays: 10 })).unreadDays, 90, 'an unread notice is never removed sooner than a read one')
  await policy.saveNotificationPolicy({})
  await prisma.userNotification.deleteMany({ where: { userId: { in: state.users } } })

  // ---- the daily summary: who gets one
  const inWindow = hours => new Date(ten.getTime() - 3_600_000 - hours * 3_600_000)   // the window ends at 09:00, one hour before `ten`
  await notice(a, { titleFa: 'reply one', createdAt: inWindow(2) }); await notice(a, { titleFa: 'reply two', createdAt: inWindow(1) })
  await notice(a, { titleFa: 'already read', createdAt: inWindow(3), readAt: ten }); await notice(a, { titleFa: 'emailed by itself', kind: 'PAYMENT_PAID', createdAt: inWindow(3) })
  await notice(a, { titleFa: 'before the window', createdAt: inWindow(30) }); await notice(a, { titleFa: 'after the hour', createdAt: new Date(ten.getTime() - 60_000) })
  await notice(b, { titleFa: 'b emailed by itself', kind: 'TICKET_REPLY', createdAt: inWindow(2) })
  await notice(c, { titleFa: 'c reaction', kind: 'FORUM_REACTION', createdAt: inWindow(5) })
  const queuedFor = async () => (await prisma.backgroundJob.findMany({ where: mineJobs(), orderBy: { id: 'asc' } })).filter(job => job.kind === 'notification.digest').map(job => JSON.parse(job.payload))
  assert.deepEqual(await policy.queueInboxDigests(ten), { queued: 0 }, 'off until the owner turns it on')
  await policy.saveNotificationPolicy({ digest: { enabled: true, hour: 9 } })
  assert.deepEqual(await policy.queueInboxDigests(six), { queued: 0 }, 'not before the hour')
  assert.deepEqual([await policy.queueInboxDigests(ten, 1, 1), await queuedFor()], [{ queued: 1, day: '2026-10-07', done: false }, [{ userId: a.id, day: '2026-10-07' }]], 'a pass that stops early')
  assert.deepEqual(await policy.queueInboxDigests(ten, 1, 5), { queued: 1, day: '2026-10-07', done: true }, 'continues where it stopped')
  assert.deepEqual(await queuedFor(), [{ userId: a.id, day: '2026-10-07' }, { userId: c.id, day: '2026-10-07' }], 'one for each member with unread notices that have no email of their own; none for the member who was emailed already')
  assert.deepEqual([await policy.queueInboxDigests(ten), (await queuedFor()).length], [{ queued: 0 }, 2], 'a day is queued once')
  state.settings.clear()
  assert.deepEqual([(await policy.queueInboxDigests(ten)).queued, (await queuedFor()).length], [0, 2], 'and a lost cursor does not queue a member twice')
  assert.equal((await policy.queueInboxDigests(new Date(ten.getTime() + DAY))).day, '2026-10-08')

  // ---- the summary itself
  assert.deepEqual(await policy.deliverInboxDigest(a.id, '2026-10-07'), { sent: true, total: 2 })
  assert.deepEqual(state.mail, [{ userId: a.id, kind: 'INBOX_DIGEST', titleFa: '۲ اعلان خوانده‌نشده دارید', bodyFa: '• reply two\n• reply one', href: '/dashboard/notifications' }])
  for (let i = 0; i < 9; i++) await notice(c, { titleFa: `c more ${i}`, createdAt: inWindow(6 + i / 10) })
  state.mail.length = 0
  assert.deepEqual(await policy.deliverInboxDigest(c.id, '2026-10-07'), { sent: true, total: 10 })
  assert.deepEqual([state.mail[0].titleFa, state.mail[0].bodyFa.split('\n').length, state.mail[0].bodyFa.split('\n').at(-1), state.mail[0].bodyFa.split('\n')[0]], ['۱۰ اعلان خوانده‌نشده دارید', 9, 'و ۲ مورد دیگر', '• c reaction'], 'the newest eight and how many more')
  state.mail.length = 0; state.mailResult = null
  assert.deepEqual(await policy.deliverInboxDigest(a.id, '2026-10-07'), { sent: false, total: 2 }, 'the member has it off, or email is not set up: no fault')
  state.mailResult = false
  await assert.rejects(policy.deliverInboxDigest(a.id, '2026-10-07'), /rejected/, 'a provider failure is retried by the queue')
  state.mailResult = true; state.mail.length = 0
  await prisma.userNotification.updateMany({ where: { userId: a.id }, data: { readAt: new Date() } })
  assert.deepEqual([await policy.deliverInboxDigest(a.id, '2026-10-07'), state.mail.length], [{ sent: false, skipped: 'read' }, 0], 'read in the meantime: no email')
  await assert.rejects(policy.deliverInboxDigest(c.id, 'yesterday'), /invalid digest day/)
  await policy.saveNotificationPolicy({})
  assert.deepEqual([await policy.deliverInboxDigest(c.id, '2026-10-07'), state.mail.length], [{ sent: false, skipped: 'off' }, 0], 'switched off after it was queued')

  // ---- receipts: what the channel jobs came to
  const subject = await notice(a), other = await notice(c)
  const job = (row, channel, data) => { const dedupeKey = `notification:${row.id}:${channel}`; state.jobKeys.push(dedupeKey); return prisma.backgroundJob.create({ data: { kind: 'notification.deliver', payload: JSON.stringify({ notificationId: row.id, channel }), dedupeKey, ...data } }) }
  await job(subject, 'sms', { status: 'DONE', result: '{"sent":true}' }); await job(subject, 'email', { status: 'DONE', result: '{"sent":false}' }); await job(subject, 'push', { status: 'FAILED', attempts: 5, lastError: 'Push provider failed to deliver notification' })
  await job(other, 'sms', { status: 'QUEUED', attempts: 2, lastError: 'SMS provider rejected notification' }); await job(other, 'email', { status: 'QUEUED' }); await job(other, 'push', { status: 'DONE', result: '{"skipped":"removed"}' })
  await prisma.backgroundJob.updateMany({ where: { dedupeKey: `notification-digest:${a.id}:2026-10-07` }, data: { status: 'DONE', result: '{"sent":true,"total":2}' } })
  const receipts = await policy.deliveryReceipts()
  assert.deepEqual(receipts.channels, { sms: { sent: 1, notSent: 0, waiting: 1, failed: 0 }, email: { sent: 0, notSent: 1, waiting: 1, failed: 0 }, push: { sent: 0, notSent: 1, waiting: 0, failed: 1 } })
  assert.deepEqual([receipts.total, receipts.counted, receipts.days, receipts.digests.sent, receipts.digests.waiting], [6, 6, 7, 1, 2])
  assert.deepEqual(receipts.failures.map(row => [row.channel, row.retrying, row.attempts, row.error]), [['sms', true, 2, 'SMS provider rejected notification'], ['push', false, 5, 'Push provider failed to deliver notification']], 'the latest faults, newest first; a job still waiting for its first try is not one')
  console.log('PostgreSQL notification policy: keeping times (off by default, bounded passes), the daily summary (who, once a day, what it lists, read or switched off in the meantime) and delivery receipts passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const ids = (await prisma.user.findMany({ where: { email: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    const notices = (await prisma.userNotification.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map(row => row.id)
    await prisma.backgroundJob.deleteMany({ where: { OR: [{ dedupeKey: { in: [...state.jobKeys, ...notices.flatMap(id => ['sms', 'email', 'push'].map(channel => `notification:${id}:${channel}`))] } }, ...ids.map(id => ({ dedupeKey: { startsWith: `notification-digest:${id}:` } }))] } })
    await prisma.userNotification.deleteMany({ where: { userId: { in: ids } } }); await prisma.user.deleteMany({ where: { id: { in: ids } } })
  } finally { await prisma.$disconnect() }
})
