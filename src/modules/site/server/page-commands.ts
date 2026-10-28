import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { RevisionError, recordRevision, type RestoreCommit } from '@/modules/content/server/revisions'
import { pageRevisionState } from './revision-state'
import { readPageLayout, savePageLayout, validatePageLayout } from './page-layout'

type Actor = { id: number; email: string }
const conflict = (error: unknown): never => {
  if ((error as { code?: string }).code === 'P2034') throw new RevisionError('صفحه هم‌زمان تغییر کرده است؛ دوباره بررسی کنید.', 409)
  throw error
}

/** Page fields, typed layout, version and the caller's audit share one commit. */
export async function createPage(input: Record<string, unknown>, fields: Record<string, unknown>, actor: Actor, commit?: RestoreCommit) {
  const layout = validatePageLayout(input)
  return db.$transaction(async tx => {
    const row = await tx.page.create({ data: { ...fields, status: fields.status ?? 'DRAFT' } as Prisma.PageUncheckedCreateInput })
    await savePageLayout(row.id, layout, tx)
    const after = (await pageRevisionState(row.id, tx))!
    await recordRevision({ entityType: 'pages', entityId: row.id, before: null, after, actor, client: tx, strict: true })
    await commit?.(tx, {}, after)
    return row
  }, { isolationLevel: 'Serializable', timeout: 30_000 }).catch(conflict)
}

export async function updatePage(id: number, input: Record<string, unknown>, fields: Record<string, unknown>, actor: Actor, commit?: RestoreCommit) {
  return db.$transaction(async tx => {
    const before = await pageRevisionState(id, tx)
    if (!before) throw new RevisionError('این صفحه پیدا نشد', 404)
    if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== before.updatedAt.toISOString()) throw new RevisionError('صفحه پس از بازشدن فرم تغییر کرده است؛ پیش‌نویس را نگه دارید و نسخهٔ تازه را بررسی کنید.', 409)
    const layout = validatePageLayout({ ...(await readPageLayout(id, tx)).layout, ...input })
    // Recheck the stored editor mode inside the transaction; a concurrent canonical conversion must not lose its body.
    if (fields.content !== undefined && before.editorFormat === 'blocks-v1') throw new RevisionError('متن این صفحه در ویرایشگر بلوکی ویرایش می‌شود.', 409)
    const claimed = await tx.page.updateMany({ where: { id, updatedAt: before.updatedAt }, data: { ...fields, updatedAt: new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1)) } as Prisma.PageUpdateManyMutationInput })
    if (claimed.count !== 1) throw new RevisionError('صفحه هم‌زمان تغییر کرده است', 409)
    await savePageLayout(id, layout, tx)
    const after = (await pageRevisionState(id, tx))!
    await recordRevision({ entityType: 'pages', entityId: id, before, after, actor, client: tx, strict: true })
    await commit?.(tx, before, after)
    return tx.page.findUniqueOrThrow({ where: { id } })
  }, { isolationLevel: 'Serializable', timeout: 30_000 }).catch(conflict)
}
