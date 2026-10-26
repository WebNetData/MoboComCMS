import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { JOB_LABEL } from '@/modules/operations/domain/job-kinds'
import { enqueue } from './enqueue'

/**
 * Background queue for heavy work. Requests enqueue and return at once; the
 * job scheduler (every minute, one instance at a time) runs due jobs within a
 * time budget, retries failures with backoff and keeps the result for the
 * monitoring page. Rows survive restarts, so nothing is lost on deploy.
 */

type Handler = (payload: Record<string, unknown>, job: {
  id: number; attempts: number; checkpoint: () => Promise<void>
  continueWith: (kind: string, payload: Record<string, unknown>, options?: { dedupeKey?: string }) => Promise<unknown>
}) => Promise<unknown>

/** Job kinds. Each handler loads its module lazily, so the queue has no import-time cost. */
const HANDLERS: Record<string, { run: Handler }> = {
  'journal.editorial-decision': { run: async payload => (await import('@/modules/journal/server/review-notifications')).deliverReviewDecision(payload) },
  'journal.comment-published': { run: async payload => {
    const id = Number(payload.commentId)
    if (!Number.isSafeInteger(id) || id <= 0 || !['moderator', 'auto'].includes(String(payload.by))) throw new Error('Invalid comment notification intent')
    return (await import('@/modules/journal/server/comment-notifications')).notifyCommentPublished(id, payload.by as 'moderator' | 'auto')
  } },
  'cinema.person-publication': { run: async (payload, job) => {
    const result = await (await import('@/modules/cinema/server/people-notifications')).deliverPeoplePublication(payload)
    if (!result.done) await job.continueWith('cinema.person-publication', { ...payload, cursor: result.cursor }, { dedupeKey: `cinema-person:${payload.personId}:title:${payload.titleId}:after:${result.cursor}` })
    return result
  } },
  'media.transfer': { run: async payload => (await import('@/modules/media/server/library')).runTransfer(payload) },
  'media.compatible-audio': { run: async (payload, job) => (await import('@/modules/media/server/library')).runCompatibleAudio(payload, job.id, job.attempts) },
  'store.price-drop': {
    run: async (payload, job) => {
      const { deliverProductPriceDrop } = await import('@/modules/catalog/server/price-drop-notifications')
      const result = await deliverProductPriceDrop(payload)
      if (!result.done) await job.continueWith('store.price-drop', { ...payload, cursor: result.cursor }, { dedupeKey: `product-price-drop:${payload.pointId}:after:${result.cursor}` })
      return result
    },
  },
  'store.price-history-baseline': {
    run: async (payload, job) => {
      const { baselineProductPrices } = await import('@/modules/catalog/server/price-history-baseline')
      const result = await baselineProductPrices(payload.cursor ?? 0)
      if (!result.done) await job.continueWith('store.price-history-baseline', { cursor: result.cursor }, { dedupeKey: `price-history-baseline:${result.cursor}` })
      return result
    },
  },
  'notification.deliver': {
    run: async (payload) => {
      const { deliverInboxCopy } = await import('@/modules/notifications/server/inbox')
      return deliverInboxCopy(Number(payload.notificationId), String(payload.channel || ''))
    },
  },
  'notification.digest': {
    run: async (payload) => {
      const { deliverInboxDigest } = await import('@/modules/notifications/server/policy')
      return deliverInboxDigest(Number(payload.userId), String(payload.day || ''))
    },
  },
  'forum.reputation-recount': {
    run: async (payload, job) => {
      const { recountReputation } = await import('@/modules/forum/server/community')
      let cursor = Number(payload.cursor) || 0, changed = 0
      const deadline = Date.now() + 35_000
      while (Date.now() < deadline) {
        await job.checkpoint()
        const page = await recountReputation(cursor)
        changed += page.changed
        if (page.next === null) return { changed, done: true }
        cursor = page.next
      }
      await job.continueWith('forum.reputation-recount', { cursor }, { dedupeKey: `forum-reputation:after:${cursor}:${Date.now()}` })
      return { changed, done: false, continuedFrom: cursor }
    },
  },
  'images.optimize': {
    run: async (payload, job) => {
      const { optimizeImages } = await import('@/modules/site/server/images')
      let cursor = payload.cursor ?? 0
      let changed = 0, saved = 0
      const deadline = Date.now() + 40_000
      while (Date.now() < deadline) {
        await job.checkpoint()
        const page = await optimizeImages({ cursor, limit: 20 })
        changed += page.changed; saved += page.saved
        if (page.next === null) return { changed, saved, done: true }
        cursor = page.next
      }
      // Out of time: continue in a follow-up job from where this one stopped.
      await job.continueWith('images.optimize', { cursor })
      return { changed, saved, done: false, continuedFrom: cursor }
    },
  },
  'images.clear-cache': { run: async () => (await import('@/modules/site/server/images')).clearImageCache() },
  'search.reindex': { run: async () => (await import('@/modules/content/server/jobs')).runEngagementJobs({ full: true }) },
  'cdn.purge': { run: async () => (await import('@/modules/server-panel/server/domains')).purgeCloudflareCache() },
  // Bulk import: one time-boxed slice per queue job; the import's own history is in ImportJob/ImportRecord.
  'imports.run': {
    run: async (payload, job) => {
      const jobId = Number(payload.jobId)
      if (!Number.isSafeInteger(jobId) || jobId <= 0) return { skipped: true }
      const { runSlice } = await import('@/modules/imports/server/execution')
      const result = await runSlice(jobId, 35_000)
      if (result.next) await job.continueWith('imports.run', { jobId })
      return { jobId, ...result }
    },
  },
  'imports.rollback': {
    run: async (payload, job) => {
      const jobId = Number(payload.jobId)
      if (!Number.isSafeInteger(jobId) || jobId <= 0) return { skipped: true }
      const { rollbackSlice } = await import('@/modules/imports/server/execution')
      const result = await rollbackSlice(jobId, 35_000)
      if (result.next) await job.continueWith('imports.rollback', { jobId })
      return { jobId, ...result }
    },
  },
}

export { JOB_LABEL } from '@/modules/operations/domain/job-kinds'
export { enqueue, isJobKind } from './enqueue'


const backoff = (attempts: number) => Math.min(60, 2 ** attempts) * 60_000
const MAX_ATTEMPTS = 5

/** Runs due jobs one after another for up to `budgetMs`. Called by the job scheduler. */
export async function runQueue(budgetMs = 45_000) {
  const until = Date.now() + budgetMs
  let ran = 0
  // Jobs stuck in RUNNING (a crashed instance) go back to the queue after 10 minutes;
  // a job that was interrupted on every attempt stops instead of taking the instance down again.
  const stuck = { status: 'RUNNING', lockedAt: { lt: new Date(Date.now() - 10 * 60_000) } }
  await db.backgroundJob.updateMany({ where: { ...stuck, attempts: { gte: MAX_ATTEMPTS } }, data: { status: 'FAILED', lockedAt: null, finishedAt: new Date(), lastError: 'interrupted on every attempt' } })
  await db.backgroundJob.updateMany({ where: stuck, data: { status: 'QUEUED', lockedAt: null } })
  while (Date.now() < until) {
    const job = await db.backgroundJob.findFirst({ where: { status: 'QUEUED', runAt: { lte: new Date() } }, orderBy: { id: 'asc' } })
    if (!job) break
    const lockedAt = new Date()
    const claimed = await db.backgroundJob.updateMany({ where: { id: job.id, status: 'QUEUED', attempts: job.attempts }, data: { status: 'RUNNING', lockedAt, attempts: { increment: 1 } } })
    if (!claimed.count) continue
    ran++
    const lease = { id: job.id, status: 'RUNNING', lockedAt, attempts: job.attempts + 1 }
    const handler = HANDLERS[job.kind]
    if (!handler) {
      // A kind this version does not know (an older or newer release queued it) is kept as failed, never reported as done.
      const failed = await db.backgroundJob.updateMany({ where: lease, data: { status: 'FAILED', lastError: `unknown job kind: ${job.kind}`.slice(0, 1000), lockedAt: null, finishedAt: new Date() } })
      if (failed.count) logEvent('error', 'queue.job_failed', { jobId: job.id, kind: job.kind, attempts: job.attempts + 1, error: 'unknown job kind' })
      continue
    }
    let authorityDenied = false
    try {
      let payload: Record<string, unknown> = {}
      try { payload = JSON.parse(job.payload || '{}') } catch { /* empty payload */ }
      // A damaged captured envelope must not silently turn a human continuation into system work.
      const manual = !!job.dedupeKey?.startsWith('manual:') || job.payload.includes('"__mobocomManualAuthority"') || (payload != null && Object.prototype.hasOwnProperty.call(payload, '__mobocomManualAuthority'))
      const checkpoint = async () => {
        if (!manual) return
        const current = await db.backgroundJob.findUnique({ where: { id: job.id } })
        if (!current || current.status !== lease.status || current.attempts !== lease.attempts || current.lockedAt?.getTime() !== lease.lockedAt.getTime()) throw new Error('Queue lease changed')
        if (!await (await import('@/modules/operations/server/queue-authority')).authorizedManualJob(payload)) {
          authorityDenied = true
          throw new Error('اختیار اپراتور معتبر نیست یا بررسی آن در دسترس نیست؛ با حساب مجاز دوباره تلاش کنید.')
        }
      }
      const continueWith = async (kind: string, next: Record<string, unknown>, options: { dedupeKey?: string } = {}) => {
        if (!manual) return enqueue(kind, next, options)
        const authority = await import('@/modules/operations/server/queue-authority')
        return db.$transaction(async tx => {
          const owned = await tx.backgroundJob.updateMany({ where: lease, data: { lockedAt: lease.lockedAt } })
          if (!owned.count) throw new Error('Queue lease changed')
          if (!await authority.authorizedManualJob(payload, tx)) {
            authorityDenied = true
            throw new Error('اختیار اپراتور معتبر نیست یا بررسی آن در دسترس نیست؛ با حساب مجاز دوباره تلاش کنید.')
          }
          return enqueue(kind, authority.manualContinuation(payload, next), options, tx)
        })
      }
      await checkpoint()
      const result = await handler.run(payload, { id: job.id, attempts: job.attempts + 1, checkpoint, continueWith })
      await db.backgroundJob.updateMany({ where: lease, data: { status: 'DONE', finishedAt: new Date(), lockedAt: null, lastError: '', result: JSON.stringify(result ?? null, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 4000) } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const attempts = job.attempts + 1
      const failed = await db.backgroundJob.updateMany({ where: lease, data: authorityDenied || attempts >= MAX_ATTEMPTS ? { status: 'FAILED', lastError: message.slice(0, 1000), lockedAt: null, finishedAt: new Date() } : { status: 'QUEUED', lastError: message.slice(0, 1000), lockedAt: null, runAt: new Date(Date.now() + backoff(attempts)) } })
      if (failed.count) logEvent('error', 'queue.job_failed', { jobId: job.id, kind: job.kind, attempts, error: message })
    }
  }
  // Finished rows are kept for a week.
  if (ran) await db.backgroundJob.deleteMany({ where: { status: { in: ['DONE', 'FAILED'] }, finishedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } })
  return { ran }
}

export async function queueOverview() {
  const [counts, recent] = await Promise.all([
    db.backgroundJob.groupBy({ by: ['status'], _count: { _all: true } }),
    db.backgroundJob.findMany({ orderBy: { id: 'desc' }, take: 20 }),
  ])
  return {
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
    recent: recent.map((row) => ({ id: row.id, kind: row.kind, label: JOB_LABEL[row.kind] || row.kind, status: row.status, attempts: row.attempts, lastError: row.lastError, result: row.result, createdAt: row.createdAt.toISOString(), finishedAt: row.finishedAt?.toISOString() || null })),
  }
}

export async function retryJob(id: number) {
  const updated = await db.backgroundJob.updateMany({ where: { id, status: 'FAILED' }, data: { status: 'QUEUED', runAt: new Date(), attempts: 0, lastError: '' } })
  return updated.count > 0
}
