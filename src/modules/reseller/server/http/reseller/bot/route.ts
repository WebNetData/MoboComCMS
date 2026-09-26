import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireReseller, resellerCan } from '@/modules/reseller/server/reseller'
import { botPublic, installResellerBot, setResellerBotActive } from '@/modules/reseller/server/reseller-bot'
import { reviewResellerSale } from '@/modules/reseller/server/reseller-bot-sales'
import { legacyNumber } from '@/shared/money'

export async function GET(req: NextRequest) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!resellerCan(guard, 'sales.view')) return err('forbidden', 403)
  const [row, sales] = await Promise.all([db.resellerBot.findUnique({ where: { resellerId: guard.reseller.id } }), db.resellerSale.findMany({ where: { resellerId: guard.reseller.id }, orderBy: { id: 'desc' }, take: 40, include: { offer: { select: { nameEn: true, nameFa: true } } } })])
  const publicBot = row ? botPublic(row) : null
  return ok({ owner: guard.owner, canReview: resellerCan(guard, 'sales.review'), bot: guard.owner ? publicBot : publicBot ? { id: publicBot.id, username: publicBot.username, brandName: publicBot.brandName, active: publicBot.active, lastError: publicBot.lastError, link: publicBot.link } : null, sales: sales.map(s => ({ id: s.id, telegramUserId: s.telegramUserId, offer: s.offer, status: s.status, retailPrice: legacyNumber(s.retailMinor, s.currency), currency: s.currency, createdAt: s.createdAt, lastError: s.lastError, hasReceipt: Boolean(s.receiptFileId), reviewedAt: s.reviewedAt, reviewDecision: s.reviewDecision, reviewerUserId: s.reviewerUserId, reviewerTelegramId: s.reviewerTelegramId })) })
}

export async function PUT(req: NextRequest) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!guard.owner) return err('forbidden', 403)
  try { return ok({ bot: await installResellerBot(guard.reseller.id, await req.json()) }) }
  catch (error) { return err(error instanceof Error ? error.message : 'Bot configuration failed') }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!guard.owner) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  if (typeof body?.active !== 'boolean') return err('active is required')
  try { return ok({ bot: await setResellerBotActive(guard.reseller.id, body.active) }) }
  catch (error) { return err(error instanceof Error ? error.message : 'Bot update failed') }
}

export async function POST(req: NextRequest) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!resellerCan(guard, 'sales.review')) return err('forbidden', 403)
  const row = await db.resellerBot.findUnique({ where: { resellerId: guard.reseller.id } })
  if (!row?.active) return err('bot is not active', 409)
  const body = await req.json().catch(() => null)
  const saleId = Number(body?.saleId)
  if (!Number.isSafeInteger(saleId) || saleId <= 0 || !['approve', 'reject'].includes(body?.action)) return err('invalid action')
  const sale = await db.resellerSale.findFirst({ where: { id: saleId, resellerId: guard.reseller.id, status: 'REVIEW', receiptFileId: { not: '' } } })
  if (!sale) return err('sale not awaiting receipt review', 404)
  const message = await reviewResellerSale(row, saleId, body.action === 'approve', { userId: guard.auth.id })
  return ok({ message })
}
