import { createHash } from 'node:crypto'
import type { PayPayment, Prisma } from '@prisma/client'
import { minorToDecimal } from '@/shared/money'
import { currentCurrencyRate } from '@/modules/fx/server/fx'
import { PayError, type PayCreditCurrency, type PayPurchase } from '@/modules/billing/domain/pay'
import { acquisitionAmounts } from '@/modules/billing/domain/pay-assets'
import { formatAtoms, rateRatio } from '@/modules/billing/domain/pay-policy'

export async function usdtRate(tx: Prisma.TransactionClient, maxAgeMinutes: number, now = new Date()) {
  const row = await currentCurrencyRate('USDT', tx)
  if (!row || !row.fetchedAt || !Number.isFinite(row.rate) || row.rate <= 0) return { status: 'UNAVAILABLE' as const, rateRial: '0', at: null, source: '' }
  try {
    const r = rateRatio(String(row.rate)), rateRial = formatAtoms(r.numerator * 10n, r.denominator.toString().length - 1)
    const age = now.getTime() - row.fetchedAt.getTime()
    return { status: age < -300000 || age > maxAgeMinutes * 60000 ? 'STALE' as const : 'CURRENT' as const, rateRial, at: row.fetchedAt, source: row.source }
  } catch { return { status: 'UNAVAILABLE' as const, rateRial: '0', at: null, source: '' } }
}

export async function acquisitionSnapshot(tx: Prisma.TransactionClient, input: { id: string; merchantId: string; name: string; currency: string; netMinor: bigint; totalMinor: bigint; expiresAt: Date; maxAgeMinutes: number }) {
  if (input.currency !== 'USDT') return { creditCurrency: 'IRR', creditMinor: input.netMinor }
  const r = await usdtRate(tx, input.maxAgeMinutes)
  if (r.status !== 'CURRENT' || !r.at) throw new PayError('نرخ تأییدشدهٔ تتر موجود یا به‌روز نیست؛ با پذیرنده تماس بگیرید', 503, 'PAY_FX_UNAVAILABLE')
  const amounts = acquisitionAmounts(input.netMinor, r.rateRial)
  const terms = { version: 'MERCHANT_USDT_V1', paymentId: input.id, merchantId: input.merchantId, name: input.name, creditMinor: amounts.creditMinor.toString(), rateRial: r.rateRial, rateAt: r.at.toISOString(), totalRial: input.totalMinor.toString(), roundingRial: amounts.creditRoundingRial.toString(), expiresAt: input.expiresAt.toISOString() }
  return { creditCurrency: 'USDT', ...amounts, creditRateRial: r.rateRial, creditRateAt: r.at, creditRateSource: r.source, purchaseRecipientName: input.name, purchaseTermsHash: createHash('sha256').update(JSON.stringify(terms)).digest('hex') }
}

export function purchaseView(row: PayPayment, verified: boolean): PayPurchase | undefined {
  if (row.creditCurrency !== 'USDT') return undefined
  return { currency: 'USDT', amount: minorToDecimal(row.creditMinor, 'USDT'), convertedRial: (row.netMinor - row.creditRoundingRial).toString(), rateRial: row.creditRateRial, rateAt: row.creditRateAt!.toISOString(), roundingRial: row.creditRoundingRial.toString(), beneficiaryName: row.purchaseRecipientName, termsHash: row.purchaseTermsHash, disclosure: 'MERCHANT_USDT_V1', accepted: verified && Boolean(row.purchaseAcceptedAt && row.purchaseAcceptedHash === row.purchaseTermsHash) }
}

/** Called only after canonical requirePayPayer, before instructions/provider initiation. */
export async function acceptPurchase(tx: Prisma.TransactionClient, row: PayPayment, input: Record<string, unknown>) {
  if (row.creditCurrency !== 'USDT') return
  if (row.purchaseAcceptedAt && row.purchaseAcceptedHash === row.purchaseTermsHash) return
  if (input.acceptPurchase !== true || input.purchaseTermsHash !== row.purchaseTermsHash || !row.payerVerifiedAt || !row.payerSessionHash) throw new PayError('خرید تتر برای اعتبار حساب پذیرنده و شرایط آن را تأیید کنید', 422, 'PAY_PURCHASE_CONSENT')
  const now = new Date()
  const changed = await tx.payPayment.updateMany({ where: { id: row.id, status: 'PENDING', expiresAt: { gt: now }, purchaseAcceptedAt: null, payerSessionHash: row.payerSessionHash }, data: { purchaseAcceptedAt: now, purchaseAcceptedHash: row.purchaseTermsHash, purchasePayerHash: row.payerSessionHash } })
  if (changed.count !== 1) throw new PayError('شرایط خرید هم‌زمان تغییر کرده است؛ صفحه را تازه کنید', 409)
}

export const creditCurrency = (value: string): PayCreditCurrency => value === 'USDT' ? 'USDT' : 'IRR'
