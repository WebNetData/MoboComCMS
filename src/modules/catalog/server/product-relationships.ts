import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'
import type { ProductRelationshipInput, ProductRelationshipKind } from '@/modules/catalog/domain/product-relationships'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'

export async function replaceProductRelationships(tx: Prisma.TransactionClient, productId: number, links: ProductRelationshipInput[]) {
  if (links.some(link => link.targetId === productId)) throw Error('Product cannot reference itself')
  const existing = await tx.productRelationship.findMany({ where: { productId }, select: { kind: true, targetId: true } })
  const known = new Set(existing.map(row => `${row.kind}:${row.targetId}`))
  const fresh = links.filter(link => !known.has(`${link.kind}:${link.targetId}`))
  if (fresh.length) {
    if (!await isStoreEnabled()) throw Error('Store is unavailable')
    const ids = [...new Set(fresh.map(link => link.targetId))]
    const targets = await tx.product.findMany({ where: { ...publicProductWhere, id: { in: ids } }, select: { id: true } })
    if (targets.length !== ids.length) throw Error('Linked public product not found')
  }
  await tx.productRelationship.deleteMany({ where: { productId } })
  if (links.length) await tx.productRelationship.createMany({ data: links.map((link, position) => ({ productId, ...link, position })) })
}

/** Current public target IDs in editorial order; caller owns rollout and source visibility. */
export async function publicProductRelationshipIds(productId: number, kind: ProductRelationshipKind, take = 12) {
  const rows = await db.productRelationship.findMany({ where: { productId, kind, target: publicProductWhere }, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: Math.max(1, Math.min(12, Math.trunc(take) || 12)), select: { targetId: true } })
  return rows.map(row => row.targetId)
}
