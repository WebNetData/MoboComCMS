import { db } from '@/platform/database/prisma'
import { readGiftOrder } from '@/modules/store/domain/gift-order'

/** This projection deliberately never loads prices, answers or digital delivery secrets. */
export async function giftReceipt(userId: number, orderId: number) {
  const order = await db.order.findFirst({
    where: { id: orderId, userId, productId: { not: null }, status: 'PAID', invoice: { is: { status: 'PAID' } } },
    select: { id: true, createdAt: true, meta: true, lines: {
      where: { kind: 'PHYSICAL' }, orderBy: { line: 'asc' },
      select: { name: true, variantName: true, quantity: true },
    } },
  })
  if (!order) return null
  let meta: Record<string, unknown>
  try { meta = JSON.parse(order.meta) } catch { return null }
  const gift = readGiftOrder(meta?.gift)
  if (!gift || !order.lines.length) return null
  return { id: order.id, createdAt: order.createdAt, gift, lines: order.lines }
}
