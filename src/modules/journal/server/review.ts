import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { auditAdminStrict } from '@/platform/audit/server'
import { plainText } from '@/shared/text/plain'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { contentChanged } from '@/modules/content/server/events'
import { recordRevision } from '@/modules/content/server/revisions'
import { postRevisionState } from '@/modules/site/server/revision-state'
import { PENDING_REVIEW, PROPOSAL_TEXT_FIELDS, PostReviewError, REVIEW_NOTE_LIMIT, approvalPublishedAt, proposalChanges, readProposalChanges, type PostProposalChanges } from '@/modules/journal/domain/journal'
import { validateCategorySelection } from '@/modules/site/server/categories'
import { postCategories } from '@/modules/site/domain/categories'
import { getJournalSettings } from '@/modules/journal/server/admin'

// Magazine editorial review: while the manager asks for it, an author's article goes live only once the section's
// manager approves it; the manager may instead return it with a note. Spec: docs/specs/journal-review/SPEC.md.

type Actor = { id: number; email: string }

/** Whether authors' articles wait for the manager (read fresh: a writer is refused on the current setting). */
export async function reviewingAuthorPosts() {
  return (await getJournalSettings(true)).reviewAuthorPosts
}

/** Tells the author what was decided. The decision is already made: a notice that cannot be written is logged. */
export async function tellReviewDecision(input: { authorId: number | null; decidedById: number; postId: number; title: string; decision: 'approve' | 'return'; note?: string; at: Date; proposal?: boolean }) {
  if (!input.authorId || input.authorId === input.decidedById) return
  const title = plainText(input.title, 120) || '—'
  const approved = input.decision === 'approve'
  if (input.proposal) return tellProposalDecision({ ...input, title, approved })
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

async function tellProposalDecision(input: { authorId: number | null; postId: number; title: string; approved: boolean; note?: string; at: Date }) {
  const note = input.note ? `\nیادداشت سردبیر: ${input.note}` : ''
  try {
    await createInboxEvent({
      userId: input.authorId!,
      kind: 'POST_REVIEW',
      dedupeKey: `post-proposal:${input.postId}:${input.approved ? 'apply' : 'reject'}:${input.at.getTime()}`,
      titleFa: input.approved ? 'پیشنهاد ویرایش شما اعمال شد' : 'پیشنهاد ویرایش شما پذیرفته نشد',
      titleEn: input.approved ? 'Your proposed edit was applied' : 'Your proposed edit was not accepted',
      bodyFa: input.approved ? `تغییرات پیشنهادی شما روی «${input.title}» اعمال شد.` : `پیشنهاد ویرایش «${input.title}» کنار گذاشته شد؛ نسخهٔ منتشرشده تغییری نکرد.${note}`,
      bodyEn: input.approved ? `Your proposed changes to "${input.title}" were applied.` : `Your proposed edit of "${input.title}" was set aside; the published version is unchanged.${input.note ? `\nEditor's note: ${input.note}` : ''}`,
      href: `/admin/posts?edit=${input.postId}`,
    })
  } catch (error) { logEvent('error', 'journal.proposal_notice_failed', { postId: input.postId, error }) }
}

// ------------------------------------------------------------------ edit proposals of published articles

type Sanitize = (data: Record<string, unknown>) => Record<string, unknown>
/**
 * An author's save of their published article while review is on: the fields it changes become the article's proposal
 * (replacing an open one); the live article is untouched. The body of an article written in blocks is not proposed here.
 */
export async function proposePostEdit(input: { req: NextRequest; actor: Actor; id: number; body: Record<string, unknown>; sanitize: Sanitize }) {
  return db.$transaction(async (tx) => {
    const post = await tx.post.findUnique({ where: { id: input.id }, include: { category: true, categories: { include: { category: true } } } })
    if (!post || post.status !== 'PUBLISHED') throw new PostReviewError('این نوشته منتشرشده نیست', 409)
    const asked: Record<string, unknown> = {}
    for (const field of PROPOSAL_TEXT_FIELDS) if (input.body[field] !== undefined) asked[field] = input.body[field]
    if (post.editorFormat === 'blocks-v1') { delete asked.content; delete asked.contentEn }
    const clean = input.sanitize(asked)
    const categoryIds = input.body.categoryIds !== undefined || input.body.categoryId !== undefined ? await validateCategorySelection(tx, input.body) : undefined
    const changes = proposalChanges({ ...post, categoryIds: postCategories(post).map((category: { id: number }) => category.id) }, { ...clean, categoryIds })
    if (!Object.keys(changes).length) throw new PostReviewError('تغییری برای پیشنهاد نیست', 400)
    const value = JSON.stringify(changes)
    await tx.postEditProposal.upsert({ where: { postId: input.id }, create: { postId: input.id, changes: value, baseUpdatedAt: post.updatedAt }, update: { changes: value, baseUpdatedAt: post.updatedAt } })
    await auditAdminStrict({ req: input.req, actor: input.actor, action: 'cms.posts.proposal.submit', targetType: 'posts', targetId: input.id, metadata: { fields: Object.keys(changes) } }, tx)
    return { proposed: true, fields: Object.keys(changes), notice: 'پیشنهاد ویرایش ثبت شد؛ پس از تأیید سردبیر روی سایت می‌آید.' }
  })
}

/** The open proposal as the form shows it: the proposed fields, and whether the live article changed since. */
export function proposalView(row: { updatedAt: Date; editProposal?: { changes: string; createdAt: Date; updatedAt: Date; baseUpdatedAt: Date } | null }) {
  const proposal = row.editProposal
  return proposal ? { changes: readProposalChanges(proposal.changes), at: proposal.updatedAt.toISOString(), stale: row.updatedAt.getTime() > proposal.baseUpdatedAt.getTime() } : null
}

/**
 * The manager's decision on an author's proposal: apply its fields to the live article (with the categories it names
 * that still exist) or set it aside. Written only while that same proposal is still open.
 */
export async function decidePostProposal(input: { req: NextRequest; actor: Actor; id: number; decision: unknown; expected?: unknown; note?: unknown }) {
  if (input.decision !== 'apply' && input.decision !== 'reject') throw new PostReviewError('تصمیم پیشنهاد معتبر نیست', 400)
  if (input.note !== undefined && typeof input.note !== 'string') throw new PostReviewError('یادداشت معتبر نیست', 400)
  const note = (input.note || '').trim()
  if (note.length > REVIEW_NOTE_LIMIT) throw new PostReviewError(`یادداشت حداکثر ${REVIEW_NOTE_LIMIT.toLocaleString('fa-IR')} نویسه است`, 400)
  const apply = input.decision === 'apply', now = new Date()
  const before = await postRevisionState(input.id)
  const result = await db.$transaction(async (tx) => {
    const post = await tx.post.findUnique({ where: { id: input.id }, select: { id: true, title: true, authorId: true, status: true, editProposal: true } })
    if (!post) throw new PostReviewError('این نوشته پیدا نشد', 404)
    const proposal = post.editProposal
    if (!proposal) throw new PostReviewError('پیشنهادی برای این نوشته در انتظار نیست', 409)
    // The decision is about the proposal the manager read: a newer one from the author is decided on its own.
    if (typeof input.expected === 'string' && input.expected !== proposal.updatedAt.toISOString()) throw new PostReviewError('نویسنده پیشنهاد تازه‌تری فرستاده است؛ صفحه را تازه کنید', 409)
    const claimed = await tx.postEditProposal.deleteMany({ where: { id: proposal.id, updatedAt: proposal.updatedAt } })
    if (claimed.count !== 1) throw new PostReviewError('پیشنهادی برای این نوشته در انتظار نیست', 409)
    let saved = null
    if (apply) {
      const changes: PostProposalChanges = readProposalChanges(proposal.changes)
      const data: Record<string, unknown> = {}
      for (const field of PROPOSAL_TEXT_FIELDS) if (changes[field] !== undefined) data[field] = changes[field]
      if (changes.categoryIds) {
        const ids = await validateCategorySelection(tx, { categoryIds: changes.categoryIds.map(String) })
        data.categoryId = ids[0] || null
        data.categories = { deleteMany: {}, create: ids.map((categoryId: number) => ({ categoryId })) }
      }
      saved = await tx.post.update({ where: { id: input.id }, data })
      await recordRevision({ entityType: 'posts', entityId: input.id, before, after: (await postRevisionState(input.id, tx))!, actor: input.actor, client: tx, strict: true })
    }
    await auditAdminStrict({ req: input.req, actor: input.actor, action: `cms.posts.proposal.${apply ? 'apply' : 'reject'}`, targetType: 'posts', targetId: input.id, metadata: { note: note ? note.slice(0, 200) : undefined } }, tx)
    return { post, saved }
  })
  if (result.saved) contentChanged({ type: 'post', id: input.id }, before, result.saved)
  await tellReviewDecision({ authorId: result.post.authorId, decidedById: input.actor.id, postId: input.id, title: result.saved?.title || result.post.title, decision: apply ? 'approve' : 'return', note: note || undefined, at: now, proposal: true })
  return { applied: apply }
}

/** For the staff moderation overview: proposed edits of published articles, the longest wait first. */
export async function waitingProposals(take = 5) {
  const [count, rows] = await Promise.all([
    db.postEditProposal.count(),
    db.postEditProposal.findMany({ orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take, select: { postId: true, updatedAt: true, changes: true, post: { select: { title: true, author: { select: { name: true, email: true } } } } } }),
  ])
  return { count, items: rows.map((row) => ({ id: row.postId, text: plainText(row.post.title, 160), full: plainText(`${row.post.title}\n${Object.keys(readProposalChanges(row.changes)).join('، ')}`, 2000), by: row.post.author?.name || row.post.author?.email || '', about: 'پیشنهاد ویرایش', at: row.updatedAt })) }
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
