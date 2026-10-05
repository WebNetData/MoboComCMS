import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { markInvoicePaid } from '@/modules/billing/server/billing'

/** How far back, in orders, the sweep looks. A range of ids keeps it on the primary key. */
const RECENT_ORDERS = 5000

/**
 * Scheduled step: wallet renewals that stopped part-way and that the customer did not retry.
 * A renewal creates its order and invoice, charges the wallet, settles the invoice and queues
 * the renewal. Among the most recent orders it looks at renewal orders still pending after ten
 * minutes:
 *  - the wallet was charged: the invoice is settled, and the existing fulfillment recovery
 *    queues the renewal for the paid order;
 *  - the wallet was not charged: the attempt is closed as failed, so it is not left open and a
 *    retry with the same key is told to start again.
 * One order that fails is logged and does not stop the others.
 */
export async function recoverPendingRenewals(now = new Date()) {
  const counters = { checked: 0, settled: 0, closed: 0, failed: 0 }
  const newest = await db.order.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
  if (!newest) return counters
  const orders = await db.order.findMany({
    where: { id: { gt: newest.id - RECENT_ORDERS }, status: 'PENDING', provider: 'wallet', idempotencyKey: { startsWith: 'renew:' }, createdAt: { lte: new Date(now.getTime() - 10 * 60_000) } },
    orderBy: { id: 'asc' }, take: 100, select: { id: true, idempotencyKey: true, invoice: { select: { id: true, status: true } } },
  })
  for (const order of orders) {
    counters.checked++
    try {
      // The three keys of one attempt share their tail: renew:<sub>:<key>, renew-wallet:<sub>:<key>, renew-invoice:<sub>:<key>.
      const tail = String(order.idempotencyKey).slice('renew:'.length)
      const charge = await db.walletTx.findUnique({ where: { idempotencyKey: `renew-wallet:${tail}` }, select: { status: true } })
      if (charge?.status === 'DONE') {
        const invoice = order.invoice || await db.invoice.findUnique({ where: { idempotencyKey: `renew-invoice:${tail}` }, select: { id: true, status: true } })
        if (!invoice) throw new Error('charged renewal has no invoice')
        const settled = await markInvoicePaid({ invoiceId: invoice.id, amount: 0, provider: 'WALLET', raw: { source: 'renewal-recovery' } })
        if (!settled.ok) throw new Error(settled.message || 'invoice settlement failed')
        counters.settled++
      } else {
        const closed = await db.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } })
        if (order.invoice) await db.invoice.updateMany({ where: { id: order.invoice.id, status: { in: ['UNPAID', 'DRAFT'] } }, data: { status: 'VOID', walletApplied: 0, walletAppliedMinor: 0n } })
        counters.closed += closed.count
      }
    } catch (error) {
      counters.failed++
      logEvent('error', 'subscription.renewal_recovery_failed', { orderId: order.id, error: String(error) })
    }
  }
  return counters
}
