import type { BusinessProfile, Prisma } from '@prisma/client'
import { normalizeBusinessExperience, BusinessError } from '@/modules/businesses/domain/businesses'
import { normalizeScores } from '@/modules/reviews/domain/dimensions'
import { normalizeReviewBody } from '@/modules/reviews/domain/reviews'
import { reviewSeller, replyReview } from '@/modules/marketplace/server/marketplace'
import { reopenOwnerCase } from '@/modules/moderation/server/cases'

/** Shared review storage: seller histories remain in SellerReview; everything else in ItemReview. */
export async function writeBusinessExperience(tx: Prisma.TransactionClient, userId: number, business: BusinessProfile, input: Record<string, unknown>, moderate: boolean) {
  const normalized = normalizeBusinessExperience({ rating: input.rating, body: input.body, experiencedOn: input.experiencedOn })
  const status = moderate ? 'PENDING' : 'APPROVED'
  if (business.kind === 'SELLER') {
    await reviewSeller(userId, { ...input, sellerId: business.sellerId, rating: normalized.rating, body: normalized.body }, { tx, status })
    return { status, source: 'seller' as const }
  }
  const where = { itemType_itemId_userId: { itemType: 'business', itemId: business.id, userId } }
  const prior = await tx.itemReview.findUnique({ where, include: { scores: true } })
  const purchase = business.kind === 'SITE' ? await tx.order.findFirst({ where: { userId, status: 'PAID', productDelivery: { is: { status: 'DELIVERED' } } }, select: { id: true } }) : null
  const verified = business.kind === 'SITE' && (purchase || prior?.verified === 'PURCHASE') ? 'PURCHASE' : ''
  const experiencedOn = Object.hasOwn(input, 'experiencedOn') ? normalized.experiencedOn ? new Date(`${normalized.experiencedOn}T00:00:00.000Z`) : null : prior?.experiencedOn || null
  const scores = normalizeScores('business', input.scores)
  const priorScores = Object.fromEntries((prior?.scores || []).map(score => [score.key, score.score]))
  const scoresChanged = scores !== undefined && (Object.keys(scores).length !== Object.keys(priorScores).length || Object.entries(scores).some(([key, value]) => priorScores[key] !== value))
  const changed = !prior || prior.rating !== normalized.rating || prior.body !== normalized.body || prior.experiencedOn?.getTime() !== experiencedOn?.getTime() || scoresChanged
  const nextStatus = !changed && prior?.status === 'APPROVED' ? 'APPROVED' : status
  const review = await tx.itemReview.upsert({ where, create: { itemType: 'business', itemId: business.id, userId, rating: normalized.rating, body: normalized.body, experiencedOn, status: nextStatus, verified }, update: { rating: normalized.rating, body: normalized.body, experiencedOn, status: nextStatus, verified, ...(changed ? { businessReply: '', businessReplyBy: null, businessReplyAt: null } : {}) } })
  if (nextStatus === 'PENDING' && prior?.status !== 'PENDING') await reopenOwnerCase(tx, 'business-experiences', review.id)
  if (prior && changed) await tx.itemReviewHelpful.deleteMany({ where: { reviewId: review.id } })
  if (scores) { await tx.itemReviewScore.deleteMany({ where: { reviewId: review.id } }); const data = Object.entries(scores).map(([key, score]) => ({ reviewId: review.id, key, score })); if (data.length) await tx.itemReviewScore.createMany({ data }) }
  await refreshBusinessRating(tx, business)
  return { status: nextStatus, source: 'item' as const, reviewId: review.id, verified }
}

export async function refreshBusinessRating(tx: Prisma.TransactionClient, business: BusinessProfile) {
  const where = business.kind === 'SELLER' ? { sellerId: business.sellerId!, status: 'APPROVED' } : { itemType: 'business', itemId: business.id, status: 'APPROVED' }
  const values = business.kind === 'SELLER' ? await tx.sellerReview.aggregate({ where, _count: true, _sum: { rating: true } }) : await tx.itemReview.aggregate({ where, _count: true, _sum: { rating: true } })
  const data = { ratingCount: values._count, ratingSum: values._sum.rating || 0 }
  await tx.itemStat.upsert({ where: { itemType_itemId: { itemType: 'business', itemId: business.id } }, create: { itemType: 'business', itemId: business.id, ...data }, update: data })
  if (business.sellerId) await tx.seller.update({ where: { id: business.sellerId }, data })
}

export async function moderateBusinessExperience(tx: Prisma.TransactionClient, business: BusinessProfile, id: number, action: 'approve' | 'reject') {
  if (business.kind === 'SELLER') {
    const row = await tx.sellerReview.findFirst({ where: { id, sellerId: business.sellerId! } })
    if (!row) throw new BusinessError('تجربه پیدا نشد', 404)
    const changed = await tx.sellerReview.updateMany({ where: { id, sellerId: business.sellerId!, status: row.status }, data: { status: action === 'approve' ? 'APPROVED' : 'HIDDEN' } })
    if (changed.count !== 1) throw new BusinessError('وضعیت تجربه تغییر کرده است', 409)
  } else {
    const row = await tx.itemReview.findFirst({ where: { id, itemType: 'business', itemId: business.id } })
    if (!row) throw new BusinessError('تجربه پیدا نشد', 404)
    const changed = await tx.itemReview.updateMany({ where: { id, status: row.status, updatedAt: row.updatedAt }, data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED' } })
    if (changed.count !== 1) throw new BusinessError('وضعیت تجربه تغییر کرده است', 409)
  }
  await refreshBusinessRating(tx, business)
}

export async function replyToBusinessExperience(tx: Prisma.TransactionClient, business: BusinessProfile, userId: number, reviewId: number, input: unknown) {
  const reply = normalizeReviewBody(input)
  if (!reply) throw new BusinessError('پاسخ را بنویسید')
  if (business.kind === 'SELLER') {
    const seller = await tx.seller.findFirst({ where: { id: business.sellerId!, userId, status: 'ACTIVE' } })
    if (!seller) throw new BusinessError('فقط فروشندهٔ همین کسب‌وکار می‌تواند پاسخ دهد', 403)
    if (!await tx.sellerReview.findFirst({ where: { id: reviewId, sellerId: seller.id, status: 'APPROVED' } })) throw new BusinessError('تجربهٔ منتشرشده پیدا نشد', 404)
    await replyReview(seller, reviewId, reply, tx)
  } else {
    if (business.representativeId !== userId) throw new BusinessError('فقط نمایندهٔ تأییدشده می‌تواند پاسخ دهد', 403)
    const changed = await tx.itemReview.updateMany({ where: { id: reviewId, itemType: 'business', itemId: business.id, status: 'APPROVED' }, data: { businessReply: reply, businessReplyBy: userId, businessReplyAt: new Date() } })
    if (changed.count !== 1) throw new BusinessError('تجربهٔ منتشرشده پیدا نشد', 404)
  }
}
