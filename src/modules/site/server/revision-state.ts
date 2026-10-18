import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { restoreValues, type Snapshot } from '@/modules/content/domain/revisions'
import { RevisionError } from '@/modules/content/server/revisions'

export async function postRevisionState(id: number, tx: Prisma.TransactionClient = db) {
  const row = await tx.post.findUnique({ where: { id }, include: { categories: { orderBy: { categoryId: 'asc' }, select: { categoryId: true } } } })
  if (!row) return null
  const { categories, ...fields } = row
  return { ...fields, __relations: JSON.stringify({ version: 1, categoryIds: categories.map(row => row.categoryId) }) }
}

export async function restorePostRevision(id: number, snapshot: Snapshot) {
  return db.$transaction(async tx => {
    const before = await postRevisionState(id, tx)
    if (!before) throw new RevisionError('این نوشته پیدا نشد', 404)
    const data = restoreValues(snapshot, before), raw = data.__relations
    delete data.__relations
    if (raw !== undefined) {
      const relations = JSON.parse(String(raw)), ids = relations.categoryIds
      if (relations.version !== 1 || !Array.isArray(ids) || ids.length > 500 || ids.some((id: unknown) => !Number.isSafeInteger(id))) throw new RevisionError('دسته‌بندی نسخه معتبر نیست', 422)
      if (await tx.postCategory.count({ where: { id: { in: ids } } }) !== new Set(ids).size) throw new RevisionError('دسته‌بندی این نسخه حذف شده است', 409)
      data.categories = { deleteMany: {}, create: ids.map((categoryId: number) => ({ categoryId })) }
    }
    const claimed = await tx.post.updateMany({ where: { id, updatedAt: before.updatedAt }, data: { updatedAt: new Date() } })
    if (!claimed.count) throw new RevisionError('نوشته هم‌زمان تغییر کرده است', 409)
    await tx.post.update({ where: { id }, data })
    return { before, after: (await postRevisionState(id, tx))! }
  })
}
