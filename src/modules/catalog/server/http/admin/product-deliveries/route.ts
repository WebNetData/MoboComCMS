import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { encryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'orders.manage')) return err('forbidden', 403)
  const status = req.nextUrl.searchParams.get('status') || 'ALL'
  if (!['ALL', 'PENDING', 'PROCESSING', 'DELIVERED'].includes(status)) return err('invalid status')
  const rows = await db.productDelivery.findMany({ where: status === 'ALL' ? {} : { status }, orderBy: status === 'DELIVERED' || status === 'ALL' ? { createdAt: 'desc' } : [{ scheduledDate: 'asc' }, { createdAt: 'asc' }], take: 200, select: { id: true, orderId: true, status: true, address: true, scheduledDate: true, scheduledSlot: true, trackingCode: true, deliveryNote: true, digitalDelivery: true, createdAt: true, order: { select: { id: true, meta: true, totalAmount: true, currency: true, product: { select: { name: true, kind: true } }, user: { select: { id: true, name: true, email: true } }, invoice: { select: { number: true, status: true } } } } } })
  return ok(rows.map(({ digitalDelivery, ...row }) => ({ ...row, hasDigitalDelivery: Boolean(digitalDelivery), address: row.address ? JSON.parse(row.address) : null })))
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'orders.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  const status = body?.status
  if (!Number.isSafeInteger(id) || id <= 0 || !['PENDING', 'PROCESSING', 'DELIVERED'].includes(status)) return err('invalid input')
  const delivery = await db.productDelivery.findUnique({ where: { id }, include: { order: { include: { invoice: true, product: { select: { kind: true } } } } } })
  if (!delivery || delivery.order.status !== 'PAID' || delivery.order.invoice?.status !== 'PAID') return err('Paid order not found', 404)
  const trackingCode = String(body?.trackingCode || '').trim().slice(0, 120)
  const deliveryNote = String(body?.deliveryNote || '').trim().slice(0, 1000)
  if (/[<>]/.test(trackingCode + deliveryNote)) return err('Plain text only')
  const secret = typeof body?.digitalDelivery === 'string' ? body.digitalDelivery.trim() : ''
  if (secret.length > 5000) return err('Digital delivery details are too long')
  let encrypted: string | undefined
  if (secret) {
    if (delivery.order.product?.kind !== 'VIRTUAL') return err('Digital delivery details are only for virtual products')
    try { encrypted = encryptDigitalDelivery(secret) } catch (error) { return err(error instanceof Error ? error.message : 'Encryption unavailable', 503) }
  }
  const updated = await db.productDelivery.update({ where: { id }, data: { status, trackingCode, deliveryNote, ...(encrypted ? { digitalDelivery: encrypted } : {}), deliveredAt: status === 'DELIVERED' ? delivery.deliveredAt || new Date() : null }, select: { id: true, orderId: true, status: true, trackingCode: true, deliveryNote: true, deliveredAt: true } })
  if (status === 'DELIVERED' && delivery.status !== 'DELIVERED') await createInboxEvent({
    userId: delivery.order.userId, kind: 'PRODUCT_DELIVERED', dedupeKey: `product-delivery:${id}:delivered`,
    titleEn: 'Your product is ready', titleFa: 'محصول شما تحویل شد',
    bodyEn: `Order #${delivery.orderId} has been marked delivered. View your invoice for details.`,
    bodyFa: `سفارش شمارهٔ ${delivery.orderId} تحویل‌شده ثبت شد. جزئیات را در فاکتور ببینید.`,
    href: `/invoice/${encodeURIComponent(delivery.order.invoice.number)}`,
  }).catch(() => {})
  await auditAdmin({ req, actor: admin, action: 'product_delivery.update', targetType: 'ProductDelivery', targetId: id, metadata: { status, orderId: delivery.orderId } })
  return ok(updated)
}
