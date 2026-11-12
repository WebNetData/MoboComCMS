import { db } from '@/platform/database/prisma'
import { readDeliveryTemplate, type ProductDeliveryTemplate } from '@/modules/store/domain/delivery-details'

/**
 * The delivery template of an order (store/domain/delivery-details): the first virtual product of the order whose
 * template says anything (rows, a note, notices or the card). An order of one product, as nearly all are, has its own.
 */
export async function orderDeliveryTemplate(order: { productId: number | null; lines: { productId: number | null }[] }): Promise<ProductDeliveryTemplate | null> {
  const ids = [...new Set([order.productId, ...order.lines.map((line) => line.productId)].filter((id): id is number => id !== null))]
  if (!ids.length) return null
  const rows = await db.product.findMany({ where: { id: { in: ids }, kind: 'VIRTUAL' }, select: { id: true, deliveryTemplate: true } })
  const ordered = ids.flatMap((id) => rows.filter((row) => row.id === id))
  return ordered.map((row) => readDeliveryTemplate(row.deliveryTemplate)).find((template) => template.rows.length > 0 || !!template.note || template.notices.length > 0 || template.card) || null
}
