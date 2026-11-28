import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { isModuleEnabled } from '@/extensions/server/modules'
import { PayError } from '@/modules/billing/domain/pay'
import { paymentFeeShares } from '@/modules/billing/domain/pay-policy'
import { baleEffectiveStart, type BaleCheckout } from '@/modules/billing/domain/pay-bale-collection'
import { auditSystemStrict } from '@/platform/audit/server'
import { payTransaction } from '../context'
import { requirePayPayer } from '../payer'
import { baleCollectionContext, matchesFrozenSms } from './collection-context'
import { createBaleCollectionInTransaction } from './collection-create'
import { invoiceDueMinor } from '@/modules/billing/server/billing'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { autoTransferConfig, transferDisplayDefaults } from '@/modules/billing/domain/auto-transfer'
import { usdtEquivalent } from '@/modules/billing/domain/pay-usdt-equivalent'
import { currentCurrencyRate } from '@/modules/fx/server/fx'

export async function collectionFor(tx: Prisma.TransactionClient, id: string, req: NextRequest) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(id) || !await isModuleEnabled('mobocom-pay', tx)) throw new PayError('درخواست پرداخت پیدا نشد', 404)
  const row = await tx.payBaleCollection.findUnique({ where: { id }, include: { receipt: true, bankAccount: true, invoice: { include: { gateway: true, payCollection: { include: { merchant: true, terminal: true } } } } } })
  if (!row) throw new PayError('درخواست پرداخت پیدا نشد', 404)
  if (row.status === 'PENDING' && row.invoice.status === 'UNPAID') {
    if (!row.invoice.gateway?.active || !['MOBOCOM_PAY','CARD_TRANSFER'].includes(row.invoice.gateway.provider) || row.invoice.gatewayId !== row.gatewayId || row.invoice.currency !== row.currency || invoiceDueMinor(row.invoice) !== row.dueMinor) throw new PayError('روش یا مبلغ فاکتور تغییر کرده است', 409)
    if (row.invoice.userId !== null) {
      const user = await tx.user.findUnique({ where: { id: row.invoice.userId }, select: { status: true } })
      if (user?.status !== 'ACTIVE' || await globalAuthenticationDenied(row.invoice.userId, new Date(), tx)) throw new PayError('حساب دریافت‌کنندهٔ فاکتور در دسترس نیست', 403)
    }
  }
  if (row.invoice.payCollection) {
    await requirePayPayer(req, row.invoice.payCollection.id, tx)
    if (row.status === 'PENDING' && (!row.invoice.payCollection.merchant.baleAllowed || !row.invoice.payCollection.terminal.baleEnabled)) throw new PayError('این روش برای پایانه متوقف شده است', 409)
  }
  return row
}

export function collectionReceiptAvailability(row: Awaited<ReturnType<typeof collectionFor>>, now: Date) {
  const eligible = row.status === 'PENDING' && Boolean(row.acceptedAt) && !row.receiptId &&
    row.invoice.status === 'UNPAID' && row.activeInvoiceId === row.invoiceId
  const lateReceiptAllowed = eligible && row.invoice.payCollection?.creditCurrency === 'IRR'
  return { lateReceiptAllowed, canSubmit: eligible && (row.expiresAt > now || lateReceiptAllowed) }
}

export function baleCheckout(id: string, req: NextRequest): Promise<BaleCheckout> {
  return payTransaction(async tx => {
    const row = await collectionFor(tx, id, req), now = new Date(), start = baleEffectiveStart(row)
    const status = row.invoice.status === 'PAID' ? 'PAID' : row.status === 'PENDING' && (row.expiresAt <= now || !['UNPAID','DRAFT'].includes(row.invoice.status)) ? 'EXPIRED' : row.status as BaleCheckout['status']
    const { lateReceiptAllowed } = collectionReceiptAvailability(row, now)
    let ready = false
    if (status === 'PENDING') {
      try {
        const context = await baleCollectionContext(tx, row.gatewayId)
        ready = row.bankAccount.active && row.bankAccountId === context.bank.id && context.sms.some(source => matchesFrozenSms(row, source))
      } catch (error) {
        if (!(error instanceof PayError)) throw error
      }
    }
    const display = ready && row.invoice.gateway ? autoTransferConfig(row.invoice.gateway.config).autoDisplay : transferDisplayDefaults()
    // Omitted fields never leave the server, including after browser reload or polling.
    const bank = { bankName: display.bankName ? row.bankAccount.bankName : '', holderName: display.holderName ? row.bankAccount.holderName : '', cardNumber: display.cardNumber ? row.bankAccount.cardNumber : '', accountNumber: display.accountNumber ? row.bankAccount.accountNumber : '', iban: display.iban ? row.bankAccount.sheba : '' }
    return { id, status, invoiceNumber: row.invoice.number, principalRial: row.principalRial.toString(), adjustmentRial: row.adjustmentRial.toString(), collectedRial: row.collectedRial.toString(),
      ...(row.invoice.payCollection ? { orderRial: row.invoice.payCollection.amountMinor.toString(), ...paymentFeeShares(row.invoice.payCollection) } : {}),
      usdt: usdtEquivalent(row.collectedRial, await currentCurrencyRate('USDT', tx), now),
      validFrom: start.toISOString(), expiresAt: row.expiresAt.toISOString(), accepted: Boolean(row.acceptedAt), serverTime: now.toISOString(),
      ...(status === 'PENDING' && !ready ? { receiptOnly: true } : {}),
      ...(lateReceiptAllowed ? { lateReceiptAllowed: true } : {}),
      receipt: row.receipt ? { id: row.receipt.id, status: row.receipt.status, createdAt: row.receipt.createdAt.toISOString() } : null,
      bank: status === 'PENDING' && ready && row.acceptedAt && now >= start ? bank : null,
      returnUrl: row.invoice.payCollection ? `/pay/${row.invoice.payCollection.id}` : `/invoice/${encodeURIComponent(row.invoice.number)}`,
      payCheckoutUrl: row.invoice.payCollection ? `/pay/${row.invoice.payCollection.id}` : null, reviewReason: row.reviewReason }
  })
}
export async function changeBaleCheckout(id: string, req: NextRequest, action: unknown) {
  const chosen = await payTransaction(async tx => {
    const row = await collectionFor(tx, id, req), now = new Date()
    const context = await baleCollectionContext(tx, row.gatewayId)
    if (action === 'renew') {
      if (row.status !== 'EXPIRED' && !(row.status === 'PENDING' && row.expiresAt <= now) && !(row.status === 'REVIEW' && row.reviewReason === 'RECEIPT_REJECTED')) throw new PayError('فقط درخواست منقضی یا رسید ردشده قابل نوسازی است', 409)
      return (await createBaleCollectionInTransaction(tx, row.invoice.number, row.gatewayId)).id
    }
    if (action !== 'accept') throw new PayError('عملیات پرداخت معتبر نیست', 422)
    if (row.status !== 'PENDING' || row.expiresAt <= now || row.invoice.status !== 'UNPAID' || row.activeInvoiceId !== row.invoiceId) throw new PayError('مهلت یا وضعیت درخواست تغییر کرده است', 409)
    if (row.bankAccountId !== context.bank.id || !context.sms.some(source => matchesFrozenSms(row, source))) throw new PayError('منبع پیامک این درخواست تغییر کرده است', 409)
    if (row.acceptedAt) return row.id
    if (baleEffectiveStart({ ...row, acceptedAt: now }).getTime() + 60000 > row.expiresAt.getTime()) throw new PayError('مهلت کافی برای شروع پرداخت نمانده است؛ درخواست را پس از انقضا تازه کنید', 409)
    const claim = await tx.payBaleCollection.updateMany({ where: { id, status: 'PENDING', acceptedAt: null, activeInvoiceId: row.invoiceId }, data: { acceptedAt: now } })
    if (claim.count !== 1) throw new PayError('پذیرش کارمزد هم‌زمان تغییر کرده است', 409)
    await auditSystemStrict({ actor: context.owner, action: 'mobocom-pay.bale.accept', targetType: 'mobocom-pay', targetId: id, metadata: { adjustmentRial: row.adjustmentRial, disclosure: 'COLLECTION_SERVICE_FEE' } }, tx)
    return row.id
  })
  return baleCheckout(chosen, req)
}
