import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { reviewDigest } from './trust-content'
import { BusinessError } from '../domain/businesses'

/** Only a boolean derived from current content crosses the public boundary. */
export async function reviewedPurchaseProofs(reviewIds: number[], displayedDigests?: ReadonlyMap<number, string>) {
  if (!reviewIds.length) return new Set<number>()
  const rows = await db.businessPurchaseProof.findMany({ where: { reviewId: { in: reviewIds }, status: 'APPROVED', reviewerId: { not: null }, reviewedAt: { not: null }, business: { kind: 'EXTERNAL', status: 'PUBLISHED' }, review: { itemType: 'business', status: 'APPROVED' } }, select: { businessId: true, userId: true, reviewId: true, reviewDigest: true, review: { select: { id: true, itemId: true, userId: true, rating: true, body: true, status: true, experiencedOn: true, scores: { select: { key: true, score: true } } } } } })
  return new Set(rows.filter(row => row.businessId === row.review.itemId && row.userId === row.review.userId && row.reviewDigest === reviewDigest(row.review) && (!displayedDigests || displayedDigests.get(row.reviewId) === row.reviewDigest)).map(row => row.reviewId))
}
export async function myBusinessTrust(userId: number) {
  if (!await isModuleEnabled('businesses') || !await isModuleEnabled('reviews')) throw new BusinessError('این بخش فعال نیست', 404)
  const [proofs, reports] = await Promise.all([
    db.businessPurchaseProof.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 50, select: { id: true, status: true, createdAt: true, decisionNote: true, business: { select: { name: true } } } }),
    db.communityReport.findMany({ where: { reporterId: userId, businessId: { not: null } }, orderBy: { id: 'desc' }, take: 50, select: { id: true, status: true, reason: true, note: true, decisionNote: true, createdAt: true, business: { select: { name: true } } } }),
  ])
  return { proofs, reports }
}
