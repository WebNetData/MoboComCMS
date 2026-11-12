import type { Prisma } from '@prisma/client'
import { promotionCode, promotionDiscount } from './promotions'
import { isMember } from '@/modules/membership/server/membership'
import { StoreError } from '@/modules/store/domain/store'

/** Counter uses the same Promotion and redemption limits as checkout. A pending phone account is quotation only. */
export async function counterPromotion(tx: Prisma.TransactionClient, input: { code?: string; userId: number | null; pendingAccount?: boolean; amountMinor: bigint; currency: string }) {
  const code = promotionCode(input.code)
  if (!code) return { promotion: null, discountMinor: 0n }
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new StoreError('کد تخفیف معتبر نیست')
  const promotion = await tx.promotion.findUnique({ where: { code } })
  if (!promotion) throw new StoreError('کد تخفیف پیدا نشد', 404)
  if (!input.userId && !input.pendingAccount) throw new StoreError('برای سقف استفادهٔ کد تخفیف، مشتری را با موبایل مشخص کنید')
  if (promotion.membersOnly && (!input.userId || !await isMember(input.userId))) throw new StoreError('این کد مخصوص اعضای ویژه است', 403)
  const quote = promotionDiscount(promotion, { planId: null, amountMinor: input.amountMinor, currency: input.currency, channel: 'COUNTER' })
  if (!quote.ok) throw new StoreError('این کد برای کانال، مبلغ یا زمان این فروش قابل استفاده نیست', 409, quote.code)
  if (input.userId && await tx.promotionRedemption.count({ where: { promotionId: promotion.id, userId: input.userId, status: { in: ['RESERVED', 'USED'] } } }) >= promotion.perUserLimit) throw new StoreError('سقف استفادهٔ این مشتری از کد تخفیف پر شده است', 409)
  return { promotion, discountMinor: quote.discountMinor }
}

export async function redeemCounterPromotion(tx: Prisma.TransactionClient, promotion: NonNullable<Awaited<ReturnType<typeof counterPromotion>>['promotion']>, orderId: number, userId: number) {
  const claimed = await tx.promotion.updateMany({ where: { id: promotion.id, active: true, reservedCount: promotion.reservedCount }, data: { reservedCount: { increment: 1 } } })
  if (claimed.count !== 1) throw new StoreError('ظرفیت تخفیف هم‌زمان تغییر کرد؛ مبلغ را دوباره بررسی کنید', 409)
  await tx.promotionRedemption.create({ data: { promotionId: promotion.id, userId, orderId, status: 'RESERVED' } })
}
