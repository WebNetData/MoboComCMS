import { latinDigits } from '@/shared/text/digits'
import { PayError, type PayFeeTerms, type PayRail, type PaySettings } from '@/modules/billing/domain/pay'

const MAX = 9_223_372_036_854_775_807n
export function text(value: unknown, max = 160): string {
  if (typeof value !== 'string') throw new PayError('متن معتبر وارد کنید')
  const clean = value.trim()
  if (!clean || clean.length > max || /[\u0000-\u001f\u007f]/.test(clean))
    throw new PayError('متن یا طول آن معتبر نیست')
  return clean
}
export function rial(value: unknown, zero = false): bigint {
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(latinDigits(value)))
    throw new PayError('مبلغ ریالی را به‌صورت عدد صحیح وارد کنید')
  const n = BigInt(latinDigits(value))
  if (n > MAX || n < (zero ? 0n : 1n)) throw new PayError('مبلغ خارج از محدوده است')
  return n
}
export function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new PayError('عدد تنظیمات معتبر نیست')
  return value
}
export function httpsUrl(value: unknown): string {
  const raw = text(value, 1000)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new PayError('نشانی HTTPS معتبر وارد کنید')
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    !url.hostname.includes('.') ||
    url.hostname.endsWith('.local') ||
    url.hostname === 'localhost' ||
    /^[\d.:\[\]]+$/.test(url.hostname)
  )
    throw new PayError('نشانی عمومی HTTPS لازم است')
  // These are links only. There is deliberately no outbound fetch to user-supplied URLs.
  return url.href
}
export function idempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(value))
    throw new PayError('Idempotency-Key معتبر لازم است')
  return value
}
export function reference(value: unknown): string {
  const raw = latinDigits(text(value, 64))
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(raw)) throw new PayError('شمارهٔ پیگیری معتبر وارد کنید')
  return raw
}
const RAILS = [
  { id: 'IRR_BANK', asset: 'IRR', network: 'BANK', decimals: 0 },
  { id: 'TRX_TRON', asset: 'TRX', network: 'TRON', decimals: 6 },
  { id: 'USDT_TRON', asset: 'USDT', network: 'TRON', decimals: 6 },
] as const
export function defaults(): PaySettings {
  return {
    incomingEnabled: false,
    bankAccountIds: [],
    providerId: '',
    feeBps: 0,
    flatFeeRial: '0',
    feeCapRial: '0',
    minPaymentRial: '10000',
    maxPaymentRial: '1000000000',
    minSettlementRial: '100000',
    paymentMinutes: 30,
    rails: RAILS.map((row) => ({
      ...row,
      enabled: row.id === 'IRR_BANK',
      rialPerUnit: row.id === 'IRR_BANK' ? '1' : '0',
      feeRial: '0',
    })),
  }
}
export function rateRatio(value: string): { numerator: bigint; denominator: bigint } {
  if (!/^\d{1,18}(?:\.\d{1,12})?$/.test(value)) throw new PayError('نرخ تبدیل معتبر نیست')
  const [whole, fraction = ''] = value.split('.')
  return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) }
}
export function normalizePaySettings(input: unknown): PaySettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PayError('تنظیمات معتبر نیست')
  const d = defaults(),
    raw = { ...d, ...input } as Record<string, unknown>
  if (
    typeof raw.incomingEnabled !== 'boolean' ||
    !Array.isArray(raw.bankAccountIds) ||
    raw.bankAccountIds.length > 20
  )
    throw new PayError('تنظیمات دریافت معتبر نیست')
  const ids = [...new Set(raw.bankAccountIds.map((v) => integer(v, 1, 2147483647)))]
  const provider = raw.providerId === '' ? '' : text(raw.providerId, 60)
  if (provider && !/^[a-z0-9_-]+$/.test(provider)) throw new PayError('شناسهٔ سرویس بانکی معتبر نیست')
  const min = rial(raw.minPaymentRial),
    max = rial(raw.maxPaymentRial)
  if (max < min) throw new PayError('حداکثر پرداخت از حداقل کمتر است')
  if (!Array.isArray(raw.rails) || raw.rails.length !== RAILS.length)
    throw new PayError('مسیرهای تسویه معتبر نیست')
  const rails = RAILS.map((base) => {
    const row = (raw.rails as PayRail[]).find((v) => v?.id === base.id)
    if (!row || typeof row.enabled !== 'boolean' || typeof row.rialPerUnit !== 'string')
      throw new PayError('مسیر تسویه معتبر نیست')
    const rate = rateRatio(row.rialPerUnit)
    if ((row.enabled && rate.numerator <= 0n) || (base.id === 'IRR_BANK' && row.rialPerUnit !== '1'))
      throw new PayError('برای مسیر فعال نرخ مثبت لازم است')
    return {
      ...base,
      enabled: row.enabled,
      rialPerUnit: row.rialPerUnit,
      feeRial: rial(row.feeRial, true).toString(),
    }
  })
  return {
    incomingEnabled: raw.incomingEnabled,
    bankAccountIds: ids,
    providerId: provider,
    feeBps: integer(raw.feeBps, 0, 3000),
    flatFeeRial: rial(raw.flatFeeRial, true).toString(),
    feeCapRial: rial(raw.feeCapRial, true).toString(),
    minPaymentRial: min.toString(),
    maxPaymentRial: max.toString(),
    minSettlementRial: rial(raw.minSettlementRial).toString(),
    paymentMinutes: integer(raw.paymentMinutes, 5, 120),
    rails,
  }
}
export function paymentAmounts(amount: unknown, settings: PaySettings, terms?: PayFeeTerms) {
  const gross = rial(amount)
  if (gross < BigInt(settings.minPaymentRial) || gross > BigInt(settings.maxPaymentRial))
    throw new PayError('مبلغ با حدود مجاز درگاه مطابقت ندارد')
  const policy = terms || { ...settings, feeBearer: 'MERCHANT' }
  const calculated = (gross * BigInt(policy.feeBps) + 9999n) / 10000n + BigInt(policy.flatFeeRial)
  const cap = BigInt(policy.feeCapRial || '0'), fee = cap > 0n && calculated > cap ? cap : calculated
  const customer = policy.feeBearer === 'CUSTOMER'
  if (!customer && fee >= gross) throw new PayError('کارمزد از مبلغ پرداخت بیشتر است')
  const total = gross + (customer ? fee : 0n)
  if (total > MAX) throw new PayError('مبلغ نهایی خارج از محدوده است')
  return { amountMinor: gross, feeMinor: fee, netMinor: customer ? gross : gross - fee, totalMinor: total, feeBearer: customer ? 'CUSTOMER' : 'MERCHANT' }
}
export function merchantFeeTerms(settings: PaySettings, row?: { feeBearer?: string; feeBps?: number | null; flatFeeMinor?: bigint | null; feeCapMinor?: bigint | null }): PayFeeTerms {
  return { feeBearer: row?.feeBearer === 'CUSTOMER' ? 'CUSTOMER' : 'MERCHANT', feeBps: row?.feeBps ?? settings.feeBps,
    flatFeeRial: row?.flatFeeMinor?.toString() ?? settings.flatFeeRial, feeCapRial: row?.feeCapMinor?.toString() ?? settings.feeCapRial,
    inherited: row?.feeBps == null }
}
export function quoteAmounts(amount: unknown, rail: PayRail) {
  const gross = rial(amount),
    fee = BigInt(rail.feeRial),
    ratio = rateRatio(rail.rialPerUnit)
  if (!rail.enabled || ratio.numerator <= 0n || fee >= gross)
    throw new PayError('این مسیر یا مبلغ برای تسویه در دسترس نیست')
  const atoms = ((gross - fee) * 10n ** BigInt(rail.decimals) * ratio.denominator) / ratio.numerator
  if (atoms <= 0n || atoms > MAX) throw new PayError('مبلغ خروجی خارج از محدوده است')
  return { amountMinor: gross, feeMinor: fee, payoutAtoms: atoms }
}
export function formatAtoms(atoms: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals),
    fraction = (atoms % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return (atoms / scale).toString() + (fraction ? '.' + fraction : '')
}
