import { db } from '@/platform/database/prisma'
import { isLivePost } from '@/modules/journal/domain/journal'

/**
 * The member's own article comments, last changed first, whatever their moderation state.
 * `post` is null when the article is not live (draft, scheduled or withdrawn), so its title
 * is not shown even to the commenter.
 */
export async function memberPostComments(userId: number, take: number) {
  const where = { userId }
  const [total, rows] = await Promise.all([
    db.postComment.count({ where }),
    db.postComment.findMany({
      where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: Math.max(1, Math.min(500, Math.trunc(take) || 1)),
      select: { id: true, body: true, status: true, parentId: true, updatedAt: true, post: { select: { slug: true, title: true, cover: true, status: true, publishedAt: true } } },
    }),
  ])
  return {
    total,
    comments: rows.map((row) => ({
      id: row.id, body: row.body, status: row.status, reply: row.parentId !== null, updatedAt: row.updatedAt,
      post: isLivePost(row.post) ? { title: row.post.title, url: `/blog/${encodeURIComponent(row.post.slug)}`, image: row.post.cover } : null,
    })),
  }
}
