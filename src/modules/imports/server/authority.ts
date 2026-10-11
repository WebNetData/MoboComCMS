import type { ImportJob } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { adminNeedsTwoFactor, resolveCurrentUser } from '@/modules/identity/server/access'
import { hasPermission } from '@/modules/identity/rbac'

/** Reuse canonical Identity; imports.manage remains the existing command permission. */
export async function authorizedImportActor(id: number, authorizedAt: Date) {
  const user = await resolveCurrentUser(id, authorizedAt.getTime())
  if (!user || user.role !== 'ADMIN' || await adminNeedsTwoFactor(user)) return null
  if (user.roleId != null && !hasPermission(user.permissions || [], 'imports.manage')) return null
  return user
}

/** Null actor pairs are legacy jobs, not an implicit privilege exemption. */
export async function currentImportActor(job: ImportJob) {
  if ((job.executionActorId == null) !== (job.executionAuthorizedAt == null)) return null
  try {
    return await authorizedImportActor(job.executionActorId ?? job.createdById, job.executionAuthorizedAt ?? job.createdAt)
  } catch (error) {
    logEvent('warn', 'imports.authority_unavailable', { jobId: job.id, errorName: error instanceof Error ? error.name : 'Unknown' })
    return null // unavailable authority never permits a content or rollback write
  }
}

/** Do not reset progress or direction; an explicit authorized resume is required. */
export async function pauseForImportAuthority(job: ImportJob) {
  await db.importJob.updateMany({
    where: { id: job.id, status: { in: ['QUEUED', 'RUNNING', 'ROLLING_BACK'] }, executionActorId: job.executionActorId, executionAuthorizedAt: job.executionAuthorizedAt, executionGeneration: job.executionGeneration },
    data: { status: 'PAUSED', lockedUntil: null, error: 'اجرای کار متوقف شد؛ اختیار اپراتور معتبر نیست یا بررسی آن در دسترس نیست. برای ادامه با حساب مجاز اقدام کنید.' },
  })
}

/** Check job generation/state as well as account facts before the next unit of work. */
export async function continuingImportActor(job: ImportJob, status: 'RUNNING' | 'ROLLING_BACK') {
  const current = await db.importJob.findUnique({ where: { id: job.id } })
  if (!current || current.status !== status || current.executionMode !== job.executionMode
    || current.executionGeneration !== job.executionGeneration
    || current.executionActorId !== job.executionActorId
    || current.executionAuthorizedAt?.getTime() !== job.executionAuthorizedAt?.getTime()) return null
  const actor = await currentImportActor(current)
  if (!actor) await pauseForImportAuthority(current)
  return actor
}
