import { randomUUID } from 'node:crypto'
import { PayError } from '@/modules/billing/domain/pay'
import { formatAtoms, parseAtoms, rial, settlementFees } from '@/modules/billing/domain/pay-policy'
import { assetSettlementAmounts } from '@/modules/billing/domain/pay-assets'
import { minorToDecimal } from '@/shared/money'
import { usdtRate } from '../assets'
import { merchantFor, payContext, payTransaction, type PayActor } from '../context'

export async function createPayQuote(actor: PayActor, input: Record<string, unknown>) {
  return payTransaction(async (tx) => {
    const merchant = await merchantFor(actor, tx, true), { settings } = await payContext(actor, tx)
    const rail = settings.rails.find(item => item.id === input.railId)
    if (!rail) throw new PayError('مسیر تسویه پیدا نشد')
    if (input.sourceCurrency !== undefined && !['IRR','USDT'].includes(String(input.sourceCurrency))) throw new PayError('واحد موجودی معتبر نیست')
    const sourceCurrency = input.sourceCurrency === 'USDT' ? 'USDT' : 'IRR'
    const sourceMinor = sourceCurrency === 'IRR' ? rial(input.amountRial) : parseAtoms(input.amount, 2)
    const f = settlementFees(rail), needsRate = sourceCurrency === 'USDT' || f.currency === 'USDT'
    const current = needsRate ? await usdtRate(tx, settings.usdtRateMaxAgeMinutes) : null
    if (needsRate && current?.status !== 'CURRENT') throw new PayError('نرخ تأییدشدهٔ تتر به‌روز نیست', 503, 'PAY_FX_UNAVAILABLE')
    const amounts = assetSettlementAmounts(sourceMinor, sourceCurrency, rail, current?.rateRial || '0')
    if (amounts.amountMinor < BigInt(settings.minSettlementRial)) throw new PayError('مبلغ کمتر از حداقل تسویه است')
    const wallet = await tx.walletAccount.findUnique({ where: { userId_currency: { userId: actor.id, currency: sourceCurrency } } })
    if (!wallet || wallet.withdrawableMinor < sourceMinor) throw new PayError('درآمد قابل‌تسویه کافی نیست', 409)
    const row = await tx.paySettlementQuote.create({ data: {
      id: randomUUID(), merchantId: merchant.id, railId: rail.id, asset: rail.asset, network: rail.network,
      decimals: rail.decimals, ...amounts, rateAt: current?.at || null, expiresAt: new Date(Date.now() + 5 * 60000),
    } })
    return { id: row.id, railId: rail.id, asset: row.asset, network: row.network,
      amountRial: row.amountMinor.toString(), feeRial: row.feeMinor.toString(),
      sourceCurrency, sourceAmount: minorToDecimal(sourceMinor, sourceCurrency), feeCurrency: row.feeCurrency as 'IRR' | 'USDT', feeAmount: row.feeAmount,
      instrument: rail.instrument, payoutAmount: formatAtoms(row.payoutAtoms, row.decimals), rateRialPerUnit: row.rialPerUnit, expiresAt: row.expiresAt.toISOString() }
  })
}
