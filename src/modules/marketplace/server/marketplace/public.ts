import { db } from '@/platform/database/prisma'
import { performanceLabel, ratingSummary } from '@/modules/marketplace/domain/marketplace'
import { marketplaceEnabled } from '@/modules/marketplace/server/marketplace/core'

export function publicSeller(seller: { id: number; slug: string; shopName: string; logo: string; banner: string; about: string; city: string; ratingSum: number; ratingCount: number; salesCount: number; createdAt: Date; status: string }) {
  const rating = ratingSummary(seller.ratingSum, seller.ratingCount)
  return {
    id: seller.id, slug: seller.slug, shopName: seller.shopName, logo: seller.logo, banner: seller.banner, about: seller.about, city: seller.city,
    rating, performance: performanceLabel(rating.average, rating.count), salesCount: seller.salesCount, since: seller.createdAt.toISOString(), active: seller.status === 'ACTIVE',
  }
}

/** Seller shown on a product page ("sold by"). Null for the site's own products. */
export async function productSeller(productId: number) {
  if (!await marketplaceEnabled()) return null
  const product = await db.product.findUnique({ where: { id: productId }, select: { seller: true } })
  return product?.seller && product.seller.status === 'ACTIVE' ? publicSeller(product.seller) : null
}

export async function sellerBySlug(slug: string) {
  if (!await marketplaceEnabled()) return null
  const seller = await db.seller.findUnique({ where: { slug } })
  return seller && seller.status === 'ACTIVE' ? seller : null
}
