import type { Prisma } from '@prisma/client'

/** Shared report persistence; the business owner validates visibility, target binding and current authority. */
export async function createBusinessReviewReport(tx: Prisma.TransactionClient, data: { businessId: number; itemReviewId: number | null; sellerReviewId: number | null; reporterId: number; reason: string; note: string; businessReviewDigest: string }) {
  const where = { businessId: data.businessId, itemReviewId: data.itemReviewId, sellerReviewId: data.sellerReviewId, reporterId: data.reporterId, status: 'OPEN' }
  const duplicate = await tx.communityReport.findFirst({ where, select: { id: true } })
  if (duplicate) return { id: duplicate.id, duplicate: true }
  return { id: (await tx.communityReport.create({ data })).id, duplicate: false }
}
export async function businessReviewReports(tx: Prisma.TransactionClient, page: number, status: string) {
  const where = { businessId: { not: null }, status }
  const [total, rows] = await Promise.all([tx.communityReport.count({ where }), tx.communityReport.findMany({ where, orderBy: { id: 'asc' }, skip: (page - 1) * 20, take: 20, select: { id: true, businessId: true, itemReviewId: true, sellerReviewId: true, reason: true, note: true, decisionNote: true, status: true, createdAt: true, business: { select: { name: true, slug: true } }, itemReview: { select: { body: true } }, sellerReview: { select: { body: true } } } })])
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / 20)) }
}
