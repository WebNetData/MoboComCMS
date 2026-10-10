import { db } from '@/platform/database/prisma'
import type { Prisma } from '@prisma/client'
import { restrictionActive, RestrictionError } from '@/modules/identity/domain/restrictions'
import { activeModuleRestrictions, insertModuleRestriction, restrictionTransaction, revokeModuleRestriction, revokeModuleEffect, type RestrictionContext, type RestrictionTransaction } from '@/modules/identity/server/restrictions'
import { isModuleEnabled } from '@/extensions/server/modules'
import { actorHasFullAccess } from '@/modules/identity/server/staff-guard'
import { hasPermission } from '@/modules/identity/rbac'

export const FORUM_RESTRICTION_EFFECTS = ['forum.silence', 'forum.suspend'] as const
type Effect = (typeof FORUM_RESTRICTION_EFFECTS)[number]
const fields = { 'forum.silence': 'silencedUntil', 'forum.suspend': 'suspendedUntil' } as const
const capabilities = ['forum.participate', 'forum.private-message']
const stamp = (date: Date | null) => date?.toISOString() || null
const projected = (profile: { silencedUntil: Date | null; suspendedUntil: Date | null }) => ({ silencedUntil: stamp(profile.silencedUntil), suspendedUntil: stamp(profile.suspendedUntil) })
const legacyReason = 'تغییر یا لغو از مسیر سازگار با نسخهٔ قبلی'

function effectOf(value: unknown): Effect {
  if (!FORUM_RESTRICTION_EFFECTS.includes(value as Effect)) throw new RestrictionError('نوع محدودیت انجمن معتبر نیست')
  return value as Effect
}

async function lockSubject(tx: RestrictionTransaction, userId: number) {
  if (/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL || '')) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
}

/** Import old-writer changes without inventing their issuer or erasing history. Caller holds the subject lock. */
async function syncLegacy(tx: RestrictionTransaction, userId: number, now: Date) {
  const profile = await tx.forumProfile.findUnique({ where: { userId } })
  if (!profile) throw new RestrictionError('کاربر انجمن پیدا نشد', 404)
  let snapshot: Record<string, string | null> | null = null
  if (profile.sanctionProjection) {
    try { snapshot = JSON.parse(profile.sanctionProjection) } catch { throw new RestrictionError('نمای سازگاری محدودیت معتبر نیست', 503) }
    if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object' || Object.keys(snapshot).length !== 2 || !Object.hasOwn(snapshot, 'silencedUntil') || !Object.hasOwn(snapshot, 'suspendedUntil') || Object.values(snapshot).some(value => value !== null && (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime()) || new Date(value).toISOString() !== value))) throw new RestrictionError('نمای سازگاری محدودیت معتبر نیست', 503)
  }
  const current = projected(profile)
  for (const effectKey of FORUM_RESTRICTION_EFFECTS) {
    const field = fields[effectKey], until = profile[field]
    if (snapshot && snapshot[field] === current[field]) continue
    if (snapshot) await tx.accessRestriction.updateMany({ where: { userId, scope: 'MODULE', moduleKey: 'forum', effectKey, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, data: { revokedAt: now, revocationReason: legacyReason } })
    if (until) {
      const sourceKey = snapshot ? `legacy-forum-external:${userId}:${effectKey}:${profile.updatedAt.toISOString()}:${until.toISOString()}` : `legacy-forum:${userId}:${effectKey}`
      await tx.accessRestriction.upsert({ where: { sourceKey }, update: {}, create: {
        userId, scope: 'MODULE', moduleKey: 'forum', effectKey, capabilities: JSON.stringify(capabilities),
        reason: profile.moderationNote, startsAt: new Date(Math.min(0, until.getTime() - 1)), expiresAt: until,
        sourceKey, source: snapshot ? 'LEGACY_EXTERNAL' : 'LEGACY', sourceMetadata: JSON.stringify({ issuerUnknown: true, startUnknown: true }),
      } })
    }
  }
  return profile
}

async function project(tx: RestrictionTransaction, userId: number, now: Date) {
  const rows = await tx.accessRestriction.findMany({ where: { userId, scope: 'MODULE', moduleKey: 'forum', revokedAt: null } })
  const dates: { silencedUntil: Date | null; suspendedUntil: Date | null } = { silencedUntil: null, suspendedUntil: null }
  for (const row of rows) {
    if (!restrictionActive(row, now)) continue
    const field = fields[row.effectKey as Effect]
    if (!field) throw new RestrictionError('نوع محدودیت ذخیره‌شدهٔ انجمن معتبر نیست', 503)
    // Forum commands currently require a finite expiry, matching existing controls.
    const until = row.expiresAt || new Date('9999-12-31T23:59:59.999Z')
    if (!dates[field] || until > dates[field]!) dates[field] = until
  }
  const snapshot = JSON.stringify(projected(dates)), profile = await tx.forumProfile.findUniqueOrThrow({ where: { userId } })
  if (profile.sanctionProjection !== snapshot || stamp(profile.silencedUntil) !== stamp(dates.silencedUntil) || stamp(profile.suspendedUntil) !== stamp(dates.suspendedUntil)) {
    await tx.forumProfile.update({ where: { userId }, data: { ...dates, sanctionProjection: snapshot } })
  }
  return rows.filter(row => restrictionActive(row, now))
}

/** Normal reads use fresh facts; only a legacy write or changed time boundary needs projection repair. */
export async function forumRestrictionState(userId: number, now = new Date()) {
  const [profile, active] = await Promise.all([db.forumProfile.findUnique({ where: { userId } }), activeModuleRestrictions(userId, 'forum', now)])
  if (!profile) return { silenced: false, suspended: false, participationDenied: false, silencedUntil: null as Date | null, suspendedUntil: null as Date | null }
  const expected = { silencedUntil: null as string | null, suspendedUntil: null as string | null }
  for (const row of active) {
    const field = fields[row.effectKey as Effect]
    if (!field) throw new RestrictionError('نوع محدودیت ذخیره‌شدهٔ انجمن معتبر نیست', 503)
    const date = stamp(row.expiresAt) || '9999-12-31T23:59:59.999Z'
    if (!expected[field] || date > expected[field]!) expected[field] = date
  }
  let rows = active
  if (!profile.sanctionProjection || JSON.stringify(projected(profile)) !== profile.sanctionProjection || JSON.stringify(expected) !== profile.sanctionProjection) {
    rows = await db.$transaction(async tx => { await lockSubject(tx, userId); await syncLegacy(tx, userId, now); return project(tx, userId, now) })
  }
  const endOf = (effectKey: Effect) => rows.filter(row => row.effectKey === effectKey).reduce<Date | null>((until, row) => {
    const end = row.expiresAt || new Date('9999-12-31T23:59:59.999Z')
    return !until || end > until ? end : until
  }, null)
  return {
    silenced: rows.some(row => row.effectKey === 'forum.silence'), suspended: rows.some(row => row.effectKey === 'forum.suspend'),
    silencedUntil: endOf('forum.silence'), suspendedUntil: endOf('forum.suspend'),
    // Preserve old staff/category exceptions for legacy commands; a new explicit deny outranks a grant.
    participationDenied: rows.some(row => row.source === 'ADMIN'),
  }
}

async function requireForumRestrictionPermission(context: RestrictionContext) {
  if (context.actor.role !== 'ADMIN' || (!actorHasFullAccess(context.actor) && !hasPermission(context.actor.permissions || [], 'forum.moderate'))) throw new RestrictionError('دسترسی کافی ندارید', 403)
  if (!await isModuleEnabled('forum')) throw new RestrictionError('انجمن غیرفعال است', 404)
}

export async function forumRestrictionHistory(context: RestrictionContext, userId: number, before?: number) {
  await requireForumRestrictionPermission(context)
  if (!Number.isSafeInteger(userId) || userId < 1 || (before !== undefined && (!Number.isSafeInteger(before) || before < 1))) throw new RestrictionError('ورودی نامعتبر است')
  await forumRestrictionState(userId)
  const rows = await db.accessRestriction.findMany({ where: { userId, scope: 'MODULE', moduleKey: 'forum', ...(before ? { id: { lt: before } } : {}) }, orderBy: { id: 'desc' }, take: 51, select: { id: true, effectKey: true, reason: true, source: true, issuedAt: true, startsAt: true, expiresAt: true, issuedByUserId: true, revokedAt: true, revokedByUserId: true, revocationReason: true } })
  return { rows: rows.slice(0, 50), next: rows.length > 50 ? rows[49].id : null }
}

type ForumRestrictionCommand = { userId: number; operation: 'issue' | 'revoke' | 'replace'; effectKey?: unknown; id?: number; days?: number; startsAt?: string; reason?: string }
async function applyCommand(tx: RestrictionTransaction, context: RestrictionContext, input: ForumRestrictionCommand, profile: { moderationNote: string }, now: Date) {
    let result: unknown
    if (input.operation === 'revoke') {
      result = await revokeModuleRestriction(tx, context, { id: input.id || 0, userId: input.userId, moduleKey: 'forum', reason: input.reason || '' }, now)
    } else {
      const effectKey = effectOf(input.effectKey), days = Number(input.days)
      if (!Number.isInteger(days) || days < (input.operation === 'replace' ? 0 : 1) || days > 3650) throw new RestrictionError('مدت محدودیت معتبر نیست')
      if (input.operation === 'replace') {
        await revokeModuleEffect(tx, context, { userId: input.userId, moduleKey: 'forum', effectKey, reason: legacyReason }, now)
      }
      const startsAt = input.startsAt ? new Date(input.startsAt) : now
      const proposedReason = input.reason?.trim() || (input.operation === 'replace' ? profile.moderationNote.trim() || 'محدودیت از مدیریت انجمن' : '')
      // Old stored notes were unbounded. Keep them intact; a date-only command needs a bounded new reason.
      const reason = input.operation === 'replace' && proposedReason.length > 500 ? 'محدودیت از مدیریت انجمن؛ یادداشت کامل در پروفایل محفوظ است' : proposedReason
      if (days) result = await insertModuleRestriction(tx, context, { userId: input.userId, moduleKey: 'forum', effectKey, capabilities, startsAt, expiresAt: new Date(startsAt.getTime() + days * 86_400_000), reason, source: input.operation === 'replace' ? 'LEGACY_API' : 'ADMIN' })
      else result = { userId: input.userId }
    }
    return result
}

export async function changeForumRestrictions(context: RestrictionContext, input: ForumRestrictionCommand) {
  await requireForumRestrictionPermission(context)
  return restrictionTransaction(context, input.userId, 'forum.moderate', async tx => {
    const now = new Date(), profile = await syncLegacy(tx, input.userId, now)
    const result = await applyCommand(tx, context, input, profile, now)
    await project(tx, input.userId, now)
    return result
  })
}

/** Preserve one legacy PATCH's replace/clear and cosmetic writes as one transaction. */
export async function replaceForumRestrictions(context: RestrictionContext, userId: number, input: { silenceDays?: number; suspendDays?: number }, data: Prisma.ForumProfileUpdateInput) {
  await requireForumRestrictionPermission(context)
  return restrictionTransaction(context, userId, 'forum.moderate', async tx => {
    const now = new Date(), profile = await syncLegacy(tx, userId, now)
    await tx.forumProfile.update({ where: { userId }, data })
    for (const [field, effectKey] of [['silenceDays', 'forum.silence'], ['suspendDays', 'forum.suspend']] as const) {
      if (input[field] === undefined) continue
      await applyCommand(tx, context, { userId, operation: 'replace', effectKey, days: input[field], reason: typeof data.moderationNote === 'string' ? data.moderationNote : profile.moderationNote || undefined }, profile, now)
    }
    await project(tx, userId, now)
    return { userId }
  })
}
