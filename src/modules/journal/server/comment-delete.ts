import { db } from '@/platform/database/prisma'

/**
 * A member removes one of their own article comments, whatever its moderation state and whether
 * or not the article is still live. The text is always erased. A comment nobody answered is
 * removed entirely; one with answers stays as an empty placeholder (status DELETED) so the
 * answers keep their place. Returns false when the comment is not the member's.
 */
export async function deleteOwnPostComment(userId: number, commentId: number): Promise<{ deleted: boolean; placeholder: boolean }> {
  if (![userId, commentId].every((id) => Number.isSafeInteger(id) && id > 0)) return { deleted: false, placeholder: false }
  // One statement: a reply approved at this moment either is seen here or finds the row already gone.
  const removed = await db.postComment.deleteMany({ where: { id: commentId, userId, replies: { none: {} } } })
  if (removed.count) return { deleted: true, placeholder: false }
  const kept = await db.postComment.updateMany({ where: { id: commentId, userId, status: { not: 'DELETED' } }, data: { status: 'DELETED', body: '' } })
  return { deleted: kept.count > 0, placeholder: kept.count > 0 }
}
