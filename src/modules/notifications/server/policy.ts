import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { EMAIL_EVENTS } from '@/modules/mail/domain/mail'
import { DIGEST_LIST, digestDay, digestText, digestWindow, normalizeNotificationPolicy, retentionCutoffs, summarizeReceipts, type NotificationPolicy } from '@/modules/notifications/domain/policy'

// Retention of inbox notices, the daily summary email and delivery receipts. The inbox itself (creating a
// notice and its three channel jobs) stays in inbox.ts; receipts are read from those jobs, not stored again.

const SETTINGS_KEY = 'notifications.policy.v1'
const DIGEST_CURSOR = 'notifications.digest.cursor'
export const DIGEST_KIND = 'INBOX_DIGEST'

export async function getNotificationPolicy(): Promise<NotificationPolicy> {
  return normalizeNotificationPolicy(await readJsonSetting(SETTINGS_KEY).catch(() => undefined))
}

export async function saveNotificationPolicy(input: unknown) {
  const policy = normalizeNotificationPolicy(input)
  await writeJsonSetting(SETTINGS_KEY, policy)
  return policy
}

/**
 * Worker step: removes notices past their keeping time, a bounded batch a pass (oldest first), so a long
 * backlog is worked off over several passes without a long lock. Does nothing while both rules are off.
 */
export async function pruneNotifications(limit = 2000, now = new Date()) {
  const cutoffs = retentionCutoffs(await getNotificationPolicy(), now)
  const rules = [
    ...(cutoffs.readBefore ? [{ readAt: { lt: cutoffs.readBefore } }] : []),
    ...(cutoffs.createdBefore ? [{ createdAt: { lt: cutoffs.createdBefore } }] : []),
  ]
  if (!rules.length) return { removed: 0 }
  const rows = await db.userNotification.findMany({ where: { OR: rules }, orderBy: { id: 'asc' }, take: Math.max(1, Math.min(5000, Math.trunc(limit) || 2000)), select: { id: true } })
  if (!rows.length) return { removed: 0 }
  const removed = await db.userNotification.deleteMany({ where: { id: { in: rows.map((row) => row.id) }, OR: rules } })
  return { removed: removed.count }
}

// Kinds that already go out as an email of their own are left out of the summary: nothing is sent twice.
const emailedKinds = () => EMAIL_EVENTS.map((event) => event.id)

/**
 * Worker step: once the day's hour has come, queues one summary job for every member who has unread
 * notices from the last day that were not emailed on their own. Members are walked in id order with a
 * cursor, so a pass that stops early continues where it stopped, and a day is queued once.
 */
export async function queueInboxDigests(now = new Date(), pageSize = 200, maxPages = 10) {
  const policy = await getNotificationPolicy()
  if (!policy.digest.enabled) return { queued: 0 }
  const day = digestDay(now, policy.digest.hour)
  const window = day ? digestWindow(day, policy.digest.hour) : null
  if (!day || !window) return { queued: 0 }
  const saved = (await db.setting.findUnique({ where: { key: DIGEST_CURSOR } }))?.value || ''
  if (saved === `${day}:done`) return { queued: 0 }
  let cursor = saved.startsWith(`${day}:`) ? Number(saved.slice(day.length + 1)) || 0 : 0
  let queued = 0
  let done = false
  for (let page = 0; page < maxPages && !done; page++) {
    const members = await db.userNotification.groupBy({
      by: ['userId'], where: { readAt: null, createdAt: { gte: window.from, lt: window.to }, kind: { notIn: emailedKinds() }, userId: { gt: cursor } },
      orderBy: { userId: 'asc' }, take: pageSize,
    })
    if (members.length) {
      const created = await db.backgroundJob.createMany({ data: members.map((member) => ({ kind: 'notification.digest', payload: JSON.stringify({ userId: member.userId, day }), dedupeKey: `notification-digest:${member.userId}:${day}` })), skipDuplicates: true })
      queued += created.count
      cursor = members[members.length - 1].userId
    }
    done = members.length < pageSize
    const value = done ? `${day}:done` : `${day}:${cursor}`
    await db.setting.upsert({ where: { key: DIGEST_CURSOR }, create: { key: DIGEST_CURSOR, value }, update: { value } })
  }
  return { queued, day, done }
}

/**
 * Queue handler: the summary email of one member for one day. What they have read since it was queued is
 * left out, and with nothing left no email goes. Whether email may reach this member at all (the site's
 * mail settings, the member's own switch for this kind) is decided where every notification email is.
 */
export async function deliverInboxDigest(userId: number, day: string) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('invalid digest')
  const policy = await getNotificationPolicy()
  if (!policy.digest.enabled) return { sent: false, skipped: 'off' }
  const window = digestWindow(day, policy.digest.hour)
  if (!window) throw new Error('invalid digest day')
  const where = { userId, readAt: null, createdAt: { gte: window.from, lt: window.to }, kind: { notIn: emailedKinds() } }
  const [total, rows] = await Promise.all([
    db.userNotification.count({ where }),
    db.userNotification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: DIGEST_LIST, select: { titleFa: true } }),
  ])
  if (!total) return { sent: false, skipped: 'read' }
  const text = digestText(rows.map((row) => row.titleFa), total)
  const { notifyUserEmail } = await import('@/modules/mail/server/mailer')
  const sent = await notifyUserEmail({ userId, kind: DIGEST_KIND, titleFa: text.title, bodyFa: text.body, href: '/dashboard/notifications' })
  if (sent === false) throw new Error('Email provider rejected the digest')
  return { sent: sent === true, total }
}

/** Worker step: both of the above, each on its own so one failing does not stop the other. */
export async function runNotificationPolicy(now = new Date()) {
  const pruned = await pruneNotifications(2000, now).catch((error) => { logEvent('error', 'notifications.prune_failed', { error }); return { removed: 0 } })
  const digests = await queueInboxDigests(now).catch((error) => { logEvent('error', 'notifications.digest_queue_failed', { error }); return { queued: 0 } })
  return { removed: pruned.removed, queued: digests.queued }
}

/**
 * Delivery receipts for staff: what the channel jobs of the last days came to, and the latest failures.
 * Finished jobs are kept for a week, so that is as far back as receipts go.
 */
export async function deliveryReceipts(days = 7, now = new Date()) {
  const since = new Date(now.getTime() - Math.max(1, Math.min(7, Math.trunc(days) || 7)) * 86_400_000)
  const where = { kind: 'notification.deliver', createdAt: { gte: since } }
  const [jobs, total, failures, digests] = await Promise.all([
    db.backgroundJob.findMany({ where, orderBy: { id: 'desc' }, take: 30_000, select: { status: true, result: true, payload: true } }),
    db.backgroundJob.count({ where }),
    db.backgroundJob.findMany({ where: { ...where, OR: [{ status: 'FAILED' }, { status: 'QUEUED', attempts: { gt: 0 } }] }, orderBy: { id: 'desc' }, take: 10, select: { id: true, status: true, payload: true, attempts: true, lastError: true, createdAt: true } }),
    db.backgroundJob.findMany({ where: { kind: 'notification.digest', createdAt: { gte: since } }, take: 30_000, select: { status: true, result: true, payload: true } }),
  ])
  const channel = (payload: string) => { try { return String((JSON.parse(payload || '{}') as { channel?: unknown }).channel || '') } catch { return '' } }
  return {
    days: Math.round((now.getTime() - since.getTime()) / 86_400_000), counted: jobs.length, total,
    channels: summarizeReceipts(jobs),
    // A summary job carries no channel: it is an email.
    digests: summarizeReceipts(digests.map((job) => ({ ...job, payload: '{"channel":"email"}' }))).email,
    failures: failures.map((job) => ({ id: job.id, channel: channel(job.payload), retrying: job.status === 'QUEUED', attempts: job.attempts, error: job.lastError.slice(0, 200), createdAt: job.createdAt })),
  }
}
