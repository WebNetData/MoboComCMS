import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { BusinessError } from '../domain/businesses'
export type ReviewSnapshot = { id: number; userId: number; rating: number; body: string; status: string; experiencedOn?: Date | null; scores?: { key: string; score: number }[] }
/** Only experience facts, never mutable representative replies or timestamps. */
export function reviewDigest(review: Pick<ReviewSnapshot, 'rating' | 'body' | 'experiencedOn' | 'scores'>) {
  return createHash('sha256').update(JSON.stringify([review.rating, review.body, review.experiencedOn?.toISOString() || null, [...(review.scores || [])].sort((a,b) => a.key.localeCompare(b.key)).map(s => [s.key,s.score])])).digest('hex')
}
export async function trustTarget(tx: Prisma.TransactionClient, businessId: number, reviewId: number, published = true) {
  const business = await tx.businessProfile.findUnique({ where: { id: businessId }, include: { seller: { select: { status: true } } } })
  if (!business || (published && business.status !== 'PUBLISHED') || (business.kind === 'SELLER' && business.seller?.status !== 'ACTIVE')) throw new BusinessError('کسب‌وکار پیدا نشد', 404)
  const review: ReviewSnapshot | null = business.kind === 'SELLER'
    ? await tx.sellerReview.findFirst({ where: { id: reviewId, sellerId: business.sellerId! } })
    : await tx.itemReview.findFirst({ where: { id: reviewId, itemType: 'business', itemId: businessId }, include: { scores: true } })
  if (!review) throw new BusinessError('تجربه پیدا نشد', 404)
  return { business, review, digest: reviewDigest(review) }
}
