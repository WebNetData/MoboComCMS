import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { legacyNumber } from '@/shared/money'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'resellers.manage')) return err('forbidden', 403)
  const status = req.nextUrl.searchParams.get('status') || ''
  if (status && !['AWAITING_RECEIPT', 'REVIEW', 'PROCESSING', 'PROVISIONING', 'DELIVERING', 'FULFILLED', 'REJECTED', 'CANCELLED', 'NEEDS_REVIEW'].includes(status)) return err('invalid status')
  const rows = await db.resellerSale.findMany({ where: status ? { status } : undefined, orderBy: { id: 'desc' }, take: 200, include: { offer: { select: { nameFa: true, nameEn: true } } } })
  const resellerIds = [...new Set(rows.map(row => row.resellerId))]
  const botIds = [...new Set(rows.map(row => row.botId))]
  const [resellers, bots] = await Promise.all([db.reseller.findMany({ where: { id: { in: resellerIds } }, include: { user: { select: { email: true } } } }), db.resellerBot.findMany({ where: { id: { in: botIds } }, select: { id: true, username: true } })])
  const resellerNames = new Map(resellers.map(row => [row.id, row.user.email]))
  const botNames = new Map(bots.map(row => [row.id, row.username]))
  return ok({ sales: rows.map(row => ({ id: row.id, resellerId: row.resellerId, reseller: resellerNames.get(row.resellerId) || '', bot: botNames.get(row.botId) || '', telegramUserId: row.telegramUserId, offer: row.offer, status: row.status, retailPrice: legacyNumber(row.retailMinor, row.currency), currency: row.currency, orderId: row.orderId, subscriptionId: row.subscriptionId, createdAt: row.createdAt, lastError: row.lastError, reviewedAt: row.reviewedAt, reviewDecision: row.reviewDecision, reviewerUserId: row.reviewerUserId, reviewerTelegramId: row.reviewerTelegramId })) })
}
