import { db } from '@/platform/database/prisma'
import { isPublicProduct, publicProductWhere } from '@/modules/catalog/domain/product-publication'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { getStoreSettings } from '@/modules/store/server/catalog'
import { frequentlyBoughtProductIds } from '@/modules/recommendations/server/product-purchases'

/** Public presentation read, with configuration/publication gates before evidence queries. */
export async function readFrequentlyBoughtProducts(productId: number) {
  if (!Number.isSafeInteger(productId) || productId <= 0 || !await isStoreEnabled()) return null
  const settings = await getStoreSettings()
  if (!settings.showFrequentlyBoughtTogether) return null
  const source = await db.product.findUnique({ where: { id: productId }, select: { active: true, approval: true, audienceGroups: true } })
  if (!source || !isPublicProduct(source)) return null
  const ids = await frequentlyBoughtProductIds(productId, { days: settings.frequentlyBoughtDays, minimumBuyers: settings.frequentlyBoughtMinimumBuyers, take: 8 })
  if (!ids.length) return { items: [] }
  const rows = await db.product.findMany({ where: { ...publicProductWhere, id: { in: ids } }, select: { id: true, slug: true, name: true, nameEn: true, image: true } })
  const cards = new Map(rows.map(row => [row.id, row]))
  return { items: ids.flatMap(id => cards.has(id) ? [cards.get(id)!] : []) }
}
