import { db } from '@/platform/database/prisma'
import { markInvoicePaid } from '@/modules/billing/server/billing'
import { enqueueOrderFulfillment, processFulfillmentJob } from '@/modules/fulfillment/server/jobs'
import { ensureInventoryReservation } from '@/modules/catalog/server/inventory'

export interface ManualSettlement {
  invoiceId: number
  providerTxnId?: string
  cryptoCurrency?: string
  cryptoAmount?: string
  amount?: string
  raw: Record<string, unknown>
}

/**
 * Settles an invoice confirmed by staff (admin "mark paid", an approved bank
 * receipt): reserve stock first, record the payment, then run fulfillment.
 * A fulfillment failure never undoes the payment; it is queued for retry.
 */
export async function settleInvoiceManually(input: ManualSettlement): Promise<{ ok: true; warning?: string; alreadyPaid: boolean } | { ok: false; status: number; message: string }> {
  const invoice = await db.invoice.findUnique({ where: { id: input.invoiceId }, include: { gateway: true } })
  if (!invoice) return { ok: false, status: 404, message: 'invoice not found' }
  // Reserve stock before financial settlement. If it cannot be reserved, do not mark the invoice paid.
  if (invoice.productId && invoice.orderId) {
    const held = await ensureInventoryReservation({ orderId: invoice.orderId, holdMinutes: 60 })
    if (!held.ok) return { ok: false, status: 409, message: held.message || 'out of stock' }
  }
  const res = await markInvoicePaid({
    invoiceId: invoice.id, gatewayId: invoice.gatewayId, providerTxnId: input.providerTxnId || '',
    cryptoCurrency: input.cryptoCurrency || '', cryptoAmount: input.cryptoAmount || '',
    amount: input.amount,
    feeBps: invoice.gateway?.feeBps ?? Math.round((invoice.gateway?.feePercent || 0) * 100), provider: invoice.gateway?.provider || 'MANUAL',
    raw: input.raw,
  })
  if (!res.ok) return { ok: false, status: 400, message: res.message || 'failed' }
  const job = invoice.orderId ? await enqueueOrderFulfillment({ orderId: invoice.orderId, invoiceId: invoice.id, planId: invoice.planId, productId: invoice.productId }) : null
  let warning: string | undefined
  if (job) {
    const processed = await processFulfillmentJob(job.id)
    if (!processed.ok) warning = `payment settled; fulfillment queued for retry: ${processed.message}`
  }
  return { ok: true, warning, alreadyPaid: Boolean(res.alreadyPaid) }
}
