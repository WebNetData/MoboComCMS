import { db } from '@/platform/database/prisma'
import { ABANDONED_DAYS, CLAIM_HOURS, claimIsFresh, claimRefusal, cleanCaseNote, type CaseStatus, type CaseView } from '@/modules/moderation/domain/cases'
import type { QueueSourceKey } from '@/modules/moderation/domain/queue'

export class CaseError extends Error {
  constructor(message: string, public status = 400) { super(message) }
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
    return [row.itemId, { status: (row.status === 'CLAIMED' && !held ? 'OPEN' : row.status) as CaseStatus, assignee: held ? { id: held, name: names.get(held) || '' } : null, mine: held === staffId, note: row.note }]
  }))
}

/**
 * Takes an item: nobody else works on it meanwhile. A stale claim, or one's own, is simply renewed.
 * The taking is one conditional write, so of two staff members clicking together the database lets one through.
 */
export async function claimCase(source: QueueSourceKey, itemId: number, staffId: number, takeOver = false, now = new Date()) {
  await db.moderationCase.upsert({ where: { source_itemId: { source, itemId } }, create: { source, itemId }, update: {} })
  const stale = new Date(now.getTime() - CLAIM_HOURS * 3_600_000)
  const free = takeOver ? {} : { OR: [{ status: { not: 'CLAIMED' } }, { assigneeId: staffId }, { claimedAt: null }, { claimedAt: { lte: stale } }] }
  const taken = await db.moderationCase.updateMany({ where: { source, itemId, status: { not: 'DECIDED' }, ...free }, data: { status: 'CLAIMED', assigneeId: staffId, claimedAt: now } })
  if (taken.count === 1) return { status: 'CLAIMED' as const }
  const row = await db.moderationCase.findUnique({ where: { source_itemId: { source, itemId } }, select: { status: true, assigneeId: true, claimedAt: true } })
  throw new CaseError(claimRefusal(row, staffId, now, takeOver) || 'همکار دیگری همین حالا روی این مورد کار می‌کند', 409)
}

/** Lets go of an item one holds. */
export async function releaseCase(source: QueueSourceKey, itemId: number, staffId: number) {
  const changed = await db.moderationCase.updateMany({ where: { source, itemId, status: 'CLAIMED', assigneeId: staffId }, data: { status: 'OPEN', assigneeId: null, claimedAt: null } })
  if (!changed.count) throw new CaseError('این مورد در دست شما نیست', 409)
  return { status: 'OPEN' as const }
}

/** A note for colleagues, kept with the case. An empty note removes it. */
export async function noteCase(source: QueueSourceKey, itemId: number, value: unknown) {
  const note = cleanCaseNote(value)
  const row = await db.moderationCase.upsert({ where: { source_itemId: { source, itemId } }, create: { source, itemId, note }, update: { note } })
  if (row.status === 'DECIDED') throw new CaseError('این مورد تصمیم‌گیری شده است', 409)
  return { note }
}

/**
 * Records that a decision sent from the overview was accepted by the owner. Recording decides nothing:
 * the owner already did. A case decided once keeps its first record.
 */
export async function recordDecision(source: QueueSourceKey, itemId: number, staffId: number, decision: unknown, now = new Date()) {
  const made = decision === 'approve' || decision === 'reject' ? decision : null
  if (!made) throw new CaseError('تصمیم نامعتبر است')
  await db.moderationCase.upsert({ where: { source_itemId: { source, itemId } }, create: { source, itemId }, update: {} })
  const changed = await db.moderationCase.updateMany({ where: { source, itemId, status: { not: 'DECIDED' } }, data: { status: 'DECIDED', decision: made, decidedById: staffId, decidedAt: now, assigneeId: null, claimedAt: null } })
  return { recorded: changed.count === 1 }
}

/** The latest decisions sent from the overview, for the sources this staff member may see. */
export async function recentDecisions(sources: QueueSourceKey[], take = 20) {
  if (!sources.length) return []
  const rows = await db.moderationCase.findMany({ where: { status: 'DECIDED', source: { in: sources } }, orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }], take, select: { id: true, source: true, itemId: true, decision: true, decidedById: true, decidedAt: true, note: true } })
  const names = await staffNames(rows.map((row) => row.decidedById))
  return rows.map((row) => ({ id: row.id, source: row.source as QueueSourceKey, itemId: row.itemId, decision: row.decision, by: names.get(row.decidedById || 0) || '', at: row.decidedAt?.toISOString() || '', note: row.note }))
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
