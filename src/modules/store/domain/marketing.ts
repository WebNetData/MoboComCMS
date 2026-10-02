/**
 * Store marketing rules: back-in-stock alerts, abandoned cart reminders,
 * gift cards, the customer club (loyalty points) and installment previews.
 * Pure functions only; amounts are minor units (Toman for IRT, exponent 0).
 */

export class MarketingError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'MARKETING') { super(message) }
}

/** Current public purchase eligibility for a stock alert target. */
export function stockAlertAvailable(product: { active: boolean; approval: string; stock: number; variantCount: number; variants: readonly { id: number; stock: number }[] }, variantId: number) {
  if (!product.active || product.approval !== 'APPROVED' || product.stock === 0) return false
  if (variantId) return product.variants.some((variant) => variant.id === variantId && variant.stock !== 0)
  return product.variantCount === 0 || product.variants.some((variant) => variant.stock !== 0)
}

const int = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** Toman value of an amount (IRR ÷ 10; other currencies earn nothing). */
export function tomanOf(amountMinor: bigint, currency: string): bigint {
  const c = currency.toUpperCase()
  if (c === 'IRT' || c === 'TMN') return amountMinor
  if (c === 'IRR') return amountMinor / 10n
  return 0n
}

// ------------------------------------------------------------------ customer club

export type Tier = { id: string; name: string; minLifetime: number; multiplier: number; color: string; perks: string }
export type LoyaltySettings = {
  enabled: boolean
  /** Points earned for every `earnStepToman` spent. */
  earnPoints: number
  earnStepToman: number
  /** Toman credited to the wallet for one point. */
  pointValueToman: number
  minRedeem: number
  signupBonus: number
  reviewBonus: number
  tiers: Tier[]
  /** Orders paid before this moment never earn (set when the club is switched on). */
  since: string
}

export const DEFAULT_TIERS: Tier[] = [
  { id: 'bronze', name: 'برنزی', minLifetime: 0, multiplier: 1, color: '#b0793f', perks: 'امتیاز پایه برای هر خرید' },
  { id: 'silver', name: 'نقره‌ای', minLifetime: 500, multiplier: 1.25, color: '#8f9bab', perks: '۲۵٪ امتیاز بیشتر' },
  { id: 'gold', name: 'طلایی', minLifetime: 2000, multiplier: 1.5, color: '#d4a017', perks: '۵۰٪ امتیاز بیشتر و پشتیبانی ویژه' },
  { id: 'diamond', name: 'الماس', minLifetime: 6000, multiplier: 2, color: '#5b8def', perks: 'امتیاز دوبرابر' },
]

export const DEFAULT_LOYALTY: LoyaltySettings = { enabled: false, earnPoints: 1, earnStepToman: 10_000, pointValueToman: 100, minRedeem: 100, signupBonus: 0, reviewBonus: 0, tiers: DEFAULT_TIERS, since: '' }

export function normalizeLoyalty(input: unknown): LoyaltySettings {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const tiers = (Array.isArray(raw.tiers) ? raw.tiers : DEFAULT_TIERS).slice(0, 8).map((tier: Record<string, unknown>, index: number) => ({
    id: String(tier.id || `tier${index}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 20) || `tier${index}`,
    name: text(tier.name, 30) || `سطح ${index + 1}`,
    minLifetime: int(tier.minLifetime, 0, 0, 10_000_000),
    multiplier: Math.max(0.1, Math.min(10, Math.round(Number(tier.multiplier) * 100) / 100 || 1)),
    color: /^#[0-9a-f]{6}$/i.test(String(tier.color)) ? String(tier.color) : '#8f9bab',
    perks: text(tier.perks, 160),
  })).sort((a, b) => a.minLifetime - b.minLifetime)
  // The lowest tier is where everyone starts.
  if (tiers[0]) tiers[0].minLifetime = 0
  return {
    enabled: bool(raw.enabled, DEFAULT_LOYALTY.enabled),
    earnPoints: int(raw.earnPoints, DEFAULT_LOYALTY.earnPoints, 0, 1000),
    earnStepToman: int(raw.earnStepToman, DEFAULT_LOYALTY.earnStepToman, 100, 100_000_000),
    pointValueToman: int(raw.pointValueToman, DEFAULT_LOYALTY.pointValueToman, 0, 1_000_000),
    minRedeem: int(raw.minRedeem, DEFAULT_LOYALTY.minRedeem, 1, 10_000_000),
    signupBonus: int(raw.signupBonus, 0, 0, 100_000),
    reviewBonus: int(raw.reviewBonus, 0, 0, 100_000),
    tiers: tiers.length ? tiers : DEFAULT_TIERS,
    since: typeof raw.since === 'string' && !Number.isNaN(Date.parse(raw.since)) ? raw.since : '',
  }
}

export function tierFor(settings: LoyaltySettings, lifetime: number): { tier: Tier; next: Tier | null; toNext: number } {
  let tier = settings.tiers[0]
  for (const row of settings.tiers) if (lifetime >= row.minLifetime) tier = row
  const next = settings.tiers.find((row) => row.minLifetime > lifetime) || null
  return { tier, next, toNext: next ? next.minLifetime - lifetime : 0 }
}

/** Points for a paid amount at a tier (whole points, rounded down). */
export function pointsFor(settings: LoyaltySettings, toman: bigint, multiplier = 1): number {
  if (!settings.earnPoints || toman <= 0n) return 0
  const steps = Number(toman / BigInt(settings.earnStepToman))
  return Math.floor(steps * settings.earnPoints * multiplier)
}

/** Points to take back for a partial refund (proportional, never more than earned). */
export function reversalPoints(earned: number, refundedMinor: bigint, totalMinor: bigint): number {
  if (earned <= 0 || refundedMinor <= 0n || totalMinor <= 0n) return 0
  if (refundedMinor >= totalMinor) return earned
  return Math.min(earned, Math.ceil(Number((BigInt(earned) * refundedMinor * 1000n) / totalMinor) / 1000))
}

export function redeemValue(settings: LoyaltySettings, points: number): bigint {
  return BigInt(Math.max(0, Math.floor(points))) * BigInt(settings.pointValueToman)
}

// ------------------------------------------------------------------ abandoned carts

export type RecoveryStep = { afterHours: number; couponCode: string; message: string }
export type RecoverySettings = { enabled: boolean; steps: RecoveryStep[]; minValueToman: number; maxAgeDays: number }

export const DEFAULT_RECOVERY: RecoverySettings = {
  enabled: false,
  steps: [
    { afterHours: 1, couponCode: '', message: 'کالاهایی که انتخاب کرده بودید هنوز در سبد خرید شما منتظرند.' },
    { afterHours: 24, couponCode: '', message: 'سبد خرید شما هنوز پابرجاست؛ موجودی بعضی کالاها محدود است.' },
  ],
  minValueToman: 0,
  maxAgeDays: 7,
}

export function normalizeRecovery(input: unknown): RecoverySettings {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const steps = (Array.isArray(raw.steps) ? raw.steps : DEFAULT_RECOVERY.steps).slice(0, 3).map((step: Record<string, unknown>) => ({
    afterHours: int(step.afterHours, 1, 1, 24 * 14),
    couponCode: String(step.couponCode ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32),
    message: text(step.message, 200),
  })).sort((a, b) => a.afterHours - b.afterHours)
  return { enabled: bool(raw.enabled, false), steps: steps.length ? steps : DEFAULT_RECOVERY.steps, minValueToman: int(raw.minValueToman, 0, 0, 1_000_000_000), maxAgeDays: int(raw.maxAgeDays, 7, 1, 60) }
}

/**
 * The reminder a cart is due for: carts are measured from their last change;
 * each step fires once (reminderCount), in order, never after maxAgeDays.
 */
export function dueStep(settings: RecoverySettings, cart: { updatedAt: Date; reminderCount: number }, now: Date): number | null {
  if (!settings.enabled) return null
  const ageHours = (now.getTime() - cart.updatedAt.getTime()) / 3_600_000
  if (ageHours > settings.maxAgeDays * 24) return null
  const index = cart.reminderCount
  const step = settings.steps[index]
  return step && ageHours >= step.afterHours ? index : null
}

// ------------------------------------------------------------------ gift cards

export type GiftSettings = { purchaseEnabled: boolean; amounts: number[]; minToman: number; maxToman: number; validityDays: number }
export const DEFAULT_GIFT: GiftSettings = { purchaseEnabled: true, amounts: [100_000, 200_000, 500_000, 1_000_000], minToman: 50_000, maxToman: 20_000_000, validityDays: 365 }

export function normalizeGift(input: unknown): GiftSettings {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const minToman = int(raw.minToman, DEFAULT_GIFT.minToman, 1_000, 1_000_000_000)
  const maxToman = Math.max(minToman, int(raw.maxToman, DEFAULT_GIFT.maxToman, 1_000, 1_000_000_000))
  const amounts = [...new Set((Array.isArray(raw.amounts) ? raw.amounts : DEFAULT_GIFT.amounts).map((value) => int(value, 0, 0, maxToman)).filter((value) => value >= minToman))].sort((a, b) => a - b).slice(0, 8)
  return { purchaseEnabled: bool(raw.purchaseEnabled, true), amounts, minToman, maxToman, validityDays: int(raw.validityDays, 365, 0, 3650) }
}

const GIFT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

/** 16 characters (80 bits) in groups of four: "K7QM-2XRD-9PLA-W4ZN". */
export function giftCode(random: (max: number) => number): string {
  let raw = ''
  for (let i = 0; i < 16; i++) raw += GIFT_ALPHABET[random(GIFT_ALPHABET.length)]
  return raw.match(/.{4}/g)!.join('-')
}

/** Canonical code for lookup: upper case, Persian digits mapped, no spaces or dashes. */
export function normalizeGiftCode(input: unknown): string {
  return String(input ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .toUpperCase().replace(/[\s\-‌]/g, '')
    .slice(0, 32)
}

export const giftCodeLooksValid = (code: string) => new RegExp(`^[${GIFT_ALPHABET}]{16}$`).test(code)

export function giftCardState(card: { status: string; expiresAt: Date | null }, now = new Date()): 'ACTIVE' | 'REDEEMED' | 'DISABLED' | 'EXPIRED' {
  if (card.status === 'REDEEMED') return 'REDEEMED'
  if (card.status === 'DISABLED') return 'DISABLED'
  if (card.expiresAt && card.expiresAt.getTime() < now.getTime()) return 'EXPIRED'
  return 'ACTIVE'
}

export function validGiftAmount(settings: GiftSettings, toman: unknown): number {
  const value = Math.round(Number(toman))
  if (!Number.isFinite(value) || value < settings.minToman || value > settings.maxToman) throw new MarketingError(`مبلغ کارت هدیه باید بین ${settings.minToman.toLocaleString('fa-IR')} و ${settings.maxToman.toLocaleString('fa-IR')} تومان باشد`)
  return value
}

// ------------------------------------------------------------------ installments

export const INSTALLMENT_PROVIDERS = ['SNAPPPAY', 'DIGIPAY', 'AZKI'] as const
export type InstallmentProvider = (typeof INSTALLMENT_PROVIDERS)[number]
export const INSTALLMENT_LABEL: Record<InstallmentProvider, string> = { SNAPPPAY: 'اسنپ‌پی', DIGIPAY: 'دیجی‌پی (اعتباری)', AZKI: 'ازکی وام' }
export const isInstallmentProvider = (provider: string): provider is InstallmentProvider => (INSTALLMENT_PROVIDERS as readonly string[]).includes(provider)

/** Equal monthly parts for the product page ("۴ قسط ۲۵۰٬۰۰۰ تومانی"). */
export function installmentPreview(priceToman: number, count: number): { count: number; each: number } | null {
  if (!Number.isFinite(priceToman) || priceToman <= 0 || count < 2) return null
  return { count, each: Math.ceil(priceToman / count) }
}
