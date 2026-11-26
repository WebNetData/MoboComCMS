import type { PayPayment, Prisma } from '@prisma/client'
import type { PayPaymentView } from '@/modules/billing/domain/pay'
import { minorToDecimal } from '@/shared/money'
import { creditCurrency } from './assets'
import { paymentConfirmation } from './confirmation'

export const paymentInvoiceFields = {
  // A reviewed older quote can win after renewal. Its persisted paidAt outranks a newer unpaid quote.
  baleCollections: { orderBy: [{ paidAt: { sort: 'desc' as const, nulls: 'last' as const } }, { createdAt: 'desc' as const }], take: 1, select: {
    adjustmentRial: true, collectedRial: true, principalRial: true, paidCollectedRial: true,
    status: true, expiresAt: true, settlementMethod: true, notice: { select: { sourceType: true } },
  } },
  receipts: { where: { status: 'PENDING' }, take: 1, select: { id: true } },
  payments: { where: { status: 'CONFIRMED' }, orderBy: { id: 'desc' as const }, take: 1, select: { raw: true } },
} satisfies Prisma.InvoiceSelect
export const collectionProjection = { select: paymentInvoiceFields }
type InvoiceProof = Prisma.InvoiceGetPayload<typeof collectionProjection>

export function paymentStatusFilter(status: 'PENDING' | 'EXPIRED' | 'UNDER_REVIEW', now: Date): Prisma.PayPaymentWhereInput {
  const held: Prisma.PayPaymentWhereInput = { invoice: { is: { OR: [
    { baleCollections: { some: { activeInvoiceId: { not: null }, status: 'UNDER_REVIEW' } } },
    { receipts: { some: { status: 'PENDING' } } },
  ] } } }
  const active: Prisma.PayPaymentWhereInput = { invoice: { is: { baleCollections: { some: { activeInvoiceId: { not: null }, status: 'PENDING', expiresAt: { gt: now } } } } } }
  const pendingCollection: Prisma.PayPaymentWhereInput = { invoice: { is: { baleCollections: { some: { activeInvoiceId: { not: null }, status: 'PENDING' } } } } }
  if (status === 'UNDER_REVIEW') return { status: 'PENDING', ...held }
  if (status === 'PENDING') return { status: 'PENDING', AND: [{ NOT: held }, { OR: [active, { AND: [{ NOT: pendingCollection }, { expiresAt: { gt: now } }] }] }] }
  return { status: 'PENDING', AND: [{ NOT: held }, { NOT: active }, { OR: [pendingCollection, { expiresAt: { lte: now } }] }] }
}

/** Exact persisted credit and actually collected fees; never credit the bank's gross. */
export function paymentView(row: PayPayment & { terminal?: { name: string }; invoice?: InvoiceProof | null; hasPendingReceipt?: boolean }): PayPaymentView {
  const collection = row.invoice?.baleCollections[0]
  const held = row.status === 'PENDING' && (collection?.status === 'UNDER_REVIEW' || (row.hasPendingReceipt ?? Boolean(row.invoice?.receipts.length)))
  const expiresAt = collection?.status === 'PENDING' ? collection.expiresAt : row.expiresAt
  const serviceFee = row.status === 'PAID' && collection?.status === 'PAID' && collection.paidCollectedRial !== null
    ? collection.paidCollectedRial - collection.principalRial : 0n
  return {
    confirmation: paymentConfirmation(row, collection, row.invoice?.payments[0]?.raw),
    settledServiceFeeRial: serviceFee.toString(),
    platformFeeRial: (row.feeMinor + row.creditRoundingRial + (row.status === 'PAID' ? serviceFee : collection?.adjustmentRial || 0n)).toString(),
    creditRial: (row.netMinor - row.creditRoundingRial).toString(),
    customerAmountRial: (row.status === 'PAID' ? collection?.paidCollectedRial ?? row.totalMinor : collection?.collectedRial ?? row.totalMinor).toString(),
    creditCurrency: creditCurrency(row.creditCurrency), creditAmount: minorToDecimal(row.creditMinor, row.creditCurrency),
    gatewayAdjustmentRial: collection?.adjustmentRial.toString() || '0',
    gatewayCollectedRial: collection?.collectedRial.toString() || row.totalMinor.toString(),
    gatewayCollectionStatus: collection?.status || '',
    id: row.id, terminalId: row.terminalId, terminalName: row.terminal?.name || '', externalId: row.externalId,
    amountRial: row.amountMinor.toString(), feeRial: row.feeMinor.toString(), netRial: row.netMinor.toString(),
    totalRial: row.totalMinor.toString(), feeBearer: row.feeBearer as PayPaymentView['feeBearer'],
    status: held ? 'UNDER_REVIEW' : row.status === 'PENDING' && expiresAt <= new Date() ? 'EXPIRED' : row.status as PayPaymentView['status'],
    transferReference: row.transferReference, createdAt: row.createdAt.toISOString(), paidAt: row.paidAt?.toISOString() || null,
    expiresAt: expiresAt.toISOString(), checkoutUrl: '/pay/' + row.id,
  }
}
