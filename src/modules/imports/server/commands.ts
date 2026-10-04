import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { deleteUpload, pruneIncoming } from '@/modules/imports/server/files'
import { ImportError, adapterFor, ensureModule, settingsFor, settingsHash, type Job, type DryRun } from '@/modules/imports/server/execution'


// ------------------------------------------------------------------ running

/** Queues the next slice on the site's background queue and nudges the queue to run now in this process. */
export async function dispatch(kind: 'imports.run' | 'imports.rollback', jobId: number) {
  const { enqueue, runQueue } = await import('@/modules/operations/server/queue')
  await enqueue(kind, { jobId })
  const timer = setTimeout(() => void runQueue(40_000).catch((error) => logEvent('error', 'imports.queue_failed', { jobId, error: String(error) })), 50)
  timer.unref?.()
}


/**
 * Scheduler entry (every few minutes): a job whose queue chain was lost (a
 * crash between slices, a queue row that failed for good) gets a new queue
 * job; unstarted drafts and their files are removed after a week.
 */
export async function sweepImportJobs() {
  const now = new Date()
  const stalled = await db.importJob.findMany({
    where: { status: { in: ['QUEUED', 'RUNNING', 'ROLLING_BACK'] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }], updatedAt: { lt: new Date(now.getTime() - 3 * 60_000) } },
    select: { id: true, status: true }, take: 20,
  })
  let resumed = 0
  for (const job of stalled) {
    const kind = job.status === 'ROLLING_BACK' ? 'imports.rollback' : 'imports.run'
    const pending = await db.backgroundJob.count({ where: { kind, status: { in: ['QUEUED', 'RUNNING'] }, payload: JSON.stringify({ jobId: job.id }) } })
    if (!pending) { await dispatch(kind, job.id); resumed++ }
  }
  const stale = await db.importJob.findMany({ where: { status: 'DRAFT', updatedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }, select: { id: true, fileKey: true }, take: 20 })
  for (const draft of stale) { await deleteUpload(draft.fileKey); await db.importJob.delete({ where: { id: draft.id } }) }
  await pruneIncoming()
  return { resumed, pruned: stale.length }
}


// ------------------------------------------------------------------ control

export async function startJob(job: Job, rawSettings: unknown) {
  if (job.status !== 'DRAFT') throw new ImportError('این ورود اطلاعات قبلاً شروع شده است')
  const adapter = adapterFor(job.adapter)
  await ensureModule(adapter)
  const settings = settingsFor(adapter, rawSettings)
  let dry: DryRun | null = null
  try { dry = job.dryRun ? JSON.parse(job.dryRun) as DryRun : null } catch { dry = null }
  // Preview and dry run are mandatory, and must match exactly what is started.
  if (!dry || dry.settingsHash !== settingsHash(settings) || dry.fileHash !== job.fileHash) throw new ImportError('ابتدا پیش‌نمایش و اجرای آزمایشی (Dry Run) را با همین تنظیمات انجام دهید')
  if (settings.options.missingVariants === 'delete' && settings.options.confirmDelete !== true) throw new ImportError('حذف تنوع‌های غایب نیاز به تأیید جداگانه دارد')
  const updated = await db.importJob.update({ where: { id: job.id }, data: { status: 'QUEUED', settings: JSON.stringify(settings), total: dry.total, cursor: 0, stats: JSON.stringify({ total: dry.total }), startedAt: new Date(), error: '' } })
  await dispatch('imports.run', job.id)
  return updated
}


export async function setJobState(job: Job, op: 'pause' | 'resume' | 'cancel') {
  const allowed: Record<string, string[]> = { pause: ['QUEUED', 'RUNNING'], resume: ['PAUSED'], cancel: ['QUEUED', 'RUNNING', 'PAUSED'] }
  if (!allowed[op].includes(job.status)) throw new ImportError('این کار در وضعیت فعلی ورود اطلاعات ممکن نیست')
  const status = op === 'pause' ? 'PAUSED' : op === 'resume' ? 'QUEUED' : 'CANCELLED'
  // The record being written finishes in its own transaction; the worker stops before the next one.
  const updated = await db.importJob.update({ where: { id: job.id }, data: { status, ...(op === 'cancel' ? { finishedAt: new Date() } : {}) } })
  if (op === 'resume') await dispatch('imports.run', job.id)
  return updated
}


export async function startRollback(job: Job) {
  if (!['DONE', 'DONE_WITH_ERRORS', 'CANCELLED', 'FAILED', 'PAUSED'].includes(job.status)) throw new ImportError('بازگردانی فقط برای ورود اطلاعات تمام‌شده، لغوشده یا متوقف‌شده ممکن است')
  const updated = await db.importJob.update({ where: { id: job.id }, data: { status: 'ROLLING_BACK', lockedUntil: null } })
  await dispatch('imports.rollback', job.id)
  return updated
}
