import { latinDigits } from '@/shared/text/digits'
import { normalizeCurrency, toMinor } from '@/shared/money'

export const PRICE_MODES = ['PRICE', 'PERCENT', 'AMOUNT', 'FREE'] as const
export type PriceMode = (typeof PRICE_MODES)[number]
export type PriceAdjustment = { mode: PriceMode; value: string }
export type AudiencePrice = PriceAdjustment & { audience: string }
export const PRICE_MODE_LABEL: Record<PriceMode, string> = { PRICE: 'قیمت اختصاصی', PERCENT: 'تخفیف درصدی', AMOUNT: 'مبلغ تخفیف', FREE: 'رایگان' }

export class PriceAdjustmentError extends Error {}
export const isPriceMode = (value: unknown): value is PriceMode => PRICE_MODES.includes(value as PriceMode)
const textOf = (value: unknown) => latinDigits(value).replace(/[,،٬\s]/g, '')

/** Stored values are integer minor units, or basis points for a percentage. */
export function normalizeAdjustment(raw: unknown, currency: string): PriceAdjustment {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PriceAdjustmentError('روش قیمت‌گذاری معتبر نیست')
  const input = raw as Record<string, unknown>
  if (!isPriceMode(input.mode)) throw new PriceAdjustmentError('روش قیمت‌گذاری را انتخاب کنید')
  if (input.mode === 'FREE') return { mode: 'FREE', value: '0' }
  const text = textOf(input.value)
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new PriceAdjustmentError('مقدار قیمت یا تخفیف معتبر نیست')
  let value: bigint
  if (input.mode === 'PERCENT') {
    const [whole, fraction = ''] = text.split('.')
    value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
    if (value <= 0n || value > 10000n) throw new PriceAdjustmentError('درصد تخفیف باید بیشتر از صفر و حداکثر ۱۰۰ باشد')
  } else {
    try { value = toMinor(text, normalizeCurrency(currency)) } catch { throw new PriceAdjustmentError('مبلغ معتبر نیست') }
    if (value < 0n || value > 10_000_000_000_00n || input.mode === 'AMOUNT' && value === 0n) throw new PriceAdjustmentError('مبلغ خارج از محدوده است')
  }
  return { mode: input.mode, value: value.toString() }
}

export function readAdjustment(raw: unknown): PriceAdjustment | null {
  try {
    const row = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!row || !isPriceMode(row.mode) || !/^\d{1,14}$/.test(String(row.value))) return null
    if (row.mode === 'PERCENT' && (BigInt(row.value) > 10000n || BigInt(row.value) === 0n)) return null
    return { mode: row.mode, value: String(row.value) }
  } catch { return null }
}

export function adjustedPrice(regular: bigint, rule: PriceAdjustment): bigint {
  const value = BigInt(rule.value)
  if (rule.mode === 'FREE') return 0n
  if (rule.mode === 'PERCENT') return regular * (10000n - value) / 10000n
  if (rule.mode === 'AMOUNT') return regular > value ? regular - value : 0n
  return value < regular ? value : regular
}

export function readAudiencePrices(raw: string | null | undefined): AudiencePrice[] {
  try { const rows = JSON.parse(raw || '[]'); return Array.isArray(rows) ? rows.flatMap(row => { const rule = readAdjustment(row); return rule && /^(vip|group:[1-9]\d{0,9})$/.test(row.audience) ? [{ ...rule, audience: row.audience }] : [] }) : [] } catch { return [] }
}

export function normalizeAudiencePrices(raw: unknown, currency: string): AudiencePrice[] {
  if (!Array.isArray(raw) || raw.length > 100) throw new PriceAdjustmentError('فهرست قیمت‌های اختصاصی معتبر نیست')
  const seen = new Set<string>()
  return raw.map(row => {
    const audience = String(row?.audience || '')
    if (!/^(vip|group:[1-9]\d{0,9})$/.test(audience) || seen.has(audience)) throw new PriceAdjustmentError('مخاطب قیمت معتبر نیست یا تکرار شده است')
    seen.add(audience)
    return { ...normalizeAdjustment(row, currency), audience }
  })
}

export function adjustmentInput(rule: PriceAdjustment, currency: string) {
  const value = BigInt(rule.value)
  const decimals = rule.mode === 'PERCENT' || currency === 'USD'
  return { ...rule, value: decimals ? `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}` : value.toString() }
}
