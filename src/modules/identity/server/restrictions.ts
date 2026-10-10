import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { deniedCapabilities, RestrictionError } from '@/modules/identity/domain/restrictions'
import type { AuthedUser } from '@/modules/identity/server/access'
import { accountChangeRefusal, actorHasFullAccess } from '@/modules/identity/server/staff-guard'
import { hasPermission } from '@/modules/identity/rbac'

export type RestrictionTransaction = Prisma.TransactionClient
export type RestrictionContext = { req: NextRequest; actor: AuthedUser }
export type ModuleRestrictionInput = {
  userId: number; moduleKey: string; effectKey: string; capabilities: string[]
  reason: string; startsAt: Date; expiresAt: Date
  source?: 'ADMIN' | 'LEGACY_API'
}

/** Facts only: the existing owning module's authorization policy consumes them. */
export async function activeModuleRestrictions(userId: number, moduleKey: string, now = new Date()) {
  const rows = await db.accessRestriction.findMany({ where: {
    userId, scope: 'MODULE', moduleKey, revokedAt: null, startsAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  } })
  deniedCapabilities(rows, now)
  return rows
}

/** Serialize one subject's commands; the section adapter supplies its existing permission. */
export async function restrictionTransaction<T>(context: RestrictionContext, userId: number, permission: string, work: (tx: RestrictionTransaction) => Promise<T>) {
  const actor = context.actor
  if (actor.role !== 'ADMIN' || (!actorHasFullAccess(actor) && !hasPermission(actor.permissions || [], permission))) throw new RestrictionError('دسترسی کافی ندارید', 403)
  if (!Number.isSafeInteger(userId) || userId < 1) throw new RestrictionError('کاربر معتبر نیست')
  return db.$transaction(async tx => {
    if (/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL || '')) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
    if (!await tx.user.findUnique({ where: { id: userId }, select: { id: true } })) throw new RestrictionError('کاربر پیدا نشد', 404)
    const refusal = await accountChangeRefusal(actor, userId, { sensitive: true }, tx)
    if (refusal) throw new RestrictionError(refusal, 403)
    return work(tx)
  })
}

export async function insertModuleRestriction(tx: RestrictionTransaction, context: RestrictionContext, input: ModuleRestrictionInput) {
  const { moduleKey, effectKey, capabilities, startsAt, expiresAt } = input
  if (!/^[a-z][a-z0-9-]{1,49}$/.test(moduleKey) || !effectKey.startsWith(`${moduleKey}.`) || !capabilities.length || capabilities.some(key => !key.startsWith(`${moduleKey}.`) || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(key))) throw new RestrictionError('هدف محدودیت معتبر نیست')
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= startsAt || expiresAt.getTime() - startsAt.getTime() > 3650 * 86_400_000) throw new RestrictionError('بازهٔ محدودیت معتبر نیست')
  const reason = input.reason.trim()
  if (!reason || reason.length > 500) throw new RestrictionError('دلیل محدودیت را تا ۵۰۰ نویسه وارد کنید')
  const row = await tx.accessRestriction.create({ data: {
    userId: input.userId, scope: 'MODULE', moduleKey, effectKey, capabilities: JSON.stringify([...new Set(capabilities)]),
    reason, startsAt, expiresAt, issuedByUserId: context.actor.id, source: input.source || 'ADMIN',
  } })
  const audit = await auditAdminStrict({ ...context, action: 'identity.restriction.issue', targetType: 'access-restriction', targetId: row.id, metadata: { userId: row.userId, scope: row.scope, moduleKey, effectKey, capabilities, expiresAt: expiresAt.toISOString() } }, tx)
  return tx.accessRestriction.update({ where: { id: row.id }, data: { issuanceAuditId: audit.id } })
}

/** Single-row revocation uses a claim. Overlapping records keep their own lifetime. */
export async function revokeModuleRestriction(tx: RestrictionTransaction, context: RestrictionContext, input: { id: number; userId: number; moduleKey: string; reason: string }, now = new Date()) {
  if (!Number.isSafeInteger(input.id) || input.id < 1) throw new RestrictionError('شناسهٔ محدودیت معتبر نیست')
  const row = await tx.accessRestriction.findFirst({ where: { id: input.id, userId: input.userId, scope: 'MODULE', moduleKey: input.moduleKey } })
  if (!row) throw new RestrictionError('محدودیت پیدا نشد', 404)
  if (row.revokedAt) throw new RestrictionError('این محدودیت قبلاً لغو شده است', 409)
  const reason = input.reason.trim()
  if (!reason || reason.length > 500) throw new RestrictionError('دلیل لغو را تا ۵۰۰ نویسه وارد کنید')
  const audit = await auditAdminStrict({ ...context, action: 'identity.restriction.revoke', targetType: 'access-restriction', targetId: row.id, metadata: { userId: row.userId, moduleKey: row.moduleKey, effectKey: row.effectKey, reason } }, tx)
  const changed = await tx.accessRestriction.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: now, revokedByUserId: context.actor.id, revocationReason: reason, revocationAuditId: audit.id } })
  if (changed.count !== 1) throw new RestrictionError('وضعیت محدودیت تغییر کرده است', 409)
  return { id: row.id }
}

/** Legacy replacement deliberately revokes the selected effect, with one bounded audit and a state claim. */
export async function revokeModuleEffect(tx: RestrictionTransaction, context: RestrictionContext, input: { userId: number; moduleKey: string; effectKey: string; reason: string }, now = new Date()) {
  const where = { userId: input.userId, scope: 'MODULE', moduleKey: input.moduleKey, effectKey: input.effectKey, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
  const rows = await tx.accessRestriction.findMany({ where, select: { id: true } })
  if (!rows.length) return { count: 0 }
  const audit = await auditAdminStrict({ ...context, action: 'identity.restriction.replace-revoke', targetType: 'user', targetId: input.userId, metadata: { moduleKey: input.moduleKey, effectKey: input.effectKey, reason: input.reason, count: rows.length, firstIds: rows.slice(0, 50).map(row => row.id) } }, tx)
  const changed = await tx.accessRestriction.updateMany({ where, data: { revokedAt: now, revokedByUserId: context.actor.id, revocationReason: input.reason, revocationAuditId: audit.id } })
  if (changed.count !== rows.length) throw new RestrictionError('وضعیت محدودیت تغییر کرده است', 409)
  return changed
}
