import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { plainText } from '@/shared/text/plain'
import { contentChanged } from '@/modules/content/server/events'
import { recordRevision } from '@/modules/content/server/revisions'
import { postRevisionState } from '@/modules/site/server/revision-state'
import { PENDING_REVIEW, PROPOSAL_TEXT_FIELDS, PostReviewError, REVIEW_NOTE_LIMIT, approvalPublishedAt, proposalChanges, readProposalChanges, type PostProposalChanges } from '@/modules/journal/domain/journal'
import { validateCategorySelection } from '@/modules/site/server/categories'
import { postCategories } from '@/modules/site/domain/categories'
import { getJournalSettings } from '@/modules/journal/server/admin'
import { TRASHED } from '@/modules/content/domain/trash'
import { claimPostWrite } from './review-state'
import { queueReviewDecision } from './review-notifications'

// Magazine editorial review: while the manager asks for it, an author's article goes live only once the section's
// manager approves it; the manager may instead return it with a note. Spec: docs/specs/journal-review/SPEC.md.

type Actor = { id: number; email: string }

/** Whether authors' articles wait for the manager (read fresh: a writer is refused on the current setting). */
export async function reviewingAuthorPosts() {
  return (await getJournalSettings(true)).reviewAuthorPosts
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
  const result = await db.$transaction(async (tx) => {
    const current = await tx.post.findUnique({ where: { id: input.id }, select: { id: true, title: true, status: true, publishedAt: true, authorId: true, updatedAt: true } })
    if (!current) throw new PostReviewError('این نوشته پیدا نشد', 404)
    if (current.status !== PENDING_REVIEW || !await claimPostWrite(tx, current)) throw new PostReviewError('این نوشته هم‌زمان تغییر کرده است؛ صفحه را تازه کنید', 409)
    const before = await postRevisionState(input.id, tx)
    const data = decision === 'approve' ? { status: 'PUBLISHED', publishedAt: approvalPublishedAt(current.publishedAt, now) } : { status: 'DRAFT' }
    const saved = await tx.post.update({ where: { id: input.id }, data })
    await recordRevision({ entityType: 'posts', entityId: input.id, before, after: (await postRevisionState(input.id, tx))!, actor: input.actor, client: tx, strict: true })
    await queueReviewDecision(tx, { authorId: current.authorId, decidedById: input.actor.id, postId: input.id, title: saved.title, decision, note: note || undefined })
    await auditAdminStrict({ req: input.req, actor: input.actor, action: `cms.posts.review.${decision}`, targetType: 'posts', targetId: input.id, metadata: { note: note ? note.slice(0, 200) : undefined } }, tx)
    return { before, saved }
  })
  contentChanged({ type: 'post', id: input.id }, result.before, result.saved)
  return result.saved
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
    if (post.authorId !== input.actor.id) throw new PostReviewError('این نوشته پیدا نشد', 404)
    if (!await claimPostWrite(tx, post)) throw new PostReviewError('این نوشته هم‌زمان تغییر کرده است؛ صفحه را تازه کنید', 409)
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
  const apply = input.decision === 'apply'
  const result = await db.$transaction(async (tx) => {
    const post = await tx.post.findUnique({ where: { id: input.id }, select: { id: true, title: true, authorId: true, status: true, updatedAt: true, editProposal: true } })
    if (!post) throw new PostReviewError('این نوشته پیدا نشد', 404)
    if (post.status === TRASHED || !await claimPostWrite(tx, post)) throw new PostReviewError('این نوشته هم‌زمان تغییر کرده است؛ صفحه را تازه کنید', 409)
    const before = await postRevisionState(input.id, tx)
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
    await queueReviewDecision(tx, { authorId: post.authorId, decidedById: input.actor.id, postId: input.id, title: saved?.title || post.title, decision: apply ? 'approve' : 'return', note: note || undefined, proposal: true })
    await auditAdminStrict({ req: input.req, actor: input.actor, action: `cms.posts.proposal.${apply ? 'apply' : 'reject'}`, targetType: 'posts', targetId: input.id, metadata: { note: note ? note.slice(0, 200) : undefined } }, tx)
    return { before, saved }
  })
  if (result.saved) contentChanged({ type: 'post', id: input.id }, result.before, result.saved)
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
