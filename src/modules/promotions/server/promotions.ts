import { db } from '@/platform/database/prisma'

export const promotionCode = (value: unknown) => String(value || '').trim().toUpperCase()

export function promotionDiscount(promotion: { active: boolean; kind: string; percentBps: number; amountMinor: bigint; currency: string; planId: number | null; minSubtotalMinor: bigint; maxUses: number; reservedCount: number; startsAt: Date | null; endsAt: Date | null }, item: { planId: number | null; amountMinor: bigint; currency: string }, now = new Date()) {
  if (!promotion.active || promotion.startsAt && promotion.startsAt > now || promotion.endsAt && promotion.endsAt <= now) return { ok: false as const, code: 'PROMOTION_INACTIVE' }
  if (promotion.planId && promotion.planId !== item.planId) return { ok: false as const, code: 'PROMOTION_SCOPE' }
  if (promotion.currency !== item.currency || item.amountMinor < promotion.minSubtotalMinor) return { ok: false as const, code: 'PROMOTION_MINIMUM' }
  if (promotion.maxUses > 0 && promotion.reservedCount >= promotion.maxUses) return { ok: false as const, code: 'PROMOTION_EXHAUSTED' }
  const raw = promotion.kind === 'PERCENT' ? (item.amountMinor * BigInt(promotion.percentBps)) / 10_000n : promotion.amountMinor
  const discountMinor = raw > item.amountMinor ? item.amountMinor : raw
  if (discountMinor <= 0n) return { ok: false as const, code: 'PROMOTION_INVALID' }
  return { ok: true as const, discountMinor }
}

export async function releasePromotionForOrder(orderId: number) {
  return db.$transaction(async tx => {
    const row = await tx.promotionRedemption.findUnique({ where: { orderId } })
    if (!row) return false
    const changed = await tx.promotionRedemption.updateMany({ where: { id: row.id, status: 'RESERVED' }, data: { status: 'RELEASED' } })
    if (changed.count) await tx.promotion.update({ where: { id: row.promotionId }, data: { reservedCount: { decrement: 1 } } })
    return changed.count > 0
  })
}

/** Release reserved uses only after an order reaches a terminal non-paid state. */
export async function releaseTerminalPromotionReservations(limit = 100) {
  const reservations = await db.promotionRedemption.findMany({ where: { status: 'RESERVED', order: { status: { in: ['FAILED', 'CANCELLED', 'EXPIRED'] } } }, select: { orderId: true }, orderBy: { id: 'asc' }, take: Math.max(1, Math.min(500, limit)) })
  let released = 0
  for (const row of reservations) if (await releasePromotionForOrder(row.orderId)) released++
  return released
}
