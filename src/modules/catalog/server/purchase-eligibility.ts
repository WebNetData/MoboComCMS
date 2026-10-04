import { db } from '@/platform/database/prisma'

/** Existing verified-buyer policy, including every item in a modern cart order. */
export async function hasVerifiedProductPurchase(userId: number, productId: number): Promise<boolean> {
  if (![userId, productId].every(id => Number.isSafeInteger(id) && id > 0)) return false
  const order = await db.order.findFirst({
    where: {
      userId, status: 'PAID', invoice: { status: 'PAID' },
      OR: [
        { lines: { some: { productId, quantity: { gt: 0 }, sellerStatus: { not: 'CANCELLED' } } } },
        { productId, lines: { none: {} } },
      ],
    },
    select: { id: true },
  })
  return Boolean(order)
}
