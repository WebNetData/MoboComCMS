import { db } from '@/platform/database/prisma'
import { isPublicProduct, publicProductWhere } from '@/modules/catalog/domain/product-publication'
import type { ProductRelationshipKind } from '@/modules/catalog/domain/product-relationships'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { publicProductRelationshipIds } from '@/modules/catalog/server/product-relationships'
import { getStoreSettings } from '@/modules/store/server/catalog'

/** Optional editorial cards. RELATED fallback remains owned by its existing callers. */
export async function readEditorialProductCards(productId: number, kind: ProductRelationshipKind, take = 8) {
  if (!Number.isSafeInteger(productId) || productId <= 0 || !await isStoreEnabled() || !(await getStoreSettings()).showProductRelationships) return null
  const source = await db.product.findUnique({ where: { id: productId }, select: { active: true, approval: true } })
  if (!source || !isPublicProduct(source)) return null
  const ids = await publicProductRelationshipIds(productId, kind, take)
  if (!ids.length) return { items: [] }
  const rows = await db.product.findMany({ where: { ...publicProductWhere, id: { in: ids } }, select: { id: true, slug: true, name: true, nameEn: true, image: true, price: true, currency: true, kind: true } })
  const cards = new Map(rows.map(row => [row.id, row]))
  return { items: ids.flatMap(id => cards.has(id) ? [cards.get(id)!] : []) }
}
