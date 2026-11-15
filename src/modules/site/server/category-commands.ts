import type { Prisma } from '@prisma/client'
import { validateCategoryParent } from '@/modules/site/server/categories'
import { assertKindFits, kindForCategory } from '@/modules/catalog/server/category-kind'
import { validateCover } from '@/shared/content/cover'
import { richTextToPlain } from '@/shared/content/sanitize'

/** The CMS and reviewed AI operations use the same transaction-aware category create. */
export async function createCategory(tx: Prisma.TransactionClient, type: 'postcats' | 'productcats', b: Record<string, unknown>) {
  const fields: Record<string, unknown> = {}
  for (const key of ['slug', 'name', 'nameEn']) if (b[key] !== undefined) fields[key] = b[key]
  if (type === 'postcats') return tx.postCategory.create({ data: { ...fields, parentId: await validateCategoryParent(tx, b.parentId) } as Prisma.PostCategoryUncheckedCreateInput })
  let parentId: number | null = null
  if (b.parentId !== '' && b.parentId != null) {
    parentId = Number(b.parentId)
    if (!Number.isSafeInteger(parentId) || parentId <= 0) throw Error('Invalid parent category')
    const categories = await tx.productCategory.findMany({ select: { id: true, parentId: true } })
    const parents = new Map(categories.map(c => [c.id, c.parentId]))
    if (!parents.has(parentId)) throw Error('Parent category not found')
    const visited = new Set<number>()
    for (let cursor: number | null = parentId; cursor != null; cursor = parents.get(cursor) ?? null) {
      if (visited.has(cursor)) throw Error('Category cycle detected')
      visited.add(cursor)
    }
  }
  let attributeGroupId: number | null = null
  if (b.attributeGroupId !== '' && b.attributeGroupId != null) {
    attributeGroupId = Number(b.attributeGroupId)
    if (!Number.isSafeInteger(attributeGroupId) || attributeGroupId <= 0 || !await tx.productAttributeGroup.findUnique({ where: { id: attributeGroupId } })) throw Error('Attribute group not found')
  }
  if (b.image !== undefined) fields.image = validateCover(b.image)
  if (b.icon !== undefined) fields.icon = String(b.icon || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40)
  if (b.description !== undefined) fields.description = richTextToPlain(String(b.description || ''), 1000)
  if (b.sortOrder !== undefined) {
    const sortOrder = Number(b.sortOrder) || 0
    if (!Number.isSafeInteger(sortOrder)) throw Error('Invalid sort order')
    fields.sortOrder = sortOrder
  }
  const kind = await kindForCategory(tx, { parentId, asked: b.kind })
  await assertKindFits(tx, { kind, attributeGroupId })
  return tx.productCategory.create({ data: { ...fields, parentId, attributeGroupId, kind } as Prisma.ProductCategoryUncheckedCreateInput })
}
