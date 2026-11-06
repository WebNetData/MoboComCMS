import { db } from '@/platform/database/prisma'
import { normalizeAccess } from '@/modules/membership/domain/membership'
import { validateCategorySelection } from '@/modules/site/server/categories'
import { recordRevision, type RestoreCommit } from '@/modules/content/server/revisions'
import { postRevisionState } from '@/modules/site/server/revision-state'
import { contentChanged } from '@/modules/content/server/events'
import { parsePostItemLinks, replacePostItemLinks, validatePostItemLinks } from './item-links'
import { postFormatInput } from './formats'
import { publicationDateInput } from '../domain/journal'

/** Shared creation transaction for the CMS and reviewed assistant commands. */
export async function createJournalPost(input: Record<string, unknown>, fields: Record<string, unknown>, actor: { id: number; email: string }, commit?: RestoreCommit) {
  const links = input.itemLinks === undefined ? null : parsePostItemLinks(input.itemLinks)
  const format = await postFormatInput(db, input, null)
  const row = await db.$transaction(async tx => {
    const ids = await validateCategorySelection(tx, input)
    if (links) await validatePostItemLinks(tx, links)
    const created = await tx.post.create({ data: { ...fields, ...format, ...(input.publishedAt !== undefined ? { publishedAt: publicationDateInput(input.publishedAt) } : {}), access: normalizeAccess(input.access), authorId: actor.id, categoryId: ids[0] || null, categories: { create: ids.map(categoryId => ({ categoryId })) } } as any })
    if (links) await replacePostItemLinks(tx, created.id, links)
    const after = (await postRevisionState(created.id, tx))!
    await recordRevision({ entityType: 'posts', entityId: created.id, before: null, after, actor, client: tx, strict: true })
    await commit?.(tx, {}, after)
    return created
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
  contentChanged({ type: 'post', id: row.id }, null, row)
  return row
}
