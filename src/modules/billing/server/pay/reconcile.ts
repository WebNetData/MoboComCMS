import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { isModuleEnabled } from '@/extensions/server/modules'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { legacyNumber } from '@/shared/money'
import { PayError } from '@/modules/billing/domain/pay'
import { reference, rial, text } from '@/modules/billing/domain/pay-policy'
import { payTransaction } from './context'
import { creditPayPayment } from './credit'
import { markInvoicePaid } from '@/modules/billing/server/billing'
import { paySettings, bankFeedReady } from './settings'
import { payGatewayOptions } from './gateway-options'

export async function reconcileReference(
  tx: Prisma.TransactionClient,
  bankAccountId: number,
  transferReference: string,
) {
  if (!(await isModuleEnabled('mobocom-pay', tx))) return
  if (!(await tx.bankAccount.count({ where: { id: bankAccountId, collectionUse: 'GENERAL' } }))) return
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
      totalMinor: event.amountMinor,
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
  if (!row.payerVerifiedAt) return
  if (row.invoiceId && !await tx.paymentReceipt.count({ where: { invoiceId: row.invoiceId, status: { in: ['PENDING', 'APPROVED'] } } })) return
  // Existing invoices keep their original verification path. An unstarted legacy
  // bank hint must respect the current terminal and merchant grant.
  if (!row.invoiceId && (row.requestedGatewayRef || row.terminal.gatewayPolicy || row.merchant.gatewayPolicy) &&
    !(await payGatewayOptions(row, tx)).some(method => method.provider === 'CARD_TRANSFER' && method.manual)) return
  const bound = await tx.payBankEvent.updateMany({ where: { id: event.id, status: 'UNMATCHED', paymentId: null }, data: { status: 'MATCHED', paymentId: row.id } })
  if (bound.count !== 1) throw new PayError('تراکنش بانکی قبلاً استفاده شده است', 409)
  if (row.invoiceId) {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: row.invoiceId } })
    if (invoice.gatewayId && (await tx.gateway.findUnique({ where: { id: invoice.gatewayId } }))?.provider !== 'CARD_TRANSFER') throw new PayError('روش پرداخت با رویداد بانکی مطابقت ندارد', 409)
    const paid = await markInvoicePaid({ invoiceId: invoice.id, amount: row.totalMinor.toString(), provider: 'CARD_TRANSFER', providerTxnId: event.externalId, raw: { source: 'mobocom-pay-bank', bankEventId: event.id } }, tx)
    if (!paid.ok) throw new PayError(paid.message || 'تطبیق انجام نشد', 409)
    await tx.paymentReceipt.updateMany({ where: { invoiceId: invoice.id, status: 'PENDING' }, data: { status: 'APPROVED', reviewedAt: new Date(), adminNote: 'تطبیق خودکار با شاهد بانکی معتبر' } })
  } else {
    await creditPayPayment(tx, row, { bankEventId: event.id })
    await tx.payment.create({ data: {
      userId: user.id, provider: 'MOBOCOM_PAY', providerTxnId: event.externalId, eventKey: 'mobocom-pay:collection:' + row.id,
      currency: 'IRR', amountMinor: row.totalMinor, amount: legacyNumber(row.totalMinor, 'IRR'), feeMinor: row.feeMinor, fee: legacyNumber(row.feeMinor, 'IRR'),
      status: 'CONFIRMED', confirmedAt: new Date(), raw: JSON.stringify({ event: 'merchant.payment.verified', payPaymentId: row.id, bankEventId: event.id }),
    } })
  }
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
      !(await tx.bankAccount.count({ where: { id: bankAccountId, active: true, collectionUse: 'GENERAL' } }))
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
