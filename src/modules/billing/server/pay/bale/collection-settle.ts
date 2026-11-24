import type { PayBaleCollection, Prisma } from '@prisma/client'
import { markInvoicePaid, invoiceDueMinor } from '@/modules/billing/server/billing'
import { enqueueOrderFulfillment } from '@/modules/fulfillment/server/jobs'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { legacyNumber } from '@/shared/money'
import { PayError } from '@/modules/billing/domain/pay'
import { auditSystemStrict } from '@/platform/audit/server'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'

type Proof = { method: 'AUTO' | 'REVIEWED_NOTICE'; noticeId: string; actor: { id: number; email: string } } | { method: 'MANUAL'; receiptId: number; actualRial: bigint; actor: { id: number; email: string } }
/** Both staff and all automatic sources converge HERE, within the caller's Serializable transaction. */
export async function settleTransferCollection(tx: Prisma.TransactionClient, row: PayBaleCollection, proof: Proof) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: row.invoiceId }, include: { gateway: true } })
  if (invoice.status === 'PAID') return { financialApproval: row.status === 'PAID', collectionId: row.id, collectionStatus: row.status, alreadyPaid: true }
  if (!['PENDING','UNDER_REVIEW','REVIEW'].includes(row.status) || invoice.status !== 'UNPAID' || invoice.gatewayId !== row.gatewayId || !invoice.gateway?.active ||
    !['CARD_TRANSFER','MOBOCOM_PAY'].includes(invoice.gateway.provider) || invoice.currency !== row.currency || invoiceDueMinor(invoice) !== row.dueMinor) throw new PayError('وضعیت فاکتور برای تأیید تغییر کرده است', 409)
  if (invoice.userId !== null && ((await tx.user.findUnique({ where: { id: invoice.userId }, select: { status: true } }))?.status !== 'ACTIVE' || await globalAuthenticationDenied(invoice.userId, new Date(), tx))) throw new PayError('حساب فاکتور فعال نیست', 403)
  const collected = proof.method === 'MANUAL' ? proof.actualRial : row.collectedRial
  if (collected !== row.collectedRial && collected !== row.principalRial) throw new PayError('مبلغ رسید با اصل یا جمع دقیق درخواست مطابقت ندارد', 409)
  const paid = await markInvoicePaid({ invoiceId: row.invoiceId, gatewayId: row.gatewayId, provider: invoice.gateway.provider, providerTxnId: row.id, amount: row.dueMinor.toString(), feeBps: 0,
    raw: { source: 'auto-card-transfer', collectionId: row.id, method: proof.method } }, tx)
  if (!paid.ok || paid.alreadyPaid) throw new PayError('فاکتور قبلاً تسویه شده است؛ پرداخت دیگری ثبت نمی‌شود', 409)
  const principal = await tx.payment.findUniqueOrThrow({ where: { eventKey: `invoice:${invoice.id}:payment:${invoice.gateway.provider}:${row.id}` } })
  const feeAmount = collected - row.principalRial
  const fee = feeAmount > 0n ? await tx.payment.create({ data: { gatewayId: row.gatewayId, provider: 'MOBOCOM_PAY_ADJUSTMENT', providerTxnId: row.id, eventKey: 'bale-adjustment:' + row.id,
    currency: 'IRR', amountMinor: feeAmount, amount: legacyNumber(feeAmount, 'IRR'), status: 'CONFIRMED', confirmedAt: new Date(), raw: JSON.stringify({ event: 'collection.service-fee', collectionId: row.id }) } }) : null
  if (invoice.kind === 'WALLET_TOPUP' && invoice.userId !== null) {
    const pending = await tx.walletTx.findFirst({ where: { invoiceId: invoice.id, type: 'TOPUP', status: { not: 'FAILED' } }, orderBy: { id: 'desc' } })
    const credit = await moveWallet({ userId: invoice.userId, amount: invoice.totalMinor.toString(), currency: invoice.currency, type: 'TOPUP', invoiceId: invoice.id,
      description: `Wallet top-up ${invoice.number}`, txId: pending?.id ?? null, idempotencyKey: pending ? undefined : `wallet-topup-invoice:${invoice.id}` }, tx)
    if (!credit.ok) throw new PayError('شارژ کیف پول انجام نشد', 409)
  } else if (invoice.orderId) await enqueueOrderFulfillment({ orderId: invoice.orderId, invoiceId: invoice.id, planId: invoice.planId, productId: invoice.productId }, tx)
  const claimed = await tx.payBaleCollection.updateMany({ where: { id: row.id, status: row.status, principalPaymentId: null }, data: {
    status: 'PAID', activeInvoiceId: null, noticeId: proof.method === 'MANUAL' ? row.noticeId : proof.noticeId, settlementMethod: proof.method,
    principalPaymentId: principal.id, adjustmentPaymentId: fee?.id || null, paidCollectedRial: collected, paidAt: new Date(), reviewReason: '',
  } })
  if (claimed.count !== 1) throw new PayError('پرداخت هم‌زمان تأیید شده است', 409)
  await auditSystemStrict({ actor: proof.actor, action: 'mobocom-pay.transfer.paid', targetType: 'mobocom-pay', targetId: row.id, metadata: { method: proof.method, invoiceId: invoice.id, principalPaymentId: principal.id, adjustmentPaymentId: fee?.id || null, collectedRial: collected } }, tx)
  return { financialApproval: true, collectionId: row.id, collectionStatus: 'PAID', alreadyPaid: false }
}
