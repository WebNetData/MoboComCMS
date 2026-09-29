import { currencyScale } from '@/shared/money'

/**
 * Foreign-currency pricing. The shop sells in Toman/Rial, but some goods are
 * bought in dollars or euros (premium accounts, imported hardware). Such a
 * product keeps its foreign cost; its selling price is
 *
 *   cost × rate(cost currency → Toman) × (1 + markup%) + fixed markup
 *
 * rounded up to a friendly step, and follows the market rate automatically.
 * Rates are "Toman per one unit" of each currency.
 */

export const FX_CURRENCIES = [
  { code: 'USD', name: 'دلار آمریکا', symbol: '$' },
  { code: 'EUR', name: 'یورو', symbol: '€' },
  { code: 'GBP', name: 'پوند انگلیس', symbol: '£' },
  { code: 'AED', name: 'درهم امارات', symbol: 'د.إ' },
  { code: 'TRY', name: 'لیر ترکیه', symbol: '₺' },
  { code: 'CNY', name: 'یوان چین', symbol: '¥' },
  { code: 'CAD', name: 'دلار کانادا', symbol: 'C$' },
  { code: 'AUD', name: 'دلار استرالیا', symbol: 'A$' },
  { code: 'CHF', name: 'فرانک سوئیس', symbol: 'Fr' },
  { code: 'RUB', name: 'روبل روسیه', symbol: '₽' },
  { code: 'USDT', name: 'تتر (USDT)', symbol: '₮' },
] as const

export const FX_CODES: readonly string[] = FX_CURRENCIES.map((row) => row.code)
export const fxName = (code: string) => FX_CURRENCIES.find((row) => row.code === code)?.name || code

/** Iranian selling currencies are fixed against the Toman. */
const LOCAL_RATES: Record<string, number> = { IRT: 1, TMN: 1, IRR: 0.1 }
export const isLocalCurrency = (code: string) => code in LOCAL_RATES

export type Rates = Record<string, number>

/** Toman per unit of `code`, or null when the rate is unknown. */
export function tomanRate(code: string, rates: Rates): number | null {
  if (code in LOCAL_RATES) return LOCAL_RATES[code]
  const rate = rates[code]
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

export interface FxPricing {
  /** Foreign cost in minor units of `baseCurrency` (cents for USD). */
  baseMinor: bigint
  baseCurrency: string
  /** Currency the shop sells in (usually IRT). */
  sellCurrency: string
  /** Markup in basis points (1250 = 12.5%). */
  markupBps: number
  /** Fixed amount added after the percentage, in minor units of `sellCurrency`. */
  fixedMinor: bigint
  /** Round the result up to this many minor units of `sellCurrency` (0/1 = none). */
  roundTo: number
}

export class FxError extends Error {}

/** Selling price in minor units of `sellCurrency`. Throws when a rate is missing. */
export function fxPrice(input: FxPricing, rates: Rates): bigint {
  if (input.baseMinor <= 0n) return 0n
  const from = tomanRate(input.baseCurrency, rates)
  const to = tomanRate(input.sellCurrency, rates)
  if (!from) throw new FxError(`نرخ ${fxName(input.baseCurrency)} ثبت نشده است`)
  if (!to) throw new FxError(`نرخ ${fxName(input.sellCurrency)} ثبت نشده است`)
  const base = Number(input.baseMinor) / Number(currencyScale(input.baseCurrency))
  const converted = (base * from) / to * Number(currencyScale(input.sellCurrency))
  const marked = converted * (1 + input.markupBps / 10_000) + Number(input.fixedMinor)
  // Tiny float error must not bump an exact amount to the next step.
  let minor = BigInt(Math.ceil(marked - 1e-6))
  const step = BigInt(Math.max(1, Math.round(input.roundTo)))
  if (step > 1n && minor % step !== 0n) minor = (minor / step + 1n) * step
  return minor > 0n ? minor : 0n
}

/** The price split into its parts, for the editor preview and the audit trail. */
export function fxBreakdown(input: FxPricing, rates: Rates) {
  const conversion = fxPrice({ ...input, markupBps: 0, fixedMinor: 0n, roundTo: 1 }, rates)
  const withMarkup = fxPrice({ ...input, fixedMinor: 0n, roundTo: 1 }, rates)
  const total = fxPrice(input, rates)
  return { conversion, markup: withMarkup - conversion, fixed: input.fixedMinor, rounding: total - withMarkup - input.fixedMinor, total, rate: tomanRate(input.baseCurrency, rates) || 0 }
}

/** "12.5" → 1250 basis points (0–1000%). */
export function percentToBps(value: unknown): number {
  const raw = String(value ?? '').trim().replace(/[٫,]/g, '.')
  if (raw === '') return 0
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(raw)) throw new FxError('درصد سود معتبر نیست')
  const bps = Math.round(Number(raw) * 100)
  if (bps > 100_000) throw new FxError('درصد سود حداکثر ۱۰۰۰٪ است')
  return bps
}

export const bpsToPercent = (bps: number) => (bps / 100).toString()

// ------------------------------------------------------------------ rate providers

export type FxProvider = 'navasan' | 'brsapi' | 'custom' | 'manual'

export interface FxConfig {
  provider: FxProvider
  apiKey: string
  customUrl: string
  /** Per-currency JSON path in the custom response, e.g. {"USD": "data.usd.sell"}. */
  customMap: Record<string, string>
  customUnit: 'IRT' | 'IRR'
  /** Fill the currencies the Iranian source lacks from USD cross rates (open.er-api.com). */
  crossRates: boolean
  intervalMinutes: number
  /** A jump bigger than this waits for the admin's approval (0 = never hold). */
  maxJumpPercent: number
  /** Round prices up to this many Toman. */
  roundToman: number
  /** Currencies that are fetched and shown. */
  currencies: string[]
  /** Keep the gateways' USD→Toman setting (usdRateToman) equal to the live rate. */
  syncGatewayRate: boolean
}

export const DEFAULT_FX: FxConfig = {
  provider: 'manual', apiKey: '', customUrl: '', customMap: {}, customUnit: 'IRT', crossRates: true,
  intervalMinutes: 60, maxJumpPercent: 15, roundToman: 1000, currencies: ['USD', 'EUR', 'AED', 'USDT'], syncGatewayRate: true,
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function normalizeFxConfig(input: Record<string, unknown> | undefined, previous: FxConfig = DEFAULT_FX): FxConfig {
  const b = input || {}
  const provider = ['navasan', 'brsapi', 'custom', 'manual'].includes(String(b.provider)) ? b.provider as FxProvider : previous.provider
  const customUrl = b.customUrl === undefined ? previous.customUrl : String(b.customUrl || '').trim()
  if (customUrl && !/^https?:\/\/[^\s]+$/i.test(customUrl)) throw new FxError('نشانی API سفارشی معتبر نیست')
  const mapInput = b.customMap === undefined ? previous.customMap : b.customMap
  const customMap: Record<string, string> = {}
  if (mapInput && typeof mapInput === 'object') {
    for (const [code, path] of Object.entries(mapInput as Record<string, unknown>)) {
      const clean = String(path || '').trim()
      if (FX_CODES.includes(code) && clean) {
        if (!/^[\w.\[\]-]{1,200}$/.test(clean)) throw new FxError(`مسیر JSON برای ${code} معتبر نیست`)
        customMap[code] = clean
      }
    }
  }
  const currencies = Array.isArray(b.currencies) ? b.currencies.map(String).filter((code) => FX_CODES.includes(code)) : previous.currencies
  return {
    provider,
    apiKey: b.apiKey === undefined ? previous.apiKey : String(b.apiKey || '').trim().slice(0, 300),
    customUrl, customMap,
    customUnit: b.customUnit === 'IRR' ? 'IRR' : b.customUnit === 'IRT' ? 'IRT' : previous.customUnit,
    crossRates: b.crossRates === undefined ? previous.crossRates : !!b.crossRates,
    intervalMinutes: b.intervalMinutes === undefined ? previous.intervalMinutes : clampInt(b.intervalMinutes, 5, 1440, 60),
    maxJumpPercent: b.maxJumpPercent === undefined ? previous.maxJumpPercent : clampInt(b.maxJumpPercent, 0, 500, 15),
    roundToman: b.roundToman === undefined ? previous.roundToman : clampInt(b.roundToman, 1, 1_000_000, 1000),
    currencies: [...new Set(currencies.length ? currencies : ['USD'])],
    syncGatewayRate: b.syncGatewayRate === undefined ? previous.syncGatewayRate : !!b.syncGatewayRate,
  }
}

/** Reads "۱۲۳٬۴۵۰", "123,450", 123450 or "123450.5" as a number. */
export function parseRateNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  const text = String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[,،٬\s]/g, '').replace('٫', '.')
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const n = Number(text)
  return n > 0 ? n : null
}

/** Value at a dotted path ("data.usd.sell", "items[0].price"). */
export function jsonPath(source: unknown, path: string): unknown {
  let current: unknown = source
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

const NAVASAN_KEYS: Record<string, string[]> = {
  USD: ['usd_sell', 'usd'], EUR: ['eur_sell', 'eur'], GBP: ['gbp_sell', 'gbp'], AED: ['aed_sell', 'aed'], TRY: ['try_sell', 'try'],
  CNY: ['cny_sell', 'cny'], CAD: ['cad_sell', 'cad'], AUD: ['aud_sell', 'aud'], CHF: ['chf_sell', 'chf'], RUB: ['rub_sell', 'rub'], USDT: ['usdt'],
}

/** Toman rates from a provider's response body. Unknown or bad values are skipped. */
export function parseProviderRates(provider: FxProvider, body: unknown, config: Pick<FxConfig, 'customMap' | 'customUnit'>): Rates {
  const out: Rates = {}
  if (provider === 'navasan' && body && typeof body === 'object') {
    for (const [code, keys] of Object.entries(NAVASAN_KEYS)) {
      for (const key of keys) {
        const item = (body as Record<string, unknown>)[key]
        const value = parseRateNumber(item && typeof item === 'object' ? (item as Record<string, unknown>).value : item)
        if (value) { out[code] = value; break }
      }
    }
  }
  if (provider === 'brsapi' && body && typeof body === 'object') {
    const lists = ['currency', 'cryptocurrency'].map((key) => (body as Record<string, unknown>)[key]).filter(Array.isArray) as Record<string, unknown>[][]
    for (const item of lists.flat()) {
      const code = String(item.symbol || '').toUpperCase()
      const value = parseRateNumber(item.price)
      if (!FX_CODES.includes(code) || !value || out[code]) continue
      out[code] = /ریال|rial/i.test(String(item.unit || '')) ? value / 10 : value
    }
  }
  if (provider === 'custom') {
    for (const [code, path] of Object.entries(config.customMap)) {
      const value = parseRateNumber(jsonPath(body, path))
      if (value) out[code] = config.customUnit === 'IRR' ? value / 10 : value
    }
  }
  return out
}

/**
 * Fills missing currencies from the USD rate and world cross rates
 * ({EUR: 0.92} = one dollar buys 0.92 euro). USDT follows the dollar.
 */
export function fillCrossRates(rates: Rates, perUsd: Record<string, unknown>, wanted: string[]): Rates {
  const usd = rates.USD
  if (!usd) return rates
  const out = { ...rates }
  for (const code of wanted) {
    if (out[code]) continue
    if (code === 'USDT') { out[code] = usd; continue }
    const perDollar = Number(perUsd[code])
    if (Number.isFinite(perDollar) && perDollar > 0) out[code] = usd / perDollar
  }
  return out
}

/** Percent change from `previous` to `next` (absolute). */
export const jumpPercent = (previous: number, next: number) => (previous > 0 ? Math.abs(next - previous) / previous * 100 : 0)

/** Rates that are applied now, and the ones held for approval because they moved too much. */
export function screenRates(current: Rates, incoming: Rates, maxJumpPercent: number, locked: string[] = []) {
  const apply: Rates = {}
  const hold: Rates = {}
  for (const [code, rate] of Object.entries(incoming)) {
    if (locked.includes(code)) continue
    const previous = current[code]
    // Keep a sane precision: whole Toman above 100, two decimals below.
    const clean = rate >= 100 ? Math.round(rate) : Math.round(rate * 100) / 100
    if (previous === clean) continue
    if (previous && maxJumpPercent > 0 && jumpPercent(previous, clean) > maxJumpPercent) hold[code] = clean
    else apply[code] = clean
  }
  return { apply, hold }
}

/** The proportional follow-up of a derived amount (list price, VIP price) when the price moves. */
export function scaleAlong(amount: bigint, oldPrice: bigint, newPrice: bigint): bigint {
  if (amount <= 0n || oldPrice <= 0n) return 0n
  return (amount * newPrice + oldPrice / 2n) / oldPrice
}
