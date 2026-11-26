import { PayError } from './pay'

export type BaleCollectionStatus = 'PENDING' | 'UNDER_REVIEW' | 'PAID' | 'EXPIRED' | 'REVIEW'
export interface BaleCollectionPolicy {
  enabled: boolean
  minAdjustmentRial: string
  maxAdjustmentRial: string
  minutes: number
}
export const balePolicyDefaults = (): BaleCollectionPolicy => ({ enabled: false, minAdjustmentRial: '10', maxAdjustmentRial: '9990', minutes: 30 })
export function normalizeBalePolicy(input: unknown): BaleCollectionPolicy {
  const raw = { ...balePolicyDefaults(), ...(input && typeof input === 'object' && !Array.isArray(input) ? input : {}) }
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new PayError('تنظیمات تطبیق بانکی معتبر نیست')
  if (typeof raw.enabled !== 'boolean' || !Number.isInteger(raw.minutes) || raw.minutes < 5 || raw.minutes > 120) throw new PayError('مهلت تطبیق بانکی معتبر نیست')
  const exact = (v: unknown) => { if (typeof v !== 'string' || !/^[1-9]\d{0,5}$/.test(v)) throw new PayError('مبلغ تمایز باید عدد صحیح ریال باشد'); const n = BigInt(v); if (n < 10n || n > 99990n || n % 10n !== 0n) throw new PayError('مبلغ تمایز باید از ۱۰ تا ۹۹۹۹۰ ریال و مضرب ده باشد'); return n }
  const min = exact(raw.minAdjustmentRial), max = exact(raw.maxAdjustmentRial)
  if (max < min || (max - min) / 10n + 1n > 9999n) throw new PayError('بازهٔ مبلغ تمایز معتبر نیست')
  return { enabled: raw.enabled, minutes: raw.minutes, minAdjustmentRial: min.toString(), maxAdjustmentRial: max.toString() }
}
export function invoicePrincipalRial(dueMinor: bigint, currency: string): bigint {
  const n = currency === 'IRR' ? dueMinor : currency === 'IRT' || currency === 'TMN' ? dueMinor * 10n : 0n
  if (n <= 0n || n > 9223372036854675817n) throw new PayError('مبلغ یا واحد پول برای درگاه موبوکام معتبر نیست')
  return n
}

export function bankAmountRange(principalRial: bigint, policy: BaleCollectionPolicy) {
  const first = ((principalRial + BigInt(policy.minAdjustmentRial) + 9n) / 10n) * 10n
  const last = ((principalRial + BigInt(policy.maxAdjustmentRial)) / 10n) * 10n
  const capacity = first > last ? 0 : Number((last - first) / 10n + 1n)
  return { first, last, capacity }
}
export const nextBaleMinute = (at: Date) => new Date((Math.floor(at.getTime() / 60000) + 1) * 60000)
export function baleEffectiveStart(row: { validFrom: Date; acceptedAt: Date | null }): Date {
  return row.acceptedAt && row.acceptedAt > row.validFrom ? row.acceptedAt : row.validFrom
}
export interface BaleCheckout {
  usdt?: import('./pay-usdt-equivalent').UsdtEquivalent
  id: string
  status: BaleCollectionStatus
  invoiceNumber: string
  principalRial: string
  adjustmentRial: string
  collectedRial: string
  orderRial?: string
  customerFeeRial?: string
  merchantFeeRial?: string
  validFrom: string
  expiresAt: string
  accepted: boolean
  receiptOnly?: boolean
  serverTime: string
  receipt: { id: number; status: string; createdAt: string } | null
  bank: { bankName: string; holderName: string; cardNumber: string; accountNumber: string; iban: string } | null
  returnUrl: string
  payCheckoutUrl: string | null
  reviewReason: string
}
