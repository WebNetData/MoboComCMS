import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { auditAdminStrict } from '@/platform/audit/server'
import { plainText } from '@/shared/text/plain'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { contentChanged } from '@/modules/content/server/events'
import { recordRevision } from '@/modules/content/server/revisions'
import { postRevisionState } from '@/modules/site/server/revision-state'
import { PENDING_REVIEW, PostReviewError, REVIEW_NOTE_LIMIT, approvalPublishedAt } from '@/modules/journal/domain/journal'
import { getJournalSettings } from '@/modules/journal/server/admin'

// Magazine editorial review: while the manager asks for it, an author's article goes live only once the section's
// manager approves it; the manager may instead return it with a note. Spec: docs/specs/journal-review/SPEC.md.

type Actor = { id: number; email: string }

/** Whether authors' articles wait for the manager (read fresh: a writer is refused on the current setting). */
export async function reviewingAuthorPosts() {
  return (await getJournalSettings(true)).reviewAuthorPosts
}

/** Tells the author what was decided. The decision is already made: a notice that cannot be written is logged. */
export async function tellReviewDecision(input: { authorId: number | null; decidedById: number; postId: number; title: string; decision: 'approve' | 'return'; note?: string; at: Date }) {
  if (!input.authorId || input.authorId === input.decidedById) return
  const title = plainText(input.title, 120) || '—'
  const approved = input.decision === 'approve'
  const note = input.note ? `\nیادداشت سردبیر: ${input.note}` : ''
  try {
    await createInboxEvent({
      userId: input.authorId,
      kind: 'POST_REVIEW',
      dedupeKey: `post-review:${input.postId}:${input.decision}:${input.at.getTime()}`,
      titleFa: approved ? 'نوشتهٔ شما تأیید شد' : 'نوشتهٔ شما برای اصلاح برگشت',
      titleEn: approved ? 'Your article was approved' : 'Your article was returned for changes',
      bodyFa: approved ? `«${title}» تأیید و منتشر شد.` : `«${title}» به پیش‌نویس برگشت.${note}`,
      bodyEn: approved ? `"${title}" was approved and published.` : `"${title}" was returned to draft.${input.note ? `\nEditor's note: ${input.note}` : ''}`,
      href: `/admin/posts?edit=${input.postId}`,
    })
  } catch (error) { logEvent('error', 'journal.review_notice_failed', { postId: input.postId, decision: input.decision, error }) }
}

/**
 * The manager's decision on an article waiting for review. Written only while it is still waiting (a second decision
 * finds nothing to change and is refused); approving keeps a future publication time and moves an earlier one to now.
 */
export async function decidePostReview(input: { req: NextRequest; actor: Actor; id: number; decision: unknown; note?: unknown }) {
  if (input.decision !== 'approve' && input.decision !== 'return') throw new PostReviewError('تصمیم بازبینی معتبر نیست', 400)
  if (input.note !== undefined && typeof input.note !== 'string') throw new PostReviewError('یادداشت معتبر نیست', 400)
  const note = (input.note || '').trim()
  if (note.length > REVIEW_NOTE_LIMIT) throw new PostReviewError(`یادداشت حداکثر ${REVIEW_NOTE_LIMIT.toLocaleString('fa-IR')} نویسه است`, 400)
  const decision = input.decision
  const now = new Date()
  const before = await postRevisionState(input.id)
  const result = await db.$transaction(async (tx) => {
    const current = await tx.post.findUnique({ where: { id: input.id }, select: { id: true, title: true, status: true, publishedAt: true, authorId: true } })
    if (!current) throw new PostReviewError('این نوشته پیدا نشد', 404)
    const data = decision === 'approve' ? { status: 'PUBLISHED', publishedAt: approvalPublishedAt(current.publishedAt, now) } : { status: 'DRAFT' }
    const claimed = await tx.post.updateMany({ where: { id: input.id, status: PENDING_REVIEW }, data })
    if (claimed.count !== 1) throw new PostReviewError('این نوشته دیگر در انتظار بازبینی نیست', 409)
    await recordRevision({ entityType: 'posts', entityId: input.id, before, after: (await postRevisionState(input.id, tx))!, actor: input.actor, client: tx, strict: true })
    await auditAdminStrict({ req: input.req, actor: input.actor, action: `cms.posts.review.${decision}`, targetType: 'posts', targetId: input.id, metadata: { note: note ? note.slice(0, 200) : undefined } }, tx)
    return { current, saved: await tx.post.findUniqueOrThrow({ where: { id: input.id } }) }
  })
  contentChanged({ type: 'post', id: input.id }, before, result.saved)
  await tellReviewDecision({ authorId: result.current.authorId, decidedById: input.actor.id, postId: input.id, title: result.current.title, decision, note: note || undefined, at: now })
  return result.saved
}

/** For the staff moderation overview: articles waiting for review, the longest wait first. */
export async function waitingForReview(take = 5) {
  const where = { status: PENDING_REVIEW }
  const [count, rows] = await Promise.all([
    db.post.count({ where }),
    db.post.findMany({ where, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take, select: { id: true, title: true, excerpt: true, updatedAt: true, author: { select: { name: true, email: true } } } }),
  ])
  return { count, items: rows.map((row) => ({ id: row.id, text: plainText(row.title, 160), full: plainText(`${row.title}\n${row.excerpt}`, 2000), by: row.author?.name || row.author?.email || '', about: 'در انتظار بازبینی', at: row.updatedAt })) }
}
