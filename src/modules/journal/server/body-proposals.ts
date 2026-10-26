import type { NextRequest } from 'next/server'
import type { Post, PostEditProposal, Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { PostReviewError, readProposalChanges } from '@/modules/journal/domain/journal'
import { EditorError, prepareDocument, validateDocumentRelations, type EditorActor } from '@/modules/editor/server/documents'
import { activeEditorRegistry } from '@/modules/editor/server/blocks/registry'
import { readDocument } from '@/modules/editor/domain/validate'
import { publicDocumentHtml } from '@/modules/editor/server/blocks/render'
import { cleanRichText } from '@/shared/content/sanitize'
import { reviewingAuthorPosts } from './review-policy'
import { claimPostWrite } from './review-state'

const changed = () => new EditorError('نوشته یا پیشنهاد در جای دیگری تغییر کرده است؛ کار شما در این صفحه مانده است. دوباره بررسی کنید.', 409, 'CHANGED')
function parseDocument(value: string) {
  try { return JSON.parse(value) as unknown } catch { throw new EditorError('متن بلوکی پیشنهاد ناقص یا نامعتبر است', 422, 'DOCUMENT_INVALID') }
}

/** Guarded caller only: drafts are never part of the public article projection. */
export async function postDocumentProposal(id: number, actor: EditorActor, preview = false) {
  const post = await db.post.findUnique({ where: { id }, include: { editProposal: true } })
  if (!post) throw new EditorError('نوشته پیدا نشد', 404, 'NOT_FOUND')
  const proposal = post.editProposal
  const changes = proposal ? readProposalChanges(proposal.changes) : {}
  if (preview) {
    if (!proposal || changes.contentDocument === undefined) throw new EditorError('پیشنهاد متن پیدا نشد', 404, 'NOT_FOUND')
    const registry = await activeEditorRegistry()
    const proposed = readDocument(changes.contentDocument, registry)
    const current = readDocument(post.contentDocument, registry)
    if (!proposed.ok) throw new EditorError('متن پیشنهاد معتبر نیست', 422, 'DOCUMENT_INVALID')
    return { editingMode: 'preview' as const, proposalAt: proposal.updatedAt.toISOString(), proposalStale: proposal.baseUpdatedAt.getTime() !== post.updatedAt.getTime(), previewHtml: await publicDocumentHtml(proposed.document, registry, true), liveHtml: post.editorFormat === 'blocks-v1' && current.ok ? await publicDocumentHtml(current.document, registry, true) : cleanRichText(post.content) }
  }
  if (post.authorId !== actor.id || post.status !== 'PUBLISHED' || !await reviewingAuthorPosts()) return null
  const proposed = changes.contentDocument === undefined ? null : readDocument(changes.contentDocument, await activeEditorRegistry())
  if (proposed && !proposed.ok) throw new EditorError('متن پیشنهاد معتبر نیست؛ سردبیر باید آن را بررسی کند', 422, 'DOCUMENT_INVALID')
  return { editingMode: 'proposal' as const, proposalAt: proposal?.updatedAt.toISOString() ?? null, proposalStale: !!proposal && proposal.baseUpdatedAt.getTime() !== post.updatedAt.getTime(),
    ...(proposed ? { document: proposed.document, editorFormat: 'blocks-v1', legacyHtml: '', unsupported: proposed.unsupported, issues: proposed.issues, updatedAt: proposal!.baseUpdatedAt.toISOString() } : {}) }
}

export async function proposePostDocument(input: { req: NextRequest; id: number; actor: EditorActor; document: unknown; expectedUpdatedAt: unknown; expectedProposalAt: unknown }) {
  if (typeof input.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(input.expectedUpdatedAt)) || !(input.expectedProposalAt === null || typeof input.expectedProposalAt === 'string')) throw new EditorError('نسخهٔ نوشته و پیشنهاد باید مشخص باشد', 400, 'VERSION_REQUIRED')
  const prepared = await prepareDocument(input.document, input.actor)
  return db.$transaction(async tx => {
    const post = await tx.post.findUnique({ where: { id: input.id } })
    if (!post || post.authorId !== input.actor.id) throw new EditorError('نوشته پیدا نشد', 404, 'NOT_FOUND')
    if (post.status !== 'PUBLISHED' || !await reviewingAuthorPosts()) throw new EditorError('وضعیت بازبینی عوض شده است؛ ویرایشگر را تازه کنید', 409, 'CHANGED')
    if (post.updatedAt.toISOString() !== input.expectedUpdatedAt || !await claimPostWrite(tx, post)) throw changed()
    // Read after holding the shared Post claim: metadata and body cannot erase
    // one another after waiting for another submitter's transaction.
    const proposal = await tx.postEditProposal.findUnique({ where: { postId: input.id } })
    if ((proposal?.updatedAt.toISOString() ?? null) !== input.expectedProposalAt || proposal && proposal.baseUpdatedAt.getTime() !== post.updatedAt.getTime()) throw changed()
    await validateDocumentRelations(tx, 'posts', post, prepared.checked.document, input.actor, prepared.registry, true)
    const changes = proposal ? readProposalChanges(proposal.changes) : {}
    changes.contentDocument = JSON.stringify(prepared.checked.document)
    // Generated legacy HTML is never a second body source in this proposal.
    delete changes.content; delete changes.contentEn
    const at = new Date(Math.max(Date.now(), (proposal?.updatedAt.getTime() ?? 0) + 1))
    const saved = await tx.postEditProposal.upsert({ where: { postId: input.id }, create: { postId: input.id, changes: JSON.stringify(changes), baseUpdatedAt: post.updatedAt, updatedAt: at }, update: { changes: JSON.stringify(changes), baseUpdatedAt: post.updatedAt, updatedAt: at } })
    await auditAdminStrict({ req: input.req, actor: input.actor, action: 'cms.posts.proposal.submit', targetType: 'posts', targetId: input.id, metadata: { fields: Object.keys(changes), format: 'blocks-v1' } }, tx)
    return { proposed: true, updatedAt: post.updatedAt.toISOString(), proposalAt: saved.updatedAt.toISOString(), unsupported: prepared.checked.unsupported, warnings: prepared.checked.issues.filter(issue => issue.level === 'warning').slice(0, 50), migrated: prepared.checked.migrated }
  })
}

/** Revalidate at apply; exact live base, canonical renderer and existing locks. */
export async function proposedBodyFields(tx: Prisma.TransactionClient, post: Post, proposal: PostEditProposal, actor: { id: number; email: string; roleId?: number | null; permissions?: string[] | null }) {
  const changes = readProposalChanges(proposal.changes)
  if (changes.contentDocument === undefined) return {}
  if (post.status !== 'PUBLISHED' || post.updatedAt.getTime() !== proposal.baseUpdatedAt.getTime()) throw new PostReviewError('نسخهٔ منتشرشده بعد از پیشنهاد تغییر کرده است؛ پیشنهاد متن باید دوباره بررسی شود', 409)
  const editorActor = { ...actor, roleId: actor.roleId ?? null, permissions: actor.permissions ?? null }
  try {
    const prepared = await prepareDocument(parseDocument(changes.contentDocument), editorActor)
    await validateDocumentRelations(tx, 'posts', post, prepared.checked.document, editorActor, prepared.registry, true)
    return { editorFormat: 'blocks-v1', contentDocument: JSON.stringify(prepared.checked.document), content: prepared.html, updatedAt: new Date(Math.max(Date.now(), post.updatedAt.getTime() + 1)) }
  } catch (error) { if (error instanceof EditorError) throw new PostReviewError(error.message, error.status); throw error }
}
