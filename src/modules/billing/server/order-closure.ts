import type { Invoice } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { voidOpenInvoice } from '@/modules/billing/server/billing'
import { releaseInventoryReservation } from '@/modules/catalog/server/inventory'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { canMoveTo } from '@/modules/store/domain/store'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { legacyNumber, minorToNumber, normalizeCurrency } from '@/shared/money'

// An order and its invoice close together: an unpaid order that is cancelled cannot be paid afterwards, and a refunded
// invoice does not leave its order open to be shipped. A refund with a return request goes through that request instead
// (store/server/returns.ts), which keeps what each request paid back.

type Refused = { ok: false; status: number; message: string }

/** Same lock as the returns of this order: a request opened now waits for this refund, and the other way round. */
async function lockOrder(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], orderId: number) {
  if (/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL || '')) await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
}

/**
 * Cancels an unpaid order: its invoice closes first, so a payment arriving now either got there before (nothing is
 * cancelled) or finds a void invoice. A paid order is refused: cancelling it would keep the money and tell nobody.
 */
export async function cancelUnpaidOrder(orderId: number, description: string): Promise<{ ok: true } | Refused> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true, invoice: { select: { id: true, status: true } } } })
  if (!order) return { ok: false, status: 404, message: 'سفارش پیدا نشد' }
  if (order.status === 'PAID' || order.status === 'REFUNDED' || order.invoice?.status === 'PAID') return { ok: false, status: 409, message: 'سفارش پرداخت‌شده از اینجا لغو نمی‌شود؛ از صفحهٔ سفارش یا درخواست لغو و بازپرداخت اقدام کنید' }
  if (order.invoice && ['UNPAID', 'DRAFT'].includes(order.invoice.status)) {
    if (await db.paymentReceipt.count({ where: { invoiceId: order.invoice.id, status: 'PENDING' } })) return { ok: false, status: 409, message: 'برای این سفارش رسید پرداخت در انتظار بررسی است؛ ابتدا رسید را بررسی کنید' }
    const closed = await voidOpenInvoice(order.invoice.id, description)
    if (!closed.voided) return { ok: false, status: 409, message: 'وضعیت فاکتور تغییر کرده است؛ صفحه را تازه کنید' }
  }
  await releaseInventoryReservation(orderId)
  const cancelled = await db.order.updateMany({ where: { id: orderId, status: { notIn: ['PAID', 'REFUNDED'] } }, data: { status: 'CANCELLED' } })
  if (cancelled.count !== 1) return { ok: false, status: 409, message: 'وضعیت سفارش تغییر کرده است؛ صفحه را تازه کنید' }
  return { ok: true }
}

/**
 * Records the refund of a whole paid invoice and closes its order: goods still in the warehouse go back on the shelf and
 * the delivery is cancelled, while goods already sent stay recorded as sent. An order with a return request is refused
 * here, because refunding the whole invoice on top of one would pay twice. A gateway payment is returned by staff at the
 * provider; only the wallet part moves here.
 */
export async function refundPaidInvoice(invoice: Invoice & { gateway?: { provider: string } | null }, input: { totalMinor: bigint; walletMinor: bigint; by: string; actorId: number }): Promise<{ ok: true } | Refused> {
  if (input.walletMinor > 0n && invoice.userId === null) return { ok: false, status: 409, message: 'بازپرداخت به کیف پول به حساب مشتری نیاز دارد' }
  const { orderId } = invoice
  const currency = normalizeCurrency(invoice.currency)
  const claim = await db.$transaction(async (tx) => {
    if (orderId) {
      await lockOrder(tx, orderId)
      if (await tx.returnRequest.count({ where: { orderId, status: { in: ['REQUESTED', 'APPROVED', 'REFUNDED'] } } })) return 'RETURNS'
    }
    const changed = await tx.invoice.updateMany({ where: { id: invoice.id, status: 'PAID' }, data: { status: 'REFUNDED' } })
    if (changed.count !== 1) return 'GONE'
    await tx.payment.create({ data: {
      userId: invoice.userId, orderId, invoiceId: invoice.id, gatewayId: invoice.gatewayId,
      provider: invoice.gateway?.provider || 'MANUAL', providerTxnId: invoice.providerTxnId,
      eventKey: `invoice:${invoice.id}:refund`, amount: -legacyNumber(input.totalMinor, currency), amountMinor: -input.totalMinor,
      currency, status: 'REFUNDED', raw: JSON.stringify({ source: 'admin', by: input.by }), confirmedAt: new Date(),
    } })
    return 'CLAIMED'
  })
  if (claim === 'RETURNS') return { ok: false, status: 409, message: 'این سفارش درخواست لغو یا مرجوعی دارد؛ بازپرداخت را از صفحهٔ همان درخواست انجام دهید' }
  if (claim === 'GONE') return { ok: false, status: 409, message: 'وضعیت فاکتور تغییر کرده است؛ صفحه را تازه کنید' }

  if (input.walletMinor > 0n && invoice.userId !== null) await moveWallet({ userId: invoice.userId, amount: legacyNumber(input.walletMinor, currency), currency, type: 'REFUND', description: `refund wallet portion of ${invoice.number}`, invoiceId: invoice.id, orderId, idempotencyKey: `invoice-refund-wallet:${invoice.id}` })
  if (!orderId) return { ok: true }

  // The invoice is refunded from here on: what follows closes its order, and a failure is logged rather than undoing that.
  const delivery = await db.productDelivery.findUnique({ where: { orderId }, select: { status: true } })
  if (delivery && canMoveTo(delivery.status, 'CANCELLED')) {
    await import('@/modules/store/server/orders').then((m) => m.transitionOrder({ orderId, to: 'CANCELLED', actorId: input.actorId, notify: false, restock: true, note: `بازپرداخت فاکتور ${invoice.number}` }))
      .catch((error) => logEvent('error', 'invoice.refund_order_transition_failed', { invoiceId: invoice.id, orderId, error: String(error) }))
  } else if (!delivery) {
    await releaseInventoryReservation(orderId).catch((error) => logEvent('error', 'invoice.refund_release_failed', { invoiceId: invoice.id, orderId, error: String(error) }))
  }
  await db.order.updateMany({ where: { id: orderId, status: { not: 'REFUNDED' } }, data: { status: 'REFUNDED' } })
  await import('@/modules/membership/server/membership').then((m) => m.revokeOrderMembership(orderId)).catch((error) => logEvent('error', 'invoice.refund_membership_failed', { invoiceId: invoice.id, orderId, error: String(error) }))
  await import('@/modules/marketplace/server/marketplace').then((m) => m.reverseSellerShare(orderId, input.totalMinor, `invoice:${invoice.id}`)).catch((error) => logEvent('error', 'marketplace.refund_reverse_failed', { invoiceId: invoice.id, error: String(error) }))
  await import('@/modules/store/server/marketing').then((m) => m.reverseOrderPoints(orderId, input.totalMinor, `invoice:${invoice.id}`)).catch((error) => logEvent('warn', 'store.loyalty_reverse_failed', { invoiceId: invoice.id, error: String(error) }))
  const shown = `${minorToNumber(input.totalMinor, currency).toLocaleString('fa-IR')} ${currency === 'IRT' ? 'تومان' : currency}`
  await db.orderEvent.create({ data: { orderId, status: 'REFUNDED', note: `بازپرداخت ${shown} برای فاکتور ${invoice.number} ثبت شد`, visible: true, actorId: input.actorId } })
  if (invoice.userId !== null) await createInboxEvent({
    userId: invoice.userId, kind: 'ORDER_REFUND', dedupeKey: `invoice-refund:${invoice.id}`,
    titleEn: `Refund of invoice ${invoice.number}`, titleFa: `بازپرداخت فاکتور ${invoice.number}`,
    bodyEn: 'Your order is closed and its refund is recorded.', bodyFa: `بازپرداخت ${shown} ثبت شد و سفارش شما بسته شد.`, href: `/dashboard/orders/${orderId}`,
  }).catch(() => {})
  return { ok: true }
}
