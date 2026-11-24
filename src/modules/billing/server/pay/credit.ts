import type { PayPayment, Prisma } from '@prisma/client'
import { isModuleEnabled } from '@/extensions/server/modules'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { PayError } from '@/modules/billing/domain/pay'
import { payAudit } from './context'
import { queueBotDelivery } from './bot/delivery'

/** Both bank evidence and canonical gateway settlement converge on this exact-once credit. */
export async function creditPayPayment(tx: Prisma.TransactionClient, row: PayPayment, proof: Record<string, string | number>) {
  if (row.status === 'PAID') return
  if (!(await isModuleEnabled('mobocom-pay', tx))) throw new PayError('درگاه غیرفعال است', 409)
  const merchant = await tx.payMerchant.findUniqueOrThrow({ where: { id: row.merchantId }, include: { user: true } })
  const terminal = await tx.payTerminal.findUniqueOrThrow({ where: { id: row.terminalId } })
  if (!row.payerVerifiedAt || !terminal.active || merchant.status !== 'ACTIVE' || merchant.user.status !== 'ACTIVE' || await globalAuthenticationDenied(merchant.userId, new Date(), tx))
    throw new PayError('پرداخت یا پذیرنده نیاز به بررسی دارد', 409)
  const fence = await tx.payMerchant.updateMany({ where: { id: merchant.id, status: 'ACTIVE', version: merchant.version }, data: { version: { increment: 1 } } })
  if (fence.count !== 1) throw new PayError('وضعیت پذیرنده تغییر کرده است', 409)
  const claim = await tx.payPayment.updateMany({ where: { id: row.id, status: 'PENDING', walletTxId: null }, data: { status: 'PAID', paidAt: new Date() } })
  if (claim.count !== 1) throw new PayError('پرداخت قبلاً پردازش شده است', 409)
  const credit = await moveWallet({ userId: merchant.userId, amount: row.netMinor.toString(), currency: 'IRR', type: 'PAY_CREDIT', funds: 'WITHDRAWABLE', idempotencyKey: 'pay-credit:' + row.id, description: 'درآمد تأییدشدهٔ موبوکام‌پی' }, tx)
  if (!credit.ok || !credit.txId) throw new PayError('ثبت درآمد انجام نشد', 409)
  const linked = await tx.payPayment.updateMany({ where: { id: row.id, status: 'PAID', walletTxId: null }, data: { walletTxId: credit.txId } })
  if (linked.count !== 1) throw new PayError('ثبت درآمد هم‌زمان تغییر کرده است', 409)
  await queueBotDelivery(tx, row.id)
  await payAudit(tx, { id: merchant.userId, email: merchant.user.email }, 'payment.verified', row.id, { ...proof, amountRial: row.amountMinor, totalRial: row.totalMinor, feeRial: row.feeMinor, walletTxId: credit.txId })
  await createInboxEvent({ userId: merchant.userId, kind: 'MOBOCOM_PAY', dedupeKey: 'pay-paid:' + row.id, titleFa: 'پرداخت مشتری تأیید شد', titleEn: 'Payment verified', bodyFa: 'درآمد خالص در کیف پول ثبت شد.', href: '/pay/merchant/payments', channels: [] }, tx)
}

/** Called inside markInvoicePaid's transaction, after its canonical provider journal exists. */
export async function creditPayInvoice(tx: Prisma.TransactionClient, invoiceId: number) {
  const row = await tx.payPayment.findUnique({ where: { invoiceId } })
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } })
  if (!row || !invoice || invoice.kind !== 'PAY_COLLECTION' || invoice.status !== 'PAID' || invoice.userId !== null || invoice.orderId !== null || invoice.totalMinor !== row.totalMinor || invoice.paidAmountMinor !== row.totalMinor || invoice.currency !== 'IRR' || invoice.walletAppliedMinor !== 0n)
    throw new PayError('اتصال مالی پرداخت معتبر نیست', 409)
  const provider = row.gatewayAttemptProvider
  if (!provider || !await tx.payment.count({ where: { invoiceId, provider, status: 'CONFIRMED', amountMinor: row.totalMinor, currency: 'IRR' } })) throw new PayError('تأیید پرداخت در دفتر مالی وجود ندارد', 409)
  await creditPayPayment(tx, row, { invoiceId })
}
