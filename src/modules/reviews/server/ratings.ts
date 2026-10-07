import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import type { ItemRef } from '@/modules/content/domain/items'
import { ratingsFor } from '@/modules/reviews/server/reviews'

// One way to ask "how is this rated?" for any item. The answers are kept by two owners and stay there:
// shared item reviews keep their totals in ItemStat, shop products are rated by their buyers' approved
// product reviews. This reads both; it stores nothing and moves nothing.

export type ItemRating = { average: number | null; count: number }

export async function ratingsOfItems(refs: ItemRef[]): Promise<Map<string, ItemRating>> {
  const out = new Map<string, ItemRating>()
  if (!refs.length) return out
  const products = refs.filter((ref) => ref.type === 'product')
  const others = refs.filter((ref) => ref.type !== 'product')
  const [shared, bought] = await Promise.all([
    others.length && await isModuleEnabled('reviews') ? ratingsFor(others) : null,
    products.length ? db.productReview.groupBy({ by: ['productId'], where: { status: 'APPROVED', productId: { in: products.map((ref) => ref.id) } }, _avg: { rating: true }, _count: { rating: true } }) : null,
  ])
  for (const [key, rating] of shared || []) out.set(key, { average: rating.average, count: rating.count })
  for (const row of bought || []) out.set(`product:${row.productId}`, { average: row._count.rating ? Math.round((row._avg.rating || 0) * 10) / 10 : null, count: row._count.rating })
  return out
}
