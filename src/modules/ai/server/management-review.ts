import { createHash } from 'node:crypto'
import type { AiManagementSchedule, Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { isModuleEnabled } from '@/extensions/server/modules'
import { adminNeedsTwoFactor, currentAdminHasPermission, getRawToken, requireAdmin, resolveCurrentUser, type AuthedUser } from '@/modules/identity/server/access'
import { allowedDepartmentSlugs } from '@/modules/support/server/department-access'
import { auditAdminStrict } from '@/platform/audit/server'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { reviewCadences, type ManagementFinding, type ReviewCadence, type ReviewDecision, type ReviewHistory } from '../domain/management'
import { collectManagement, enabledManagementSections } from './management'

const day = 86_400_000
const nextRun = (cadence: string, now: Date) => cadence === 'OFF' ? null : new Date(now.getTime() + (cadence === 'WEEKLY' ? 7 : 1) * day)
type Reader = Prisma.TransactionClient
export type ReviewSnapshot = { findings: ManagementFinding[]; unavailable: string[] }
type Snapshot = ReviewSnapshot

export class ReviewError extends Error {
  constructor(message: string, readonly status = 422) { super(message) }
}

async function managementScope(actor: AuthedUser, reader: Reader) {
  const enabled = await enabledManagementSections(actor, reader)
  const departments = currentAdminHasPermission(actor, 'tickets.handle') ? await allowedDepartmentSlugs(actor, reader) : []
  const scopeKey = createHash('sha256').update(JSON.stringify({
    role: actor.roleId ?? null, permissions: [...(actor.permissions || [])].sort(), enabled, departments: departments?.sort() ?? null,
  })).digest('hex')
  return { enabled, scopeKey }
}

export async function activeReviewActor(req: NextRequest, reader: Reader) {
  if (!await isModuleEnabled('ai-assistant', reader)) throw new ReviewError('هوش مصنوعی غیرفعال است', 404)
  const actor = await requireAdmin(req, reader)
  if (!actor) throw new ReviewError('دسترسی مجاز نیست', 403)
  const scope = await managementScope(actor, reader)
  if (!scope.enabled.length) throw new ReviewError('بخش فعالی برای بررسی در دسترس شما نیست', 403)
  return { actor, ...scope }
}

export const reviewTransaction = <T>(work: (tx: Reader) => Promise<T>) => db.$transaction(work, { isolationLevel: 'Serializable', timeout: 20_000 })
const serializable = reviewTransaction
const activeActor = activeReviewActor

export function reviewHistory(req: NextRequest): Promise<ReviewHistory> {
  return serializable(async tx => {
    const { actor, scopeKey } = await activeActor(req, tx)
    const [schedule, reviews] = await Promise.all([
      tx.aiManagementSchedule.findUnique({ where: { ownerId: actor.id } }),
      tx.aiManagementReview.findMany({ where: { ownerId: actor.id, scopeKey }, orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }], take: 20 }),
    ])
    return {
      cadence: (schedule?.cadence ?? 'OFF') as ReviewCadence, nextRunAt: schedule?.nextRunAt?.toISOString() ?? null,
      scheduleVersion: schedule?.version ?? 0,
      reviews: reviews.map(row => ({ id: row.id, version: row.version, checkedAt: row.checkedAt.toISOString(), ...JSON.parse(row.findings) as Snapshot })),
    }
  })
}

export async function saveReviewSchedule(req: NextRequest, cadence: unknown, version: unknown) {
  if (!reviewCadences.includes(cadence as ReviewCadence) || !Number.isSafeInteger(version) || Number(version) < 0) throw new ReviewError('زمان‌بندی معتبر نیست')
  const token = await getRawToken(req)
  const timestamp = token?.authAt
  const authAt = typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0 && timestamp <= Date.now() ? timestamp : null
  const authMethod = typeof token?.authMethod === 'string' ? token.authMethod.slice(0, 40) : null
  if (cadence !== 'OFF' && authAt === null) throw new ReviewError('برای فعال‌کردن زمان‌بندی دوباره وارد شوید', 403)
  await serializable(async tx => {
    const { actor } = await activeActor(req, tx)
    const data = { cadence: cadence as ReviewCadence, authAt, authMethod, nextRunAt: nextRun(cadence as string, new Date()) }
    if (version === 0) await tx.aiManagementSchedule.create({ data: { ownerId: actor.id, ...data } })
    else {
      const claim = await tx.aiManagementSchedule.updateMany({ where: { ownerId: actor.id, version: Number(version) }, data: { ...data, version: { increment: 1 } } })
      if (!claim.count) throw new ReviewError('زمان‌بندی تغییر کرده است. دوباره بارگیری کنید.', 409)
    }
    await auditAdminStrict({ req, actor, action: 'ai.management.schedule', targetType: 'ai-management', metadata: { cadence } }, tx)
  })
}

async function recordReview(tx: Reader, actor: AuthedUser, scopeKey: string, slot: Date, now: Date) {
  const report = await collectManagement(actor, undefined, now, tx)
  const snapshot: Snapshot = {
    unavailable: report.sections.filter(section => section.state === 'unavailable').map(section => section.label),
    findings: report.sections.flatMap(section => section.signals.filter(signal => signal.count > 0).map(({ destination, ...signal }) => ({
      ...signal, sectionId: section.id, sectionLabel: section.label, href: destination?.href ?? section.href, status: 'PENDING', outcome: '',
    }))),
  }
  return tx.aiManagementReview.create({ data: { ownerId: actor.id, scopeKey, slot, checkedAt: now, findings: JSON.stringify(snapshot) } })
}

export function reviewNow(req: NextRequest) {
  return serializable(async tx => {
    const { actor, scopeKey } = await activeActor(req, tx)
    const now = new Date()
    const row = await recordReview(tx, actor, scopeKey, now, now)
    await auditAdminStrict({ req, actor, action: 'ai.management.snapshot', targetType: 'ai-management-review', targetId: row.id }, tx)
  })
}

const outcomes: Record<ManagementFinding['status'], readonly string[]> = {
  PENDING: ['APPROVED', 'DISMISSED'], APPROVED: ['DONE', 'DISMISSED'], DISMISSED: [], DONE: [],
}

export async function decideReview(req: NextRequest, input: Record<string, unknown>) {
  const { id, signalId, version, decision } = input
  const outcome = typeof input.outcome === 'string' ? input.outcome.trim() : ''
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(version) || typeof signalId !== 'string' || signalId.length > 80 ||
    !['APPROVED', 'DISMISSED', 'DONE'].includes(String(decision)) || typeof decision !== 'string' || outcome.length > 450 ||
    /[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/.test(outcome) || (decision !== 'APPROVED' && !outcome)) throw new ReviewError('تصمیم یا نتیجهٔ پیگیری معتبر نیست')
  await serializable(async tx => {
    const { actor, scopeKey } = await activeActor(req, tx)
    const row = await tx.aiManagementReview.findFirst({ where: { id: Number(id), ownerId: actor.id, scopeKey } })
    if (!row) throw new ReviewError('بررسی در محدودهٔ دسترسی شما پیدا نشد', 404)
    if (row.version !== version) throw new ReviewError('نتیجه هم‌زمان تغییر کرده است', 409)
    const snapshot: Snapshot = JSON.parse(row.findings)
    const finding = snapshot.findings.find(item => item.id === signalId)
    if (!finding || !outcomes[finding.status].includes(decision)) throw new ReviewError('این تغییر برای پیشنهاد مجاز نیست', 409)
    finding.status = decision as ReviewDecision
    finding.outcome = outcome
    finding.decidedAt = new Date().toISOString()
    const claim = await tx.aiManagementReview.updateMany({ where: { id: row.id, version: row.version }, data: { findings: JSON.stringify(snapshot), version: { increment: 1 } } })
    if (!claim.count) throw new ReviewError('نتیجه هم‌زمان تغییر کرده است', 409)
    await auditAdminStrict({ req, actor, action: 'ai.management.decision', targetType: 'ai-management-review', targetId: row.id,
      metadata: { signalId, decision } }, tx)
  })
}

async function runSlot(schedule: AiManagementSchedule, now: Date) {
  return serializable(async tx => {
    if (!await isModuleEnabled('ai-assistant', tx) || !schedule.nextRunAt) return false
    const actor = schedule.authAt === null ? null : await resolveCurrentUser(schedule.ownerId, schedule.authAt, tx, schedule.authMethod ?? undefined)
    const eligible = actor?.role === 'ADMIN' && !await adminNeedsTwoFactor(actor, tx)
    const scope = eligible && actor ? await managementScope(actor, tx) : null
    const enabled = Boolean(scope?.enabled.length)
    const claim = await tx.aiManagementSchedule.updateMany({
      where: { ownerId: schedule.ownerId, version: schedule.version, nextRunAt: schedule.nextRunAt },
      data: { version: { increment: 1 }, nextRunAt: enabled ? nextRun(schedule.cadence, now) : null, ...(enabled ? {} : { cadence: 'OFF' }) },
    })
    if (!claim.count || !actor || !scope || !enabled) return false
    await recordReview(tx, actor, scope.scopeKey, schedule.nextRunAt, now)
    return true
  })
}

export async function runManagementReviews(now = new Date()) {
  if (!await isModuleEnabled('ai-assistant')) return { completed: 0 }
  const due = await db.aiManagementSchedule.findMany({ where: { nextRunAt: { lte: now } }, orderBy: { nextRunAt: 'asc' }, take: 5 })
  let completed = 0
  for (const schedule of due) {
    try { if (await runSlot(schedule, now)) completed++ }
    catch (error) {
      if ((error as { code?: string })?.code !== 'P2034') logEvent('error', 'ai.management.schedule_failed', { error })
    }
  }
  return { completed }
}
