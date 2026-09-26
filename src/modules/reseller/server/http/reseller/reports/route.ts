import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireReseller, resellerCan } from '@/modules/reseller/server/reseller'
import { legacyNumber } from '@/shared/money'

const statusOrder = ['AWAITING_RECEIPT', 'REVIEW', 'PROCESSING', 'PROVISIONING', 'DELIVERING', 'FULFILLED', 'REJECTED', 'CANCELLED', 'NEEDS_REVIEW']

export async function GET(req: NextRequest) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!resellerCan(guard, 'sales.view')) return err('forbidden', 403)

  const days = Number(req.nextUrl.searchParams.get('days') || 30)
  if (!Number.isSafeInteger(days) || days < 1 || days > 366) return err('days must be between 1 and 366')
  const since = new Date(Date.now() - days * 24 * 60 * 60_000)
  const where = { resellerId: guard.reseller.id, createdAt: { gte: since } }
  const [byStatus, fulfilledByCurrency, recent, oldestNeedsReview] = await Promise.all([
    db.resellerSale.groupBy({ by: ['status'], where, _count: { _all: true } }),
    db.resellerSale.groupBy({ by: ['currency'], where: { ...where, status: 'FULFILLED' }, _count: { _all: true }, _sum: { retailMinor: true } }),
    db.resellerSale.findMany({ where, orderBy: { id: 'desc' }, take: 50, select: { id: true, telegramUserId: true, status: true, retailMinor: true, currency: true, createdAt: true, reviewedAt: true, deliveredAt: true, lastError: true, offer: { select: { nameFa: true, nameEn: true } } } }),
    db.resellerSale.findFirst({ where: { ...where, status: 'NEEDS_REVIEW' }, orderBy: { createdAt: 'asc' }, select: { id: true, createdAt: true } }),
  ])
  const counts = Object.fromEntries(statusOrder.map(status => [status, byStatus.find(row => row.status === status)?._count._all || 0]))
  return ok({ days, since, counts, total: byStatus.reduce((sum, row) => sum + row._count._all, 0), fulfilled: fulfilledByCurrency.map(row => ({ currency: row.currency, count: row._count._all, amount: legacyNumber(row._sum.retailMinor || 0n, row.currency) })), oldestNeedsReview, recent: recent.map(row => ({ ...row, retailMinor: undefined, retailPrice: legacyNumber(row.retailMinor, row.currency) })) })
}
