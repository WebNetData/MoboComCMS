import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { isModuleEnabled } from '@/extensions/server/modules'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { legacyNumber } from '@/shared/money'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { PayError } from '@/modules/billing/domain/pay'
import { reference, rial, text } from '@/modules/billing/domain/pay-policy'
import { payAudit, payTransaction } from './context'
import { paySettings, bankFeedReady } from './settings'

export async function reconcileReference(
  tx: Prisma.TransactionClient,
  bankAccountId: number,
  transferReference: string,
) {
  if (!(await isModuleEnabled('mobocom-pay', tx))) return
  const settings = await paySettings.read(tx)
  if (!settings.incomingEnabled || !bankFeedReady(settings.providerId)) return
  const event = await tx.payBankEvent.findUnique({
    where: { bankAccountId_transferReference: { bankAccountId, transferReference } },
  })
  // A reference supplied by a payer cannot establish which merchant owns a deposit.
  // The trusted bank adapter must attest a bank-side per-payment binding. Unbound
  // statement rows remain unmatched even if somebody guesses a reference and amount.
  if (
    !event ||
    !event.targetPaymentId ||
    event.status !== 'UNMATCHED' ||
    event.providerId !== settings.providerId
  )
    return
  const candidates = await tx.payPayment.findMany({
    where: {
      id: event.targetPaymentId,
      bankAccountId,
      transferReference,
      status: 'PENDING',
      amountMinor: event.amountMinor,
      createdAt: { lte: event.occurredAt },
      expiresAt: { gte: event.occurredAt },
    },
    take: 2,
    include: { merchant: { include: { user: true } }, terminal: true },
  })
  if (candidates.length !== 1) return
  const row = candidates[0],
    user = row.merchant.user
  if (
    !row.terminal.active ||
    row.merchant.status !== 'ACTIVE' ||
    user.status !== 'ACTIVE' ||
    (await globalAuthenticationDenied(user.id, new Date(), tx))
  )
    return
  const fenced = await tx.payMerchant.updateMany({
    where: { id: row.merchantId, status: 'ACTIVE', version: row.merchant.version },
    data: { version: { increment: 1 } },
  })
  if (fenced.count !== 1) throw new PayError('وضعیت پذیرنده تغییر کرده است', 409)
  const claimed = await tx.payPayment.updateMany({
    where: { id: row.id, status: 'PENDING', transferReference },
    data: { status: 'PAID', paidAt: new Date() },
  })
  if (claimed.count !== 1) throw new PayError('پرداخت قبلاً پردازش شده است', 409)
  const bound = await tx.payBankEvent.updateMany({
    where: { id: event.id, status: 'UNMATCHED', paymentId: null },
    data: { status: 'MATCHED', paymentId: row.id },
  })
  if (bound.count !== 1) throw new PayError('تراکنش بانکی قبلاً استفاده شده است', 409)
  const credit = await moveWallet(
    {
      userId: user.id,
      amount: row.netMinor.toString(),
      currency: 'IRR',
      type: 'PAY_CREDIT',
      funds: 'WITHDRAWABLE',
      idempotencyKey: 'pay-credit:' + row.id,
      description: 'درآمد تأییدشدهٔ موبوکام‌پی',
    },
    tx,
  )
  if (!credit.ok || !credit.txId) throw new PayError('ثبت درآمد انجام نشد', 409)
  const linked = await tx.payPayment.updateMany({
    where: { id: row.id, status: 'PAID', walletTxId: null },
    data: { walletTxId: credit.txId },
  })
  if (linked.count !== 1) throw new PayError('ثبت درآمد هم‌زمان تغییر کرده است', 409)
  // Keep the canonical Billing payment journal connected, without treating a
  // merchant collection as a Store sale or a recoverable wallet-topup invoice.
  await tx.payment.create({
    data: {
      userId: user.id,
      provider: 'MOBOCOM_PAY',
      providerTxnId: event.externalId,
      eventKey: 'mobocom-pay:collection:' + row.id,
      currency: 'IRR',
      amountMinor: row.amountMinor,
      amount: legacyNumber(row.amountMinor, 'IRR'),
      feeMinor: row.feeMinor,
      fee: legacyNumber(row.feeMinor, 'IRR'),
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      raw: JSON.stringify({
        event: 'merchant.payment.verified',
        payPaymentId: row.id,
        bankEventId: event.id,
      }),
    },
  })
  await payAudit(tx, { id: user.id, email: user.email }, 'payment.verified', row.id, {
    bankEventId: event.id,
    amountRial: row.amountMinor,
    feeRial: row.feeMinor,
    walletTxId: credit.txId,
  })
  await createInboxEvent(
    {
      userId: user.id,
      kind: 'MOBOCOM_PAY',
      dedupeKey: 'pay-paid:' + row.id,
      titleFa: 'پرداخت مشتری تأیید شد',
      titleEn: 'Payment verified',
      bodyFa: 'درآمد خالص در کیف پول ثبت شد.',
      href: '/dashboard/pay',
      channels: [],
    },
    tx,
  )
}
/** Called only after the HTTP adapter authenticates the bank bridge's exact body. */
export async function acceptBankEvent(input: Record<string, unknown>, payloadHash: string) {
  const providerId = text(input.providerId, 60),
    externalId = text(input.externalId, 100),
    transferReference = reference(input.transferReference),
    amountMinor = rial(input.amountRial)
  const bankAccountId = Number(input.bankAccountId),
    occurredAt = new Date(String(input.occurredAt || ''))
  const targetPaymentId = input.targetPaymentId == null ? null : text(input.targetPaymentId, 60)
  if (
    !Number.isSafeInteger(bankAccountId) ||
    bankAccountId < 1 ||
    !Number.isFinite(occurredAt.getTime()) ||
    occurredAt > new Date(Date.now() + 60000)
  )
    throw new PayError('دادهٔ تراکنش بانکی معتبر نیست')
  return payTransaction(async (tx) => {
    if (!(await isModuleEnabled('mobocom-pay', tx))) throw new PayError('درگاه غیرفعال است', 404)
    const settings = await paySettings.read(tx)
    if (providerId !== settings.providerId || !bankFeedReady(providerId))
      throw new PayError('سرویس بانکی معتبر نیست', 403)
    const previous = await tx.payBankEvent.findUnique({
      where: { providerId_externalId: { providerId, externalId } },
    })
    if (previous) {
      if (previous.payloadHash !== payloadHash)
        throw new PayError('شناسهٔ بانکی با دادهٔ دیگری تکرار شده است', 409)
      await reconcileReference(tx, previous.bankAccountId, previous.transferReference)
      return tx.payBankEvent.findUniqueOrThrow({ where: { id: previous.id } })
    }
    if (
      !settings.bankAccountIds.includes(bankAccountId) ||
      !(await tx.bankAccount.count({ where: { id: bankAccountId, active: true } }))
    )
      throw new PayError('حساب بانکی معتبر نیست', 409)
    if (await tx.payBankEvent.count({ where: { bankAccountId, transferReference } }))
      throw new PayError('مرجع بانکی قبلاً ثبت شده است', 409)
    if (targetPaymentId && !(await tx.payPayment.count({ where: { id: targetPaymentId, bankAccountId } })))
      throw new PayError('اتصال تراکنش به پرداخت معتبر نیست', 409)
    const row = await tx.payBankEvent.create({
      data: {
        id: randomUUID(),
        providerId,
        externalId,
        bankAccountId,
        amountMinor,
        transferReference,
        occurredAt,
        payloadHash,
        targetPaymentId,
      },
    })
    await reconcileReference(tx, bankAccountId, transferReference)
    return tx.payBankEvent.findUniqueOrThrow({ where: { id: row.id } })
  })
}
