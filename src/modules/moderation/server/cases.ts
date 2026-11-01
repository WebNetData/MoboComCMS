import { db } from '@/platform/database/prisma'
import type { Prisma } from '@prisma/client'
import { ABANDONED_DAYS, CLAIM_HOURS, claimIsFresh, claimRefusal, cleanCaseNote, type CaseStatus, type CaseView } from '@/modules/moderation/domain/cases'
import type { QueueSourceKey } from '@/modules/moderation/domain/queue'
import { keepDecision, TRASH_SOURCES } from '@/modules/moderation/server/rounds'
export { reopenOwnerCase, reopenTrashCase } from '@/modules/moderation/server/rounds'

export class CaseError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** Called only after an authorized owner decision, in its transaction. Never decides or creates content. */
export async function completeOwnerCase(tx: Prisma.TransactionClient, source: QueueSourceKey, itemId: number, staffId: number, decision: 'approve' | 'reject', note?: string) {
  if (!Number.isSafeInteger(itemId) || itemId <= 0 || !Number.isSafeInteger(staffId) || staffId <= 0) throw new CaseError('شناسهٔ تصمیم معتبر نیست')
  const row = await tx.moderationCase.upsert({ where: { source_itemId: { source, itemId } }, create: { source, itemId }, update: {} })
  const changed = await tx.moderationCase.updateMany({ where: { id: row.id, round: row.round, status: { in: ['OPEN', 'CLAIMED', 'CLOSED'] } }, data: { status: 'DECIDED', decision, decidedById: staffId, decidedAt: new Date(), assigneeId: null, claimedAt: null, ...(note === undefined ? {} : { note: cleanCaseNote(note) }) } })
  if (changed.count) await keepDecision(tx, await tx.moderationCase.findUniqueOrThrow({ where: { id: row.id } }))
  return changed
}

/** Trash decisions have the same source keys in both the overview and the owning editor. */
export async function completeTrashCase(tx: Prisma.TransactionClient, kind: string, itemId: number, staffId: number, decision: 'restored' | 'deleted') {
  if (TRASH_SOURCES[kind]) await completeOwnerCase(tx, TRASH_SOURCES[kind], itemId, staffId, decision === 'deleted' ? 'approve' : 'reject')
}

const staffNames = async (ids: (number | null)[]) => {
  const wanted = [...new Set(ids.filter((id): id is number => !!id))]
  const rows = wanted.length ? await db.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true, email: true } }) : []
  return new Map(rows.map((row) => [row.id, row.name || row.email.split('@')[0]]))
}

/** The cases of these items of one source, for the staff member looking at the overview. */
export async function casesFor(source: QueueSourceKey, itemIds: number[], staffId: number, now = new Date()): Promise<Map<number, CaseView>> {
  if (!itemIds.length) return new Map()
  const rows = await db.moderationCase.findMany({ where: { source, itemId: { in: itemIds } } })
  const names = await staffNames(rows.map((row) => row.assigneeId))
  return new Map(rows.map((row) => {
    const held = row.status === 'CLAIMED' && claimIsFresh(row.claimedAt, now) && row.assigneeId
    return [row.itemId, { round: row.round, status: (row.status === 'CLAIMED' && !held ? 'OPEN' : row.status) as CaseStatus, assignee: held ? { id: held, name: names.get(held) || '' } : null, mine: held === staffId, note: row.note }]
  }))
}

/**
 * Takes an item: nobody else works on it meanwhile. A stale claim, or one's own, is simply renewed.
 * The taking is one conditional write, so of two staff members clicking together the database lets one through.
 */
export async function claimCase(source: QueueSourceKey, itemId: number, staffId: number, takeOver = false, now = new Date(), round = 1) {
  await db.moderationCase.upsert({ where: { source_itemId: { source, itemId } }, create: { source, itemId }, update: {} })
  const stale = new Date(now.getTime() - CLAIM_HOURS * 3_600_000)
  const free = takeOver ? {} : { OR: [{ status: { not: 'CLAIMED' } }, { assigneeId: staffId }, { claimedAt: null }, { claimedAt: { lte: stale } }] }
  const taken = await db.moderationCase.updateMany({ where: { source, itemId, round, status: { not: 'DECIDED' }, ...free }, data: { status: 'CLAIMED', assigneeId: staffId, claimedAt: now } })
  if (taken.count === 1) return { status: 'CLAIMED' as const }
  const row = await db.moderationCase.findUnique({ where: { source_itemId: { source, itemId } }, select: { round: true, status: true, assigneeId: true, claimedAt: true } })
  if (row && row.round !== round) throw new CaseError('دور بررسی تغییر کرده است؛ صف را تازه کنید', 409)
  throw new CaseError(claimRefusal(row, staffId, now, takeOver) || 'همکار دیگری همین حالا روی این مورد کار می‌کند', 409)
}

/** Lets go of an item one holds. */
export async function releaseCase(source: QueueSourceKey, itemId: number, staffId: number, round = 1) {
  const changed = await db.moderationCase.updateMany({ where: { source, itemId, round, status: 'CLAIMED', assigneeId: staffId }, data: { status: 'OPEN', assigneeId: null, claimedAt: null } })
  if (!changed.count) throw new CaseError('این مورد در دست شما نیست', 409)
  return { status: 'OPEN' as const }
}

/** A note for colleagues, kept with the case. An empty note removes it. */
export async function noteCase(source: QueueSourceKey, itemId: number, value: unknown, round = 1) {
  const note = cleanCaseNote(value)
  await db.moderationCase.upsert({ where: { source_itemId: { source, itemId } }, create: { source, itemId }, update: {} })
  const changed = await db.moderationCase.updateMany({ where: { source, itemId, round, status: { not: 'DECIDED' } }, data: { note } })
  if (!changed.count) throw new CaseError('این مورد تصمیم‌گیری شده است', 409)
  return { note }
}

/**
 * Legacy overview acknowledgement. Only the owner's atomic command can record a decision;
 * a delayed acknowledgement can never decide a reopened round or invent a decision.
 */
export async function recordDecision(source: QueueSourceKey, itemId: number, _staffId: number, decision: unknown, round = 1) {
  const made = decision === 'approve' || decision === 'reject' ? decision : null
  if (!made) throw new CaseError('تصمیم نامعتبر است')
  const row = await db.moderationCase.findUnique({ where: { source_itemId: { source, itemId } } })
  return { recorded: row?.round === round && row.status === 'DECIDED' && row.decision === made }
}

/** The latest decisions sent from the overview, for the sources this staff member may see. */
export async function recentDecisions(sources: QueueSourceKey[], take = 20) {
  if (!sources.length) return []
  const rows = await db.moderationDecision.findMany({ where: { case: { source: { in: sources } } }, orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }], take, include: { case: { select: { source: true, itemId: true } } } })
  const names = await staffNames(rows.map((row) => row.decidedById))
  return rows.map((row) => ({ id: row.id, round: row.round, source: row.case.source as QueueSourceKey, itemId: row.case.itemId, decision: row.decision, by: names.get(row.decidedById || 0) || '', at: row.decidedAt.toISOString(), note: row.note }))
}

/** What one staff member holds now, across sources. */
export async function myOpenCases(staffId: number, sources: QueueSourceKey[], now = new Date()) {
  const rows = sources.length ? await db.moderationCase.findMany({ where: { status: 'CLAIMED', assigneeId: staffId, source: { in: sources } }, orderBy: { claimedAt: 'asc' }, take: 50, select: { source: true, itemId: true, claimedAt: true } }) : []
  return rows.filter((row) => claimIsFresh(row.claimedAt, now)).map((row) => ({ source: row.source as QueueSourceKey, itemId: row.itemId, claimedAt: row.claimedAt!.toISOString() }))
}

/** Worker step: claims nobody finished for a week are closed, so the table holds work, not leftovers. */
export async function closeAbandonedCases(now = new Date(), limit = 500) {
  const rows = await db.moderationCase.findMany({ where: { status: 'CLAIMED', claimedAt: { lt: new Date(now.getTime() - ABANDONED_DAYS * 86_400_000) } }, orderBy: { id: 'asc' }, take: limit, select: { id: true } })
  if (!rows.length) return { closed: 0 }
  const closed = await db.moderationCase.updateMany({ where: { id: { in: rows.map((row) => row.id) }, status: 'CLAIMED' }, data: { status: 'CLOSED', assigneeId: null, claimedAt: null } })
  return { closed: closed.count }
}
