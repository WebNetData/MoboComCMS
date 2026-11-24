import { PayError, type PayCreditCurrency, type PayRail } from './pay'
import { formatAtoms, parseAtoms, rateRatio, settlementFees } from './pay-policy'

const MAX = 9223372036854775807n
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d
type Ratio = { n: bigint; d: bigint }
const rate = (s: string): Ratio => { const r = rateRatio(s); if (r.numerator <= 0n) throw new PayError('نرخ تبدیل مثبت لازم است', 503); return { n: r.numerator, d: r.denominator } }
const floor = ({ n, d }: Ratio) => n / d
function bounded(n: bigint) { if (n <= 0n || n > MAX) throw new PayError('مبلغ خارج از محدوده است'); return n }

/** Canonical Wallet USDT is two-decimal. No reinterpretation of historical money. */
export function acquisitionAmounts(netRial: bigint, rateRial: string) {
  const r = rate(rateRial), creditMinor = bounded(netRial * 100n * r.d / r.n)
  const costRial = ceil(creditMinor * r.n, 100n * r.d)
  return { creditMinor, creditRoundingRial: netRial - costRial }
}

/** Payout quote precision (USDT6) is distinct from Wallet precision and chain atoms. */
export function assetSettlementAmounts(sourceMinor: bigint, sourceCurrency: PayCreditCurrency, rail: PayRail, usdtRateRial: string) {
  bounded(sourceMinor)
  if (!rail.enabled) throw new PayError('این مسیر تسویه غیرفعال است', 409)
  const u = usdtRateRial === '0' ? null : rate(usdtRateRial)
  if (sourceCurrency === 'USDT' && !u) throw new PayError('نرخ تتر در دسترس نیست', 503)
  const value: Ratio = sourceCurrency === 'IRR' ? { n: sourceMinor, d: 1n } : { n: sourceMinor * u!.n, d: 100n * u!.d }
  const f = settlementFees(rail), feeDecimals = f.currency === 'IRR' ? 0 : 6
  if (f.currency === 'USDT' && !u) throw new PayError('نرخ کارمزد تتر در دسترس نیست', 503)
  const feeBasis: Ratio = f.currency === 'IRR' ? value : { n: value.n * u!.d * 1000000n, d: value.d * u!.n }
  let feeAtoms = ceil(feeBasis.n * BigInt(f.bps), feeBasis.d * 10000n) + parseAtoms(f.flat, feeDecimals)
  const cap = parseAtoms(f.cap, feeDecimals)
  if (cap > 0n && feeAtoms > cap) feeAtoms = cap
  const fee: Ratio = f.currency === 'IRR' ? { n: feeAtoms, d: 1n } : { n: feeAtoms * u!.n, d: 1000000n * u!.d }
  if (fee.n * value.d >= value.n * fee.d) throw new PayError('کارمزد از مبلغ تسویه کمتر نیست')
  const net = { n: value.n * fee.d - fee.n * value.d, d: value.d * fee.d }
  const payoutRate = rail.asset === 'IRR' ? { n: 1n, d: 1n } : rail.asset === 'USDT' && sourceCurrency === 'USDT' ? u! : rate(rail.rialPerUnit)
  let payoutAtoms = bounded(net.n * payoutRate.d * 10n ** BigInt(rail.decimals) / (net.d * payoutRate.n))
  const amountMinor = bounded(floor(value)), feeMinor = ceil(fee.n, fee.d)
  if (feeMinor >= amountMinor || feeMinor > MAX) throw new PayError('مبلغ نهایی پس از کارمزد کافی نیست')
  if (rail.asset === 'IRR') payoutAtoms = amountMinor - feeMinor
  return { amountMinor, feeMinor, payoutAtoms, sourceCurrency, sourceMinor,
    sourceRateRial: sourceCurrency === 'USDT' ? usdtRateRial : '1', feeCurrency: f.currency,
    feeAmount: formatAtoms(feeAtoms, feeDecimals), feePolicySnapshot: JSON.stringify({ version: 1, ...f, usdtRateRial: usdtRateRial === '0' ? null : usdtRateRial }),
    rialPerUnit: rail.asset === 'USDT' && sourceCurrency === 'USDT' ? usdtRateRial : rail.rialPerUnit }
}
