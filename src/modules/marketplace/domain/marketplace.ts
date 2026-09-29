/**
 * Multi-vendor marketplace rules (Digikala-style): seller onboarding checks,
 * commission, the seller ledger and withdrawals, order line workflow and
 * seller ratings. Pure functions only — shared by server code and tests.
 */

export class MarketplaceError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'MARKETPLACE') { super(message) }
}

// ------------------------------------------------------------------ settings

export type MarketplaceSettings = {
  /** Sellers can apply from /seller. */
  signupOpen: boolean
  /** New sellers go live without review. */
  autoApproveSellers: boolean
  /** Seller products go live without review. */
  autoApproveProducts: boolean
  /** Commission in percent of the line total (after the customer's discount on the line). */
  defaultCommission: number
  /** Category id → commission percent (a category also covers its subcategories). */
  categoryCommission: Record<string, number>
  /** Days a sale stays on hold (returns window) before the seller can withdraw it. */
  holdDays: number
  /** Smallest withdrawal, in toman. */
  minPayoutToman: number
  /** Shown to applicants. */
  terms: string
}

export const DEFAULT_MARKETPLACE: MarketplaceSettings = {
  signupOpen: true, autoApproveSellers: false, autoApproveProducts: false,
  defaultCommission: 10, categoryCommission: {}, holdDays: 7, minPayoutToman: 100_000, terms: '',
}

const percent = (value: unknown, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(90, Math.max(0, Math.round(n * 10) / 10)) : fallback
}

export function normalizeMarketplaceSettings(input: unknown): MarketplaceSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const categoryCommission: Record<string, number> = {}
  if (raw.categoryCommission && typeof raw.categoryCommission === 'object') {
    for (const [key, value] of Object.entries(raw.categoryCommission as Record<string, unknown>).slice(0, 500)) {
      if (/^\d{1,9}$/.test(key) && value !== '' && value != null && Number.isFinite(Number(value))) categoryCommission[key] = percent(value, 0)
    }
  }
  return {
    signupOpen: raw.signupOpen !== false,
    autoApproveSellers: raw.autoApproveSellers === true,
    autoApproveProducts: raw.autoApproveProducts === true,
    defaultCommission: percent(raw.defaultCommission, DEFAULT_MARKETPLACE.defaultCommission),
    categoryCommission,
    holdDays: Math.min(60, Math.max(0, Math.floor(Number(raw.holdDays ?? DEFAULT_MARKETPLACE.holdDays)) || 0)),
    minPayoutToman: Math.min(1_000_000_000, Math.max(0, Math.floor(Number(raw.minPayoutToman ?? DEFAULT_MARKETPLACE.minPayoutToman)) || 0)),
    terms: String(raw.terms ?? '').slice(0, 20_000),
  }
}

// ------------------------------------------------------------------ commission

/**
 * Commission percent for a line: the seller's own rate wins, then the nearest
 * category in the chain (leaf first) with a rate, then the default.
 */
export function commissionPercent(settings: MarketplaceSettings, sellerRate: number | null | undefined, categoryChain: number[]): number {
  if (sellerRate != null && Number.isFinite(sellerRate)) return percent(sellerRate, settings.defaultCommission)
  for (const id of categoryChain) {
    const rate = settings.categoryCommission[String(id)]
    if (rate != null) return rate
  }
  return settings.defaultCommission
}

/** Commission on a line total, rounded down to whole units (never more than the total). */
export function commissionOf(totalMinor: bigint, rate: number): bigint {
  if (totalMinor <= 0n || rate <= 0) return 0n
  const cut = (totalMinor * BigInt(Math.round(rate * 10))) / 1000n
  return cut > totalMinor ? totalMinor : cut
}

// ------------------------------------------------------------------ onboarding

/** Iranian bank account number (IBAN/Sheba): IR + 24 digits, ISO 7064 mod 97. */
export function normalizeIban(input: unknown): string {
  const value = String(input ?? '').replace(/[\s-]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).toUpperCase()
  const iban = /^\d{24}$/.test(value) ? `IR${value}` : value
  if (!/^IR\d{24}$/.test(iban)) return ''
  const rearranged = `${iban.slice(4)}1827${iban.slice(2, 4)}` // I=18, R=27
  let remainder = 0
  for (const digit of rearranged) remainder = (remainder * 10 + Number(digit)) % 97
  return remainder === 1 ? iban : ''
}

/** Iranian national code (10 digits, check digit). */
export function validNationalCode(input: unknown): boolean {
  const code = String(input ?? '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false
  const check = Number(code[9])
  const sum = [...code.slice(0, 9)].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0) % 11
  return sum < 2 ? check === sum : check === 11 - sum
}

/** Company national id (شناسه ملی، 11 digits). */
export function validCompanyId(input: unknown): boolean {
  const code = String(input ?? '')
  if (!/^\d{11}$/.test(code)) return false
  const decimal = Number(code[9]) + 2
  const weights = [29, 27, 23, 19, 17]
  const sum = [...code.slice(0, 10)].reduce((total, digit, index) => total + (Number(digit) + decimal) * weights[index % 5], 0) % 11
  return (sum === 10 ? 0 : sum) === Number(code[10])
}

export const SELLER_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

export type SellerProfileInput = {
  shopName: string; slug: string; kind: 'PERSON' | 'COMPANY'; legalName: string; nationalId: string; phone: string; email: string
  city: string; address: string; about: string; logo: string; banner: string; iban: string; ibanOwner: string
}

const text = (value: unknown, max: number) => String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Seller application / profile form. `partial` accepts missing fields (profile edits). */
export function validateSellerProfile(input: Record<string, unknown>, options: { requireLegal: boolean } = { requireLegal: true }): SellerProfileInput {
  const shopName = text(input.shopName, 60)
  if (shopName.length < 2) throw new MarketplaceError('نام فروشگاه را بنویسید (حداقل ۲ حرف)')
  const slug = String(input.slug ?? '').trim().toLowerCase()
  if (!SELLER_SLUG.test(slug)) throw new MarketplaceError('نشانی فروشگاه باید ۳ تا ۴۰ حرف انگلیسی کوچک، عدد یا خط تیره باشد')
  const kind = input.kind === 'COMPANY' ? 'COMPANY' : 'PERSON'
  const legalName = text(input.legalName, 120)
  const nationalId = String(input.nationalId ?? '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '')
  if (options.requireLegal) {
    if (legalName.length < 3) throw new MarketplaceError(kind === 'COMPANY' ? 'نام ثبتی شرکت را بنویسید' : 'نام و نام خانوادگی را بنویسید')
    if (kind === 'PERSON' ? !validNationalCode(nationalId) : !validCompanyId(nationalId)) throw new MarketplaceError(kind === 'COMPANY' ? 'شناسهٔ ملی شرکت معتبر نیست' : 'کد ملی معتبر نیست')
  }
  const phone = String(input.phone ?? '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[\s-]/g, '')
  if (phone && !/^(\+98|0)?9\d{9}$|^0\d{10}$/.test(phone)) throw new MarketplaceError('شمارهٔ تماس معتبر نیست')
  const email = String(input.email ?? '').trim().toLowerCase().slice(0, 190)
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) throw new MarketplaceError('ایمیل معتبر نیست')
  const ibanRaw = String(input.iban ?? '').trim()
  const iban = ibanRaw ? normalizeIban(ibanRaw) : ''
  if (ibanRaw && !iban) throw new MarketplaceError('شمارهٔ شبا معتبر نیست (IR و ۲۴ رقم)')
  const image = (value: unknown) => { const url = String(value ?? '').trim(); return /^(\/|https:\/\/)[^\s"'<>]{0,500}$/.test(url) ? url : '' }
  return {
    shopName, slug, kind, legalName, nationalId, phone, email,
    city: text(input.city, 60), address: text(input.address, 300), about: String(input.about ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 2000),
    logo: image(input.logo), banner: image(input.banner), iban, ibanOwner: text(input.ibanOwner, 120),
  }
}

// ------------------------------------------------------------------ ledger

export type LedgerRow = { kind: string; amountMinor: bigint; availableAt: Date }

/**
 * balance: everything; available: what can be withdrawn now (sales past their
 * hold, minus payouts and refunds); pending: sales still on hold.
 */
export function balanceOf(rows: LedgerRow[], now = new Date()) {
  let balance = 0n, pending = 0n
  for (const row of rows) {
    balance += row.amountMinor
    if (row.availableAt > now && (row.kind === 'SALE' || row.kind === 'COMMISSION')) pending += row.amountMinor
  }
  const available = balance - pending
  return { balance, pending, available: available > 0n ? available : 0n }
}

export function checkPayout(amountMinor: bigint, availableMinor: bigint, minMinor: bigint, iban: string) {
  if (!iban) throw new MarketplaceError('ابتدا شمارهٔ شبای حساب فروشگاه را در پروفایل ثبت کنید')
  if (amountMinor <= 0n) throw new MarketplaceError('مبلغ برداشت را وارد کنید')
  if (amountMinor < minMinor) throw new MarketplaceError('مبلغ کمتر از حداقل برداشت است')
  if (amountMinor > availableMinor) throw new MarketplaceError('مبلغ بیشتر از موجودی قابل برداشت است')
}

/** Share of a refund that belongs to one line (refunds on part of an order are split by line totals). */
export function refundShare(lineTotal: bigint, orderItemsTotal: bigint, refunded: bigint): bigint {
  if (orderItemsTotal <= 0n || refunded <= 0n) return 0n
  const share = (lineTotal * refunded) / orderItemsTotal
  return share > lineTotal ? lineTotal : share
}

// ------------------------------------------------------------------ order lines

export const LINE_STATUS: Record<string, string> = { '': 'سفارش جدید', ACCEPTED: 'تأیید شد', READY: 'آمادهٔ ارسال', SHIPPED: 'ارسال شد' }
const NEXT: Record<string, string[]> = { '': ['ACCEPTED', 'READY'], ACCEPTED: ['READY'], READY: ['SHIPPED'], SHIPPED: [] }

export function canMoveLine(from: string, to: string): boolean {
  return (NEXT[from] || []).includes(to)
}

// ------------------------------------------------------------------ ratings

export const REVIEW_CRITERIA = [
  { key: 'onTime', label: 'ارسال به‌موقع' },
  { key: 'asDescribed', label: 'مطابقت با توضیحات' },
  { key: 'packaging', label: 'بسته‌بندی' },
] as const

export function validateSellerReview(input: Record<string, unknown>) {
  const rating = Math.round(Number(input.rating))
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new MarketplaceError('امتیاز را از ۱ تا ۵ انتخاب کنید')
  const criteria: Record<string, number> = {}
  const raw = (input.criteria && typeof input.criteria === 'object' ? input.criteria : {}) as Record<string, unknown>
  for (const { key } of REVIEW_CRITERIA) {
    const score = Math.round(Number(raw[key]))
    if (Number.isInteger(score) && score >= 1 && score <= 5) criteria[key] = score
  }
  return { rating, criteria, body: String(input.body ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 1000) }
}

/** Average out of 5 (one decimal) and the share of happy buyers (4–5 stars). */
export function ratingSummary(sum: number, count: number) {
  return { average: count ? Math.round((sum / count) * 10) / 10 : 0, count }
}

/** Seller performance label shown on product pages and the shop page. */
export function performanceLabel(average: number, count: number): { label: string; tone: 'top' | 'good' | 'new' | 'low' } {
  if (count < 3) return { label: 'فروشندهٔ تازه', tone: 'new' }
  if (average >= 4.5) return { label: 'عملکرد عالی', tone: 'top' }
  if (average >= 3.5) return { label: 'عملکرد خوب', tone: 'good' }
  return { label: 'عملکرد ضعیف', tone: 'low' }
}
