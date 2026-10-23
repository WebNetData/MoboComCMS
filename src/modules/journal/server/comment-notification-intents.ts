import type { Prisma } from '@prisma/client'
import { enqueue } from '@/modules/operations/server/enqueue'

/** The publication and its durable notice must either both commit or both roll back. */
export function queueCommentNotification(tx: Prisma.TransactionClient, commentId: number, by: 'moderator' | 'auto') {
  return enqueue('journal.comment-published', { commentId, by }, { dedupeKey: `journal-comment:${commentId}:${by}` }, tx)
}
