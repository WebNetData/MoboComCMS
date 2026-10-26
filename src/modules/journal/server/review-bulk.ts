import type { NextRequest } from 'next/server'
import type { Post } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { recordRevision } from '@/modules/content/server/revisions'
import { postRevisionState } from '@/modules/site/server/revision-state'
import { PENDING_REVIEW, approvalPublishedAt } from '@/modules/journal/domain/journal'
import { claimPostWrite, type PostWriteState } from './review-state'
import { queueReviewDecision } from './review-notifications'

type Row = PostWriteState & { slug: string; title: string; publishedAt: Date }

/** Preserve per-item bulk results; a stale row never changes state or receives a decision notice. */
export function changePostStates(input: { rows: Row[]; status: 'PUBLISHED' | 'DRAFT'; actor: { id: number; email: string }; req: NextRequest }) {
  return db.$transaction(async tx => {
    const changed: { before: Row; after: Post }[] = [], failed: { id: number; reason: string }[] = []
    for (const row of input.rows) {
      if (!await claimPostWrite(tx, row)) { failed.push({ id: row.id, reason: 'نوشته هم‌زمان تغییر کرده است؛ صفحه را تازه کنید' }); continue }
      const reviewing = row.status === PENDING_REVIEW
      const before = reviewing ? await postRevisionState(row.id, tx) : null
      const after = await tx.post.update({ where: { id: row.id }, data: {
        status: input.status,
        ...(reviewing && input.status === 'PUBLISHED' ? { publishedAt: approvalPublishedAt(row.publishedAt) } : {}),
      } })
      if (reviewing) {
        const decision = input.status === 'PUBLISHED' ? 'approve' : 'return'
        await recordRevision({ entityType: 'posts', entityId: row.id, before, after: (await postRevisionState(row.id, tx))!, actor: input.actor, client: tx, strict: true })
        await queueReviewDecision(tx, { authorId: row.authorId, decidedById: input.actor.id, postId: row.id, title: after.title, decision })
        await auditAdminStrict({ req: input.req, actor: input.actor, action: `cms.posts.review.${decision}`, targetType: 'posts', targetId: row.id }, tx)
      }
      changed.push({ before: row, after })
    }
    return { changed, failed }
  })
}
