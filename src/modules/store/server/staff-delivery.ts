import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { decryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { readDeliveryDetails, type DeliveryDetails } from '@/modules/store/domain/delivery-details'
import { getStoreSettings } from '@/modules/store/server/catalog'
import { orderDeliveryTemplate } from '@/modules/store/server/delivery-template'
import { getSiteConfig } from '@/modules/site/config/store'
import type { DeliveryNotice } from '@/modules/store/domain/delivery-details'
import type { DeliveryCardData } from '@/modules/store/domain/card-designs'

/**
 * Virtual orders a specialist delivers by hand (owner 2026-11-12): what the buyer sees while it is made and once it is
 * delivered, and a word to the team when one waits longer than the shop promises (`staffDeliveryHours`).
 */

export const VIRTUAL_ORDER: Prisma.OrderWhereInput = { AND: [{ lines: { none: { kind: 'PHYSICAL' } } }, { OR: [{ lines: { some: {} } }, { product: { is: { kind: { not: 'PHYSICAL' } } } }] }] }

export type BuyerDelivery = {
  status: string
  /** A specialist has taken the order. */
  assigned: boolean
  paidAt: Date
  deliveredAt: Date | null
  /** What the shop promises (0 = nothing said). */
  hours: number
  /** Store setting deliveredNote: the line shown above the details (empty = none). */
  note: string
  details: (DeliveryDetails & { structured: boolean }) | null
  /** From the product's delivery template: notices above the delivery, and whether it is shown as a card. */
  notices: DeliveryNotice[]
  card: DeliveryCardData | null
}

/** The hand delivery of the buyer's own paid virtual order; null for any other order. */
export async function buyerDelivery(userId: number, orderId: number): Promise<BuyerDelivery | null> {
  const order = await db.order.findFirst({
    where: { id: orderId, userId, status: 'PAID', ...VIRTUAL_ORDER },
    select: { assigneeId: true, createdAt: true, productId: true, product: { select: { name: true } }, lines: { select: { productId: true, name: true }, orderBy: { line: 'asc' } }, invoice: { select: { paidAt: true } }, productDelivery: { select: { status: true, digitalDelivery: true, deliveredAt: true } } },
  })
  if (!order) return null
  const status = order.productDelivery?.status || 'PENDING'
  let details: BuyerDelivery['details'] = null
  // Readable only once delivered, and only by the buyer whose order it is (the query above).
  if (status === 'DELIVERED' && order.productDelivery?.digitalDelivery) {
    try { details = readDeliveryDetails(decryptDigitalDelivery(order.productDelivery.digitalDelivery)) } catch { details = null }
  }
  const [{ staffDeliveryHours, deliveredNote }, template, site] = await Promise.all([getStoreSettings(), orderDeliveryTemplate(order), getSiteConfig()])
  const card = template?.card ? { product: order.lines[0]?.name || order.product?.name || '', brand: { title: site.brand || '', logo: site.logo || '' }, design: template.design } : null
  return { status, assigned: order.assigneeId !== null, paidAt: order.invoice?.paidAt || order.createdAt, deliveredAt: order.productDelivery?.deliveredAt || null, hours: staffDeliveryHours, note: deliveredNote, details, notices: template?.notices || [], card }
}

/**
 * Worker step: a paid virtual order still not delivered after the promised hours is noted once (`LATE`, staff only);
 * its specialist is told in their inbox, and the managers by SMS when «سفارش دیرکرد (مدیر)» is on.
 */
export async function alertLateDeliveries(limit = 50, now = new Date()) {
  const { staffDeliveryHours: hours } = await getStoreSettings()
  if (!hours) return { checked: 0, alerted: 0 }
  const cutoff = new Date(now.getTime() - hours * 3_600_000)
  const rows = await db.order.findMany({
    where: {
      status: 'PAID', ...VIRTUAL_ORDER,
      productDelivery: { is: { status: { in: ['PENDING', 'PROCESSING'] } } },
      OR: [{ invoice: { is: { paidAt: { lte: cutoff } } } }, { invoice: { is: null }, createdAt: { lte: cutoff } }],
      events: { none: { status: 'LATE' } },
    },
    orderBy: { id: 'asc' }, take: limit, select: { id: true, assigneeId: true },
  })
  let alerted = 0
  const sms = rows.length ? await import('@/modules/sms/server/sms').catch(() => null) : null
  for (const row of rows) {
    try {
      await db.orderEvent.create({ data: { orderId: row.id, status: 'LATE', note: `بیش از ${hours.toLocaleString('fa-IR')} ساعت از پرداخت گذشته و سفارش هنوز تحویل نشده است`, visible: false } })
      if (row.assigneeId) await createInboxEvent({
        userId: row.assigneeId, kind: 'ORDER_LATE', dedupeKey: `store-order:${row.id}:late`,
        titleEn: `Order #${row.id} is late`, titleFa: `سفارش ${row.id.toLocaleString('fa-IR')} از زمان وعده‌داده گذشته است`,
        bodyEn: 'The buyer is waiting for the delivery.', bodyFa: 'مشتری منتظر تحویل است؛ سفارش را تکمیل کنید.', href: `/admin/store/orders/${row.id}`,
      }).catch(() => undefined)
      await sms?.notifyAdmins('ADMIN_ORDER_LATE', { order: String(row.id), hours: String(hours) }).catch(() => undefined)
      alerted++
    } catch (error) { logEvent('error', 'store.late_alert_failed', { orderId: row.id, error }) }
  }
  return { checked: rows.length, alerted }
}
