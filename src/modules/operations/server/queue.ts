import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'

/**
 * Background queue for heavy work. Requests enqueue and return at once; the
 * job scheduler (every minute, one instance at a time) runs due jobs within a
 * time budget, retries failures with backoff and keeps the result for the
 * monitoring page. Rows survive restarts, so nothing is lost on deploy.
 */

type Handler = (payload: Record<string, unknown>, job: { id: number; attempts: number }) => Promise<unknown>

/** Job kinds. Each handler loads its module lazily, so the queue has no import-time cost. */
const HANDLERS: Record<string, { label: string; run: Handler }> = {
  'images.optimize': {
    label: 'بهینه‌سازی همهٔ تصاویر',
    run: async (payload) => {
      const { optimizeImages } = await import('@/modules/site/server/images')
      let cursor = payload.cursor ?? 0
      let changed = 0, saved = 0
      const deadline = Date.now() + 40_000
      while (Date.now() < deadline) {
        const page = await optimizeImages({ cursor, limit: 20 })
        changed += page.changed; saved += page.saved
        if (page.next === null) return { changed, saved, done: true }
        cursor = page.next
      }
      // Out of time: continue in a follow-up job from where this one stopped.
      await enqueue('images.optimize', { cursor })
      return { changed, saved, done: false, continuedFrom: cursor }
    },
  },
  'images.clear-cache': { label: 'پاک‌کردن کش اندازه‌های تصویر', run: async () => (await import('@/modules/site/server/images')).clearImageCache() },
  'search.reindex': { label: 'بازسازی کامل نمایهٔ جست‌وجو', run: async () => (await import('@/modules/content/server/jobs')).runEngagementJobs({ full: true }) },
  'cdn.purge': { label: 'پاک‌کردن کش CDN', run: async () => (await import('@/modules/operations/server/monitoring')).purgeCdn() },
  // Bulk import: one time-boxed slice per queue job; the import's own history is in ImportJob/ImportRecord.
  'imports.run': {
    label: 'ورود گروهی اطلاعات',
    run: async (payload) => {
      const jobId = Number(payload.jobId)
      if (!Number.isSafeInteger(jobId) || jobId <= 0) return { skipped: true }
      const { runSlice } = await import('@/modules/imports/server/engine')
      const result = await runSlice(jobId, 35_000)
      if (result.next) await enqueue('imports.run', { jobId })
      return { jobId, ...result }
    },
  },
  'imports.rollback': {
    label: 'بازگردانی ورود گروهی اطلاعات',
    run: async (payload) => {
      const jobId = Number(payload.jobId)
      if (!Number.isSafeInteger(jobId) || jobId <= 0) return { skipped: true }
      const { rollbackSlice } = await import('@/modules/imports/server/engine')
      const result = await rollbackSlice(jobId, 35_000)
      if (result.next) await enqueue('imports.rollback', { jobId })
      return { jobId, ...result }
    },
  },
}

export const JOB_LABEL: Record<string, string> = Object.fromEntries(Object.entries(HANDLERS).map(([kind, handler]) => [kind, handler.label]))
export const isJobKind = (kind: string) => kind in HANDLERS

export async function enqueue(kind: string, payload: Record<string, unknown> = {}, options: { dedupeKey?: string; runAt?: Date } = {}) {
  if (!HANDLERS[kind]) throw new Error(`unknown job kind: ${kind}`)
  if (options.dedupeKey) {
    const existing = await db.backgroundJob.findUnique({ where: { dedupeKey: options.dedupeKey } })
    if (existing && (existing.status === 'QUEUED' || existing.status === 'RUNNING')) return existing
    if (existing) await db.backgroundJob.update({ where: { id: existing.id }, data: { dedupeKey: null } })
  }
  return db.backgroundJob.create({ data: { kind, payload: JSON.stringify(payload), dedupeKey: options.dedupeKey ?? null, runAt: options.runAt ?? new Date() } })
}

const backoff = (attempts: number) => Math.min(60, 2 ** attempts) * 60_000

/** Runs due jobs one after another for up to `budgetMs`. Called by the job scheduler. */
export async function runQueue(budgetMs = 45_000) {
  const until = Date.now() + budgetMs
  let ran = 0
  // Jobs stuck in RUNNING (a crashed instance) go back to the queue after 10 minutes.
  await db.backgroundJob.updateMany({ where: { status: 'RUNNING', lockedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: 'QUEUED', lockedAt: null } })
  while (Date.now() < until) {
    const job = await db.backgroundJob.findFirst({ where: { status: 'QUEUED', runAt: { lte: new Date() } }, orderBy: { id: 'asc' } })
    if (!job) break
    const claimed = await db.backgroundJob.updateMany({ where: { id: job.id, status: 'QUEUED' }, data: { status: 'RUNNING', lockedAt: new Date(), attempts: { increment: 1 } } })
    if (!claimed.count) continue
    ran++
    try {
      let payload: Record<string, unknown> = {}
      try { payload = JSON.parse(job.payload || '{}') } catch { /* empty payload */ }
      const result = await HANDLERS[job.kind]?.run(payload, { id: job.id, attempts: job.attempts + 1 })
      await db.backgroundJob.update({ where: { id: job.id }, data: { status: 'DONE', finishedAt: new Date(), lockedAt: null, lastError: '', result: JSON.stringify(result ?? null, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 4000) } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const attempts = job.attempts + 1
      await db.backgroundJob.update({ where: { id: job.id }, data: attempts >= 5 ? { status: 'FAILED', lastError: message.slice(0, 1000), lockedAt: null, finishedAt: new Date() } : { status: 'QUEUED', lastError: message.slice(0, 1000), lockedAt: null, runAt: new Date(Date.now() + backoff(attempts)) } })
      logEvent('error', 'queue.job_failed', { jobId: job.id, kind: job.kind, attempts, error: message })
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
