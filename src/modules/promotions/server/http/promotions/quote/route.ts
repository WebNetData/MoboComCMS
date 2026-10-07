import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { promotionCode, promotionDiscount } from '@/modules/promotions/server/promotions'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { isMember } from '@/modules/membership/server/membership'
import { memberPrice } from '@/modules/membership/domain/membership'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('sign in to check a discount', 401)
  if (!(await rateLimitStrict(`promotion:quote:${clientIp(req.headers)}:${user.id}`, 20, 10 * 60_000)).ok) return err('too many attempts', 429)
  const body = await req.json().catch(() => null)
  const code = promotionCode(body?.code)
  const planId = Number(body?.planId)
  if (!/^[A-Z0-9_-]{3,32}$/.test(code) || !Number.isSafeInteger(planId) || planId <= 0) return err('invalid input')
  const offerId = Number(body?.offerId)
  const [promotion, plan, offer] = await Promise.all([db.promotion.findUnique({ where: { code } }), db.plan.findUnique({ where: { id: planId } }), Number.isSafeInteger(offerId) && offerId > 0 ? db.serviceOffer.findUnique({ where: { id: offerId } }) : null])
  if (!promotion || !plan?.active) return err('code or plan not found', 404)
  const member = await isMember(user.id)
  if (promotion.membersOnly && !member) return err('PROMOTION_MEMBERS_ONLY', 403)
  if (offerId && (!offer?.active || offer.ownerKey !== 'SITE' || offer.planId !== planId)) return err('offer not found', 404)
  const currency = normalizeCurrency(plan.currency)
  const regularMinor = offer ? offer.priceMinor : plan.priceMinor || toMinor(plan.price, currency)
  const amountMinor = offer ? regularMinor : memberPrice(regularMinor, plan.memberPriceMinor, member).amountMinor
  const quote = promotionDiscount(promotion, { planId, amountMinor, currency })
  if (!quote.ok) return err(quote.code, 409)
  const used = await db.promotionRedemption.count({ where: { promotionId: promotion.id, userId: user.id, status: { in: ['RESERVED', 'USED'] } } })
  if (used >= promotion.perUserLimit) return err('PROMOTION_USER_LIMIT', 409)
  return ok({ subtotal: legacyNumber(amountMinor, currency), discount: legacyNumber(quote.discountMinor, currency), total: legacyNumber(amountMinor - quote.discountMinor, currency), currency })
}
