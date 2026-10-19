import type { Prisma } from '@prisma/client'
import type { QueueSourceKey } from '@/modules/moderation/domain/queue'

type Tx = Prisma.TransactionClient

/** Append once per round. A later review never edits or removes an earlier decision. */
export async function keepDecision(tx: Tx, row: { id: number; round: number; decision: string; decidedById: number | null; decidedAt: Date | null; note: string }) {
  if (!row.decidedAt || !['approve', 'reject'].includes(row.decision)) return
  const { id: caseId, round, decision, decidedById, decidedAt, note } = row
  await tx.moderationDecision.upsert({ where: { caseId_round: { caseId, round } }, create: { caseId, round, decision, decidedById, decidedAt, note }, update: {} })
}

/** Called in the owner's transaction only when the owner actually returns the item to review. */
export async function reopenOwnerCase(tx: Tx, source: QueueSourceKey, itemId: number) {
  const row = await tx.moderationCase.findUnique({ where: { source_itemId: { source, itemId } } })
  if (!row || row.status !== 'DECIDED') return { reopened: false }
  await keepDecision(tx, row)
  const changed = await tx.moderationCase.updateMany({ where: { id: row.id, round: row.round, status: 'DECIDED' }, data: { status: 'OPEN', round: { increment: 1 }, decision: '', decidedById: null, decidedAt: null, assigneeId: null, claimedAt: null, note: '' } })
  return { reopened: changed.count === 1 }
}

export const TRASH_SOURCES: Readonly<Record<string, QueueSourceKey>> = { post: 'trash-posts', 'cinema-titles': 'trash-cinema', 'music-tracks': 'trash-music-tracks', 'music-albums': 'trash-music-albums', games: 'trash-games', software: 'trash-software' }
export async function reopenTrashCase(tx: Tx, kind: string, id: number) {
  if (TRASH_SOURCES[kind]) await reopenOwnerCase(tx, TRASH_SOURCES[kind], id)
}
