/** Presentation only. This conversion never authorizes a transfer or changes invoice money. */
export type UsdtEquivalent = {
  asset: 'USDT'; network: 'BSC'; standard: 'BEP20'; displayOnly: true
  status: 'AVAILABLE' | 'STALE' | 'UNAVAILABLE'; amount: string | null
  lessThan: boolean; rateToman: string | null; asOf: string | null; manual: boolean
}
export function usdtEquivalent(amountRial: bigint, rate: { rate: number; fetchedAt: Date | null; source: string; locked: boolean } | null, now = new Date()): UsdtEquivalent {
  const base: UsdtEquivalent = { asset: 'USDT', network: 'BSC', standard: 'BEP20', displayOnly: true, status: 'UNAVAILABLE', amount: null, lessThan: false, rateToman: null, asOf: null, manual: false }
  if (!rate || !rate.fetchedAt || !Number.isFinite(rate.rate) || rate.rate <= 0 || amountRial <= 0n || !Number.isFinite(rate.fetchedAt.getTime()) || rate.fetchedAt.getTime() > now.getTime() + 60000) return base
  // CurrencyRate's existing contract is Toman per unit. Keep all subsequent arithmetic exact.
  const raw = rate.rate.toString()
  if (!/^\d{1,18}(?:\.\d{1,12})?$/.test(raw)) return base
  const manual = rate.locked || rate.source.toUpperCase() === 'MANUAL', asOf = rate.fetchedAt.toISOString()
  if (!manual && now.getTime() - rate.fetchedAt.getTime() > 86400000) return { ...base, status: 'STALE', asOf }
  const [whole, fraction = ''] = raw.split('.'), numerator = BigInt(whole + fraction), denominator = 10n ** BigInt(fraction.length)
  if (!numerator) return base
  const divisor = numerator * 10n, scaled = amountRial * denominator * 10000n
  const rounded = (scaled + divisor / 2n) / divisor
  const shown = rounded || 1n, decimals = (shown % 10000n).toString().padStart(4, '0')
  return { ...base, status: 'AVAILABLE', amount: `${shown / 10000n}.${decimals}`, lessThan: rounded === 0n, rateToman: raw, asOf, manual }
}
