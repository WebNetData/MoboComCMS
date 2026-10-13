import type { Prisma } from '@prisma/client'
import { CategoryKindError, categorySubtree, kindConflict, parseCategoryKind, type CategoryKind } from '@/modules/catalog/domain/category-kind'

// Keeps the half of the shop a category is in true for its whole subtree, inside the caller's transaction.

type Tx = Prisma.TransactionClient

/**
 * The kind a category takes on a save. Under a parent it is the parent's (whatever was asked);
 * a root takes what was asked, or keeps what it had when nothing was asked.
 */
export async function kindForCategory(tx: Tx, input: { parentId: number | null; asked: unknown; current?: string }): Promise<CategoryKind> {
  if (input.parentId != null) {
    const parent = await tx.productCategory.findUnique({ where: { id: input.parentId }, select: { kind: true } })
    return parseCategoryKind(parent?.kind)
  }
  return input.asked === undefined ? parseCategoryKind(input.current) : parseCategoryKind(input.asked)
}

/** Refuses a kind that the category's own products or attribute groups contradict. */
export async function assertKindFits(tx: Tx, input: { id?: number; kind: CategoryKind; attributeGroupId?: number | null }) {
  if (input.kind === '') return
  const nodes = input.id ? await tx.productCategory.findMany({ select: { id: true, parentId: true, attributeGroupId: true } }) : []
  const ids = input.id ? categorySubtree(nodes, input.id) : []
  // The group being set on this very save counts instead of the one stored for this category.
  const groupIds = new Set<number>()
  for (const node of nodes) if (ids.includes(node.id) && node.attributeGroupId != null && !(node.id === input.id && input.attributeGroupId !== undefined)) groupIds.add(node.attributeGroupId)
  if (input.attributeGroupId != null) groupIds.add(input.attributeGroupId)
  const [otherProducts, groups] = await Promise.all([
    ids.length ? tx.product.count({ where: { categoryId: { in: ids }, kind: { not: input.kind } } }) : 0,
    groupIds.size ? tx.productAttributeGroup.findMany({ where: { id: { in: [...groupIds] } }, select: { name: true, appliesTo: true } }) : [],
  ])
  const problem = kindConflict(input.kind, { otherProducts, groups })
  if (problem) throw new CategoryKindError(problem)
}

/** Writes the kind on every category under this one (the category itself is written by the caller). */
export async function cascadeCategoryKind(tx: Tx, id: number, kind: CategoryKind) {
  const nodes = await tx.productCategory.findMany({ select: { id: true, parentId: true } })
  const below = categorySubtree(nodes, id).filter((item) => item !== id)
  if (below.length) await tx.productCategory.updateMany({ where: { id: { in: below } }, data: { kind } })
}
