import { db } from '@/platform/database/prisma'
import { balanceOf, performanceLabel, ratingSummary } from '@/modules/marketplace/domain/marketplace'
import { type SellerRow } from '@/modules/marketplace/server/marketplace/identity'
import { DAY } from '@/modules/marketplace/server/marketplace/core'
import { pendingProducts } from '@/modules/marketplace/server/marketplace/admin'
import { publicSeller } from '@/modules/marketplace/server/marketplace/public'

export async function sellerDashboard(seller: SellerRow) {
  const since = new Date(Date.now() - 30 * DAY)
  const [ledger, lines30, openLines, products, pendingProducts, lowStock, reviews] = await Promise.all([
    db.sellerLedger.findMany({ where: { sellerId: seller.id }, select: { kind: true, amountMinor: true, availableAt: true } }),
    db.orderLine.findMany({ where: { sellerId: seller.id, order: { status: { in: ['PAID', 'REFUNDED'] } }, createdAt: { gte: since } }, select: { totalMinor: true, quantity: true, commissionMinor: true, createdAt: true } }),
    db.orderLine.count({ where: { sellerId: seller.id, order: { status: 'PAID' }, sellerStatus: { in: ['', 'ACCEPTED', 'READY'] } } }),
    db.product.count({ where: { sellerId: seller.id, active: true } }),
    db.product.count({ where: { sellerId: seller.id, approval: 'PENDING' } }),
    db.product.findMany({ where: { sellerId: seller.id, active: true, stock: { gte: 0, lte: 3 } }, select: { id: true, name: true, stock: true }, take: 8 }),
    db.sellerReview.findMany({ where: { sellerId: seller.id, status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ])
  const money = balanceOf(ledger)
  const byDay = new Map<string, bigint>()
  for (const line of lines30) { const day = line.createdAt.toISOString().slice(0, 10); byDay.set(day, (byDay.get(day) || 0n) + line.totalMinor) }
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * DAY).toISOString().slice(0, 10))
  const rating = ratingSummary(seller.ratingSum, seller.ratingCount)
  return {
    shop: publicSeller(seller),
    money: { balance: Number(money.balance), available: Number(money.available), pending: Number(money.pending) },
    sales30: Number(lines30.reduce((sum, line) => sum + line.totalMinor, 0n)), items30: lines30.reduce((sum, line) => sum + line.quantity, 0), orders30: lines30.length,
    chart: days.map((day) => ({ day, total: Number(byDay.get(day) || 0n) })),
    openLines, products, pendingProducts, lowStock, rating, performance: performanceLabel(rating.average, rating.count),
    reviews: reviews.map((row) => ({ id: row.id, rating: row.rating, body: row.body, createdAt: row.createdAt.toISOString() })),
  }
}
