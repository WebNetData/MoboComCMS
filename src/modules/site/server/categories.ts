import { db } from '@/platform/database/prisma'
import { categoryDescendants, parseCategoryIds } from '@/modules/site/domain/categories'
import type { Prisma } from '@prisma/client'

export function categoryMembership(ids: number[]): Prisma.PostWhereInput {
  return { OR: [{ categoryId: { in: ids } }, { categories: { some: { categoryId: { in: ids } } } }] }
}

export async function categoryFilter(slug: string): Promise<Prisma.PostWhereInput> {
  if (!slug) return {}
  const nodes = await db.postCategory.findMany()
  const selected = nodes.find(node => node.slug === slug)
  return categoryMembership(selected ? categoryDescendants(nodes, selected.id) : [])
}

export async function validateCategorySelection(tx: Prisma.TransactionClient, body: any) {
  const ids = parseCategoryIds(body.categoryIds !== undefined ? body.categoryIds : body.categoryId ? [body.categoryId] : [])
  const count = await tx.postCategory.count({ where: { id: { in: ids } } })
  if (count !== ids.length) throw new Error('یک یا چند دسته‌بندی دیگر وجود ندارند؛ فهرست را تازه‌سازی کنید')
  return ids
}

export async function validateCategoryParent(tx: Prisma.TransactionClient, value: unknown, id?: number) {
  if (value === '' || value === null || value === undefined) return null
  const [parentId] = parseCategoryIds([value])
  const nodes = await tx.postCategory.findMany()
  if (!nodes.some(node => node.id === parentId)) throw new Error('دسته‌بندی مادر وجود ندارد')
  if (id && categoryDescendants(nodes, id).includes(parentId)) throw new Error('یک دسته نمی‌تواند زیرمجموعه خودش یا فرزندانش باشد')
  return parentId
}
