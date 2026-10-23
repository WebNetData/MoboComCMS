import { db } from '@/platform/database/prisma'
import { isLivePost } from '@/modules/journal/domain/journal'
import { blockedIds } from '@/modules/identity/server/profile'
import { createInboxEvent } from '@/modules/notifications/server/inbox'

const excerpt = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 160)

/**
 * Tells the people an article comment concerns that it is now public: its author when a
 * moderator approved it, and the author of the comment it answers. Called after the status
 * became APPROVED. Operations retries a durable intent if this function throws;
 * existing Inbox dedupe makes partial delivery and repeated execution harmless.
 */
export async function notifyCommentPublished(commentId: number, by: 'moderator' | 'auto') {
    const comment = await db.postComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, body: true, status: true, post: { select: { slug: true, title: true, titleEn: true, status: true, publishedAt: true } }, parent: { select: { userId: true, status: true } } },
    })
    // Nothing is announced for a comment that is not public, or under an article that is not.
    if (!comment || comment.status !== 'APPROVED' || !isLivePost(comment.post)) return { author: false, parent: false }
    const href = `/blog/${encodeURIComponent(comment.post.slug)}`
    const title = comment.post.title, titleEn = comment.post.titleEn || comment.post.title
    let author = false
    let parent = false
    if (by === 'moderator') {
      await createInboxEvent({
        userId: comment.userId, kind: 'COMMENT_APPROVED', dedupeKey: `post-comment:${comment.id}:approved`,
        titleFa: 'دیدگاه شما منتشر شد', titleEn: 'Your comment is live',
        bodyFa: `دیدگاه شما زیر «${title}» تأیید و منتشر شد.`, bodyEn: `Your comment on ${titleEn} was published.`, href,
      })
      author = true
    }
    const target = comment.parent
    if (target && target.status === 'APPROVED' && target.userId !== comment.userId && !(await blockedIds(target.userId)).includes(comment.userId)) {
      await createInboxEvent({
        userId: target.userId, kind: 'COMMENT_REPLY', dedupeKey: `post-comment:${comment.id}:reply`,
        titleFa: `پاسخ تازه به دیدگاه شما زیر «${title}»`, titleEn: `New reply to your comment on ${titleEn}`,
        bodyFa: excerpt(comment.body), bodyEn: excerpt(comment.body), href,
      })
      parent = true
    }
    return { author, parent }
}
