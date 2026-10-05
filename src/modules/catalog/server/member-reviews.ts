import { db } from '@/platform/database/prisma'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'

/**
 * The member's own product reviews, last changed first, whatever their moderation state.
 * `product` is null when the product is no longer public, so a withdrawn product's name
 * is not shown even to its reviewer.
 */
export async function memberProductReviews(userId: number, take: number) {
  const where = { userId }
  const [total, rows] = await Promise.all([
    db.productReview.count({ where }),
    db.productReview.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: Math.max(1, Math.min(500, Math.trunc(take) || 1)) }),
  ])
  const products = rows.length
    ? await db.product.findMany({ where: { ...publicProductWhere, id: { in: [...new Set(rows.map((row) => row.productId))] } }, select: { id: true, slug: true, name: true, image: true } })
    : []
  const byId = new Map(products.map((product) => [product.id, product]))
  return {
    total,
    reviews: rows.map((row) => {
      const product = byId.get(row.productId)
      return {
        id: row.id, rating: row.rating, title: row.title, body: row.body, status: row.status, updatedAt: row.updatedAt,
        product: product ? { title: product.name, url: `/products/${encodeURIComponent(product.slug)}`, image: product.image } : null,
      }
    }),
  }
}
