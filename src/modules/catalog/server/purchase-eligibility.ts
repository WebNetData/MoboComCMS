import { db } from '@/platform/database/prisma'

/** Existing verified-buyer policy, including every item in a modern cart order. */
export async function hasVerifiedProductPurchase(userId: number, productId: number, unreturned = false): Promise<boolean> {
  if (![userId, productId].every(id => Number.isSafeInteger(id) && id > 0)) return false
  const where = {
      userId, status: 'PAID', invoice: { status: 'PAID' },
      OR: [
        { lines: { some: { productId, quantity: { gt: 0 }, sellerStatus: { not: 'CANCELLED' } } } },
        { productId, lines: { none: {} } },
      ],
    }
  if (unreturned) {
    const orders = await db.order.findMany({ where, select: { id: true, lines: { where: { productId, sellerStatus: { not: 'CANCELLED' } }, select: { line: true, quantity: true } }, returns: { where: { status: 'REFUNDED' }, select: { lines: true } } } })
    return orders.some(order => (order.lines.length ? order.lines : [{ line: 0, quantity: 1 }]).some(line => {
      let returned = 0
      for (const request of order.returns) {
        try {
          const choices = JSON.parse(request.lines)
          if (!Array.isArray(choices) || !choices.length) return false
          for (const choice of choices) { if (!Number.isSafeInteger(choice.line) || !Number.isSafeInteger(choice.quantity) || choice.quantity <= 0) return false; if (choice.line === line.line) returned += choice.quantity }
        } catch { return false }
      }
      return returned < line.quantity
    }))
  }
  const order = await db.order.findFirst({
    where,
    select: { id: true },
  })
  return Boolean(order)
}
