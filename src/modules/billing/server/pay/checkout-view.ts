import { purchaseView } from './assets'
import { isAutomaticTransfer } from '@/modules/billing/domain/auto-transfer'
import type { NextRequest } from 'next/server'
import { PayError, type PayCheckout } from '@/modules/billing/domain/pay'
import { isModuleEnabled } from '@/extensions/server/modules'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { payTransaction } from './context'
import { publicPayment } from './payments'
import { paySettings } from './settings'
import { payPayerVerified } from './payer'
import { payGatewayOptions } from './checkout-gateways'

/** The public capability reveals a price summary; payment instructions require the scoped OTP ticket. */
export async function checkoutView(id: string, req?: NextRequest): Promise<PayCheckout> {
  return payTransaction(async tx => {
    if (!(await isModuleEnabled('mobocom-pay', tx))) throw new PayError('درگاه غیرفعال است', 404)
    const row = await publicPayment(tx, id), settings = await paySettings.read(tx)
 const collection = row.invoiceId ? await tx.payBaleCollection.findFirst({ where: { invoiceId: row.invoiceId }, orderBy: { createdAt: 'desc' }, select: { status: true, expiresAt: true } }) : null
 const heldReceipt = row.invoiceId ? await tx.paymentReceipt.findFirst({ where: { invoiceId: row.invoiceId, status: 'PENDING' }, select: { id: true } }) : null
 const underReview = row.status === 'PENDING' && (collection?.status === 'UNDER_REVIEW' || Boolean(heldReceipt))
 const expiresAt = collection?.status === 'PENDING' ? collection.expiresAt : row.expiresAt
 const expired = row.status === 'PENDING' && !underReview && expiresAt <= new Date()
    const user = await tx.user.findUnique({ where: { id: row.merchant.userId } })
    if (row.status !== 'PAID' && (row.merchant.status !== 'ACTIVE' || !row.terminal.active || user?.status !== 'ACTIVE' || await globalAuthenticationDenied(row.merchant.userId, new Date(), tx))) throw new PayError('دریافت این پایانه متوقف شده است', 409)
    if (row.status !== 'PAID' && !settings.incomingEnabled) throw new PayError('دریافت موقتاً متوقف است', 503)
    const verified = Boolean(req && !expired && await payPayerVerified(req, id, tx))
    const delivery = verified && row.status === 'PAID' ? await tx.payBotDelivery.findUnique({ where: { paymentId: id }, select: { status: true } }) : null
    const invoice = row.invoice, gateway = invoice?.gateway
    const automatic = Boolean(gateway && isAutomaticTransfer(gateway))
    const manual = !automatic && (row.gatewayAttemptProvider === 'CARD_TRANSFER' || row.gatewayAttemptProvider === 'MANUAL')
    const methods = verified && row.status === 'PENDING' && !underReview ? await payGatewayOptions(row, tx) : []
    const canResumeLocalStart = automatic && invoice?.status === 'UNPAID' && !invoice.providerTxnId && !invoice.paymentUrl &&
      ['STARTING', 'UNKNOWN'].includes(row.gatewayAttemptStatus) && methods.some(method => method.ref === row.gatewayAttemptRef)
    const receipt = verified && invoice ? await tx.paymentReceipt.findFirst({ where: { invoiceId: invoice.id }, orderBy: { id: 'desc' }, select: { id: true, status: true, adminNote: true, createdAt: true } }) : null
    return {
      purchase: purchaseView(row, verified),
      id, merchantName: row.merchant.name, terminalName: row.terminal.name, externalId: row.externalId,
      amountRial: row.amountMinor.toString(), totalRial: row.totalMinor.toString(), feeRial: row.feeMinor.toString(), feeBearer: row.feeBearer === 'CUSTOMER' ? 'CUSTOMER' : 'MERCHANT',
 status: underReview ? 'UNDER_REVIEW' : expired ? 'EXPIRED' : row.status as PayCheckout['status'], expiresAt: expiresAt.toISOString(), transferReference: verified ? row.transferReference : '',
      verification: { verified, phoneLast4: verified ? row.payerPhoneLast4 : '' },
      ...(delivery ? { botDelivery: { status: delivery.status } } : {}),
      returnUrl: verified && row.status === 'PAID' ? row.terminal.returnUrl : '',
      gateways: methods,
      selectedGateway: verified && invoice ? { gatewayRef: row.gatewayAttemptRef, provider: row.gatewayAttemptProvider, manual,
        status: canResumeLocalStart ? 'FAILED' : row.gatewayAttemptStatus, paymentUrl: row.status === 'PENDING' && row.gatewayAttemptStatus === 'READY' ? invoice.paymentUrl : '', instructions: gateway?.instructions || '' } : null,
      receipt: receipt ? { ...receipt, createdAt: receipt.createdAt.toISOString() } : null,
      bank: verified && row.status === 'PENDING' && manual && gateway?.provider === 'CARD_TRANSFER' && row.bankAccount?.active ? { title: row.bankAccount.bankName, bankName: row.bankAccount.bankName, holderName: row.bankAccount.holderName, cardNumber: row.bankAccount.cardNumber, iban: row.bankAccount.sheba } : null,
    }
  })
}
