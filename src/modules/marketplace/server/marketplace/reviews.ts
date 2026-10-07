import { db } from '@/platform/database/prisma'
import { MarketplaceError, validateSellerReview } from '@/modules/marketplace/domain/marketplace'
import { type SellerRow } from '@/modules/marketplace/server/marketplace/identity'

/** Sellers the customer can still rate on a delivered order. */
export async function reviewableSellers(userId: number, orderId: number) {
  const order = await db.order.findFirst({ where: { id: orderId, userId, status: 'PAID' }, select: { productDelivery: { select: { status: true } }, lines: { where: { sellerId: { not: null } }, select: { sellerId: true } } } })
  if (!order || order.productDelivery?.status !== 'DELIVERED') return []
  const ids = [...new Set(order.lines.map((line) => line.sellerId!))]
  const [sellers, done] = await Promise.all([
    db.seller.findMany({ where: { id: { in: ids } }, select: { id: true, shopName: true, slug: true, logo: true } }),
    db.sellerReview.findMany({ where: { orderId, sellerId: { in: ids } }, select: { sellerId: true, rating: true } }),
  ])
  return sellers.map((seller) => ({ ...seller, reviewed: done.find((row) => row.sellerId === seller.id)?.rating ?? null }))
}

export async function reviewSeller(userId: number, input: Record<string, unknown>) {
  const orderId = Number(input.orderId), sellerId = Number(input.sellerId)
  const allowed = (await reviewableSellers(userId, orderId)).find((row) => row.id === sellerId)
  if (!allowed) throw new MarketplaceError('امکان ثبت امتیاز برای این سفارش نیست', 403)
  if (allowed.reviewed) throw new MarketplaceError('برای این فروشنده قبلاً امتیاز داده‌اید', 409)
  const review = validateSellerReview(input)
  await db.$transaction([
    db.sellerReview.create({ data: { sellerId, userId, orderId, rating: review.rating, criteria: JSON.stringify(review.criteria), body: review.body } }),
    db.seller.update({ where: { id: sellerId }, data: { ratingSum: { increment: review.rating }, ratingCount: { increment: 1 } } }),
  ])
  return { ok: true }
}

export async function sellerReviews(sellerId: number, take = 30) {
  const rows = await db.sellerReview.findMany({ where: { sellerId, status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take })
  const users = await db.user.findMany({ where: { id: { in: rows.map((row) => row.userId) } }, select: { id: true, name: true } })
  const names = new Map(users.map((user) => [user.id, user.name]))
  return rows.map((row) => ({ id: row.id, rating: row.rating, criteria: JSON.parse(row.criteria || '{}'), body: row.body, reply: row.reply, name: (names.get(row.userId) || 'خریدار').split(' ')[0], createdAt: row.createdAt.toISOString() }))
}

export async function replyReview(seller: SellerRow, id: number, reply: unknown) {
  const text = String(reply ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 600)
  const updated = await db.sellerReview.updateMany({ where: { id, sellerId: seller.id }, data: { reply: text } })
  if (!updated.count) throw new MarketplaceError('نظر پیدا نشد', 404)
}
