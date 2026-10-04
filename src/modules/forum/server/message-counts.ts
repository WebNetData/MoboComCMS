import { db } from '@/platform/database/prisma'

/** Personal unread conversation count, shared by the topic overview and message readers. */
export async function unreadMessageCount(userId: number | null) {
  if (!userId) return 0
  const rows = await db.forumConversationUser.findMany({ where: { userId, left: false, archived: false }, select: { lastRead: true, conversation: { select: { postCount: true } } } })
  return rows.filter((row) => row.lastRead < row.conversation.postCount).length
}
