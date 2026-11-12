import { db } from '@/platform/database/prisma'
import { decryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { getSiteConfig } from '@/modules/site/config/store'
import { readDeliveryDetails, readDeliveryTemplate, type DeliveryItem, type ProductDeliveryTemplate } from '@/modules/store/domain/delivery-details'
import { DEFAULT_CARD_DESIGN } from '@/modules/store/domain/card-designs'
import { orderVisibility, type OrderWorkScope } from '@/modules/store/server/order-work'
import { orderDeliveryTemplate } from '@/modules/store/server/delivery-template'
import { VIRTUAL_ORDER } from '@/modules/store/server/staff-delivery'

/**
 * The Admin «print a card» page (owner 2026-11-12: a customer in the shop gets the same card on paper): the site's
 * brand, the virtual products to start from (drafts and hidden ones too: a product not on sale online may still be
 * sold in the shop), and a delivered order's card for its specialist or a manager. Nothing typed on that page is kept.
 */
export const printBrand = async () => { const site = await getSiteConfig(); return { title: site.brand || '', logo: site.logo || '' } }

export async function printProducts(query: string) {
  const q = query.trim().slice(0, 80)
  const rows = await db.product.findMany({
    where: { kind: 'VIRTUAL', ...(q ? { name: { contains: q } } : {}) },
    orderBy: [{ active: 'desc' }, { id: 'desc' }], take: 30,
    select: { id: true, name: true, active: true, deliveryTemplate: true, variants: { where: { active: true }, select: { name: true }, orderBy: { id: 'asc' } } },
  })
  return rows.map((row) => ({ id: row.id, name: row.name, active: row.active, variants: row.variants.map((variant) => variant.name).filter(Boolean), template: readDeliveryTemplate(row.deliveryTemplate) }))
}

export type OrderPrint = { orderId: number; customer: string; product: string; items: DeliveryItem[]; note: string; template: ProductDeliveryTemplate }

/** A delivered virtual order this staff member may work on, decrypted; null when there is nothing to print. */
export async function orderPrint(orderId: number, scope: OrderWorkScope): Promise<OrderPrint | null> {
  const order = await db.order.findFirst({
    where: { id: orderId, status: 'PAID', ...VIRTUAL_ORDER, ...orderVisibility(scope), productDelivery: { is: { status: 'DELIVERED' } } },
    select: { id: true, productId: true, product: { select: { name: true } }, user: { select: { name: true } }, lines: { select: { productId: true, name: true }, orderBy: { line: 'asc' } }, productDelivery: { select: { digitalDelivery: true } } },
  })
  if (!order?.productDelivery?.digitalDelivery) return null
  const details = readDeliveryDetails(decryptDigitalDelivery(order.productDelivery.digitalDelivery))
  const template = await orderDeliveryTemplate(order) || { card: true, rows: [], note: '', notices: [], design: DEFAULT_CARD_DESIGN }
  return { orderId: order.id, customer: order.user?.name || '', product: order.lines[0]?.name || order.product?.name || '', items: details.items, note: details.note, template }
}
