import type { Prisma } from '@prisma/client'
import type { PayAssetBalance, PayCreditCurrency } from '@/modules/billing/domain/pay'
import { minorToDecimal } from '@/shared/money'
import { rateRatio } from '@/modules/billing/domain/pay-policy'
import { usdtRate } from './assets'

export async function assetBalances(tx: Prisma.TransactionClient, userId: number, merchantId: string, maxAgeMinutes: number): Promise<PayAssetBalance[]> {
  const [accounts, reserved, rate] = await Promise.all([
    tx.walletAccount.findMany({ where: { userId, currency: { in: ['IRR','USDT'] } } }),
    tx.paySettlement.groupBy({ by: ['sourceCurrency'], where: { merchantId, status: { in: ['REQUESTED','APPROVED'] } }, _sum: { sourceMinor: true } }),
    usdtRate(tx, maxAgeMinutes),
  ])
  return (['IRR','USDT'] as PayCreditCurrency[]).map(currency => {
    const available = accounts.find(x => x.currency === currency)?.withdrawableMinor || 0n
    let equivalentRial: string | null = currency === 'IRR' ? available.toString() : null
    if (currency === 'USDT' && rate.status === 'CURRENT') { const r = rateRatio(rate.rateRial); equivalentRial = (available * r.numerator / (100n * r.denominator)).toString() }
    return { currency, availableAmount: minorToDecimal(available, currency), availableMinor: available.toString(), reservedAmount: minorToDecimal(reserved.find(x => x.sourceCurrency === currency)?._sum.sourceMinor || 0n, currency), equivalentRial, rateAt: rate.at?.toISOString() || null, rateStatus: currency === 'IRR' ? 'CURRENT' : rate.status }
  })
}
