import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { adminNeedsTwoFactor, resolveCurrentUser } from '@/modules/identity/server/access'
import { hasPermission } from '@/modules/identity/rbac'
import { moduleGuard } from '@/extensions/server/modules'
import { panelConfig } from '@/modules/server-panel/server/gate'
import { readEngineeringPolicy } from './policy'
import { EngineeringError } from '../../domain/engineering'

export async function engineeringAuthority(run: { createdById: number | null; authAt: number | null; expiresAt: Date }, reader: Pick<Prisma.TransactionClient, 'user' | 'accessRestriction' | 'setting'> = db) {
  if (!Number.isFinite(run.authAt) || Number(run.authAt) <= 0) throw new EngineeringError('برای اختیار مهندسی دوباره وارد حساب مدیر شوید', 403)
  const actor = run.createdById ? await resolveCurrentUser(run.createdById, run.authAt, reader) : null
  if (!actor || actor.role !== 'ADMIN' || await adminNeedsTwoFactor(actor, reader) || (actor.roleId != null && !['server.manage', 'settings.manage'].every(p => hasPermission(actor.permissions || [], p))) || run.expiresAt.getTime() <= Date.now() || !panelConfig().enabled || await moduleGuard('server-panel', reader) || await moduleGuard('ai-assistant', reader) || !(await readEngineeringPolicy(reader)).enabled) throw new EngineeringError('اختیار مدیر یا دستیار لغو یا منقضی شده است؛ درخواست تازه لازم است', 403)
  return actor
}
/** Root-installed worker uses the same canonical identity/policy before a privileged promotion. */
export async function engineeringApproval(id: string, operation: 'promote' | 'rollback' | 'publish' | 'repair') {
  const run = await db.aiEngineeringRun.findUnique({ where: { id } })
  if (!run || run.status !== (operation === 'promote' ? 'DEPLOY_QUEUED' : operation === 'repair' ? 'REPAIR_QUEUED' : operation === 'publish' ? 'PUBLISHING' : 'ROLLBACK_QUEUED')) throw new EngineeringError('مرحلهٔ کار به اختیار تازهٔ مدیر نیاز دارد', 409)
  await engineeringAuthority(run)
  if (operation === 'publish') return { id, operation }
  const result = JSON.parse(run.result), approval = result.approval
  if (operation === 'repair') {
    if (!approval || approval.operation !== operation || approval.repairId !== result.repairId || approval.diagnosticHash !== result.diagnosticHash || approval.runtimeId !== result.runtimeId || !result.diagnosticHash || !['reload-proxy', 'start-proxy', 'start-current-runtime'].includes(result.repairId) || approval.at > Date.now() || Date.now() - approval.at > 15 * 60000) throw new EngineeringError('تأیید همین بازیابی معتبر نیست', 409)
    return { id, operation, repairId: result.repairId, diagnosticHash: result.diagnosticHash, runtimeId: result.runtimeId, approvedAt: approval.at }
  }
  if (!approval || approval.operation !== operation || approval.artifact !== result.artifact || approval.headSha !== result.headSha || approval.at > Date.now() || Date.now() - approval.at > 15 * 60000) throw new EngineeringError('تأیید نسخهٔ دقیق معتبر نیست', 409)
  return { id, operation, artifact: result.artifact, headSha: result.headSha, approvedAt: approval.at }
}
