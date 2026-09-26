/**
 * Money primitives used by all financial modules.
 *
 * Business arithmetic is performed in integer minor units (BigInt). Floating
 * point values are accepted only at legacy/input boundaries and immediately
 * converted. Currency is always explicit and normalized to ISO-like uppercase.
 */
export type CurrencyCode = string

const EXPONENTS: Readonly<Record<string, number>> = Object.freeze({
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  IRR: 0,
  IRT: 0,
  TMN: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
})

export function normalizeCurrency(value: unknown, fallback = 'USD'): CurrencyCode {
  const code = String(value || fallback).trim().toUpperCase()
  if (!/^[A-Z0-9]{3,12}$/.test(code)) throw new Error(`invalid currency: ${code}`)
  return code
}

export function currencyExponent(currency: CurrencyCode): number {
  return EXPONENTS[normalizeCurrency(currency)] ?? 2
}

export function currencyScale(currency: CurrencyCode): bigint {
  return 10n ** BigInt(currencyExponent(currency))
}

/** Parse a decimal-like input exactly into minor units without float arithmetic. */
export function toMinor(value: string | number | bigint, currency: CurrencyCode): bigint {
  if (typeof value === 'bigint') return value
  const exp = currencyExponent(currency)
  const raw = typeof value === 'number' ? numberToDecimal(value) : String(value).trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) throw new Error('invalid money amount')
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [whole, fraction = ''] = unsigned.split('.')
  const padded = (fraction + '0'.repeat(exp)).slice(0, exp)
  // Reject precision loss rather than silently rounding user/payment input.
  if (fraction.length > exp && /[1-9]/.test(fraction.slice(exp))) {
    throw new Error(`amount has more than ${exp} decimal places for ${normalizeCurrency(currency)}`)
  }
  const minor = BigInt(whole) * currencyScale(currency) + BigInt(padded || '0')
  return negative ? -minor : minor
}

function numberToDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error('invalid money amount')
  // Avoid scientific notation at the legacy boundary.
  const text = value.toString()
  if (!/[eE]/.test(text)) return text
  return value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '')
}

export function minorToNumber(minor: bigint | number | string, currency: CurrencyCode): number {
  const value = typeof minor === 'bigint' ? minor : BigInt(minor)
  return Number(value) / Number(currencyScale(currency))
}

export function minorToDecimal(minor: bigint | number | string, currency: CurrencyCode): string {
  const value = typeof minor === 'bigint' ? minor : BigInt(minor)
  const negative = value < 0n
  const abs = negative ? -value : value
  const exp = currencyExponent(currency)
  if (exp === 0) return `${negative ? '-' : ''}${abs}`
  const scale = currencyScale(currency)
  const whole = abs / scale
  const fraction = String(abs % scale).padStart(exp, '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

// Iranian currencies read "۱۲٬۵۰۰٬۰۰۰ ریال" / "۱٬۲۵۰ تومان" (kept in sync with format.ts).
const IRANIAN_UNITS: Readonly<Record<string, readonly [string, string]>> = Object.freeze({ IRR: ['ریال', 'IRR'], IRT: ['تومان', 'Toman'], TMN: ['تومان', 'Toman'] })

function iranianUnit(currency: CurrencyCode, locale: string) {
  const unit = IRANIAN_UNITS[currency]
  return unit ? unit[locale.startsWith('fa') ? 0 : 1] : ''
}

export function formatMoney(
  minor: bigint | number | string,
  currency: CurrencyCode,
  locale = 'en-US'
): string {
  const code = normalizeCurrency(currency)
  const exponent = currencyExponent(code)
  const amount = minorToNumber(minor, code)
  const unit = iranianUnit(code, locale)
  if (unit) return `${(typeof minor === 'bigint' ? minor : BigInt(minor)).toLocaleString(locale)} ${unit}`
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(amount)
  } catch {
    return `${minorToDecimal(minor, code)} ${code}`
  }
}

export function assertSameCurrency(a: CurrencyCode, b: CurrencyCode) {
  const left = normalizeCurrency(a)
  const right = normalizeCurrency(b)
  if (left !== right) throw new Error(`currency mismatch: ${left} != ${right}`)
  return left
}

export function bpsAmount(amountMinor: bigint, basisPoints: number): bigint {
  if (!Number.isInteger(basisPoints)) throw new Error('basisPoints must be an integer')
  return (amountMinor * BigInt(basisPoints)) / 10_000n
}

export function legacyNumber(minor: bigint, currency: CurrencyCode): number {
  return minorToNumber(minor, currency)
}
