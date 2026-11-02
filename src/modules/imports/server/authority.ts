import type { ImportJob } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { adminNeedsTwoFactor, resolveCurrentUser } from '@/modules/identity/server/access'
import { hasPermission } from '@/modules/identity/rbac'
import type { Prisma } from '@prisma/client'
import { getImporter, type ImportContext } from '@/modules/imports/server/registry'
import { moduleGuard } from '@/extensions/server/modules'

/** Reuse canonical Identity; imports.manage remains the existing command permission. */
export async function authorizedImportActor(id: number, authorizedAt: Date, adapterId?: string, reader: Prisma.TransactionClient | typeof db = db) {
  const user = await resolveCurrentUser(id, authorizedAt.getTime(), reader)
  if (!user || user.role !== 'ADMIN' || await adminNeedsTwoFactor(user, reader)) return null
  if (user.roleId != null && !hasPermission(user.permissions || [], 'imports.manage')) return null
  const adapter = adapterId ? getImporter(adapterId) : null
  if (adapterId && !adapter) return null
  if (user.roleId != null && adapter?.permissions?.some(permission => !hasPermission(user.permissions || [], permission))) return null
  if (adapter?.permissions?.length) for (const module of [adapter.module, ...(adapter.requiredModules || [])].filter((value): value is string => !!value)) if (await moduleGuard(module, reader)) return null
  return user
}

/** Null actor pairs are legacy jobs, not an implicit privilege exemption. */
export async function currentImportActor(job: ImportJob) {
  if ((job.executionActorId == null) !== (job.executionAuthorizedAt == null)) return null
  try {
    return await authorizedImportActor(job.executionActorId ?? job.createdById, job.executionAuthorizedAt ?? job.createdAt, job.adapter)
  } catch (error) {
    logEvent('warn', 'imports.authority_unavailable', { jobId: job.id, errorName: error instanceof Error ? error.name : 'Unknown' })
    return null // unavailable authority never permits a content or rollback write
  }
}

/** Recheck the actual operator, job direction and destination inside each new owner write/undo transaction. */
export async function destinationActor(ctx: ImportContext, tx: Prisma.TransactionClient, rollback = false) {
  const adapter = getImporter(ctx.settings.adapter)
  if (!adapter) throw new Error('مقصد معتبر نیست')
  for (const id of [adapter.module, ...(adapter.requiredModules || [])].filter((id): id is string => !!id)) if (await moduleGuard(id, tx)) throw new Error('بخش موردنظر غیرفعال است')
  const job = ctx.jobId && !ctx.dryRun ? await tx.importJob.findUnique({ where: { id: ctx.jobId } }) : null
  if (!ctx.dryRun && (!job || job.status !== (rollback ? 'ROLLING_BACK' : 'RUNNING') || job.executionMode !== (rollback ? 'ROLLBACK' : 'RUN') || job.executionGeneration !== ctx.executionGeneration || (job.executionActorId ?? job.createdById) !== ctx.actor.id)) throw new Error('اختیار یا جهت اجرای کار تغییر کرده است')
  const actor = await authorizedImportActor(ctx.actor.id, job?.executionAuthorizedAt ?? job?.createdAt ?? new Date(), adapter.id, tx)
  if (!actor) throw new Error('دسترسی اپراتور به مقصد معتبر نیست')
  return actor
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
