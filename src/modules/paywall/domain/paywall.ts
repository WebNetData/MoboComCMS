/**
 * Paid content: one price on an article or a downloadable item. VIP members get
 * it free, at a member price, or pay like everyone else. Pure rules only.
 */

export class PaywallError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'PAYWALL') { super(message) }
}

/** `link` is one download/stream link with its own price (a 4K file, a special edition). */
export const OWNER_TYPES = ['post', 'software', 'game', 'title', 'album', 'track', 'link'] as const
export type OwnerType = (typeof OWNER_TYPES)[number]
export const OWNER_LABEL: Record<OwnerType, string> = {
  post: 'مقاله', software: 'نرم‌افزار', game: 'بازی', title: 'فیلم و سریال', album: 'آلبوم', track: 'آهنگ', link: 'لینک دانلود',
}
export const OWNER_MODULE: Record<OwnerType, string> = {
  post: 'journal', software: 'software', game: 'games', title: 'cinema', album: 'music', track: 'music', link: 'paywall',
}

export const VIP_ACCESS = ['FREE', 'DISCOUNT', 'NONE'] as const
export type VipAccess = (typeof VIP_ACCESS)[number]
export const VIP_ACCESS_LABEL: Record<VipAccess, string> = {
  FREE: 'رایگان برای اعضای ویژه',
  DISCOUNT: 'قیمت ویژه برای اعضای VIP',
  NONE: 'همه باید بخرند',
}

export const CURRENCIES = ['IRT', 'IRR', 'USD'] as const

export const isOwnerType = (value: unknown): value is OwnerType => OWNER_TYPES.includes(value as OwnerType)

/** "post:12" → { ownerType: 'post', ownerId: 12 } (checkout and API keys). */
export function parseContentKey(value: unknown): { ownerType: OwnerType; ownerId: number } | null {
  const match = /^([a-z]+):(\d{1,9})$/.exec(String(value ?? ''))
  if (!match || !isOwnerType(match[1])) return null
  const ownerId = Number(match[2])
  return ownerId > 0 ? { ownerType: match[1], ownerId } : null
}

export const contentKey = (ownerType: string, ownerId: number) => `${ownerType}:${ownerId}`

export type PaidInput = { priceMinor: bigint; currency: string; vipAccess: VipAccess; memberPriceMinor: bigint | null; active: boolean }

/** Admin input → a valid price. Prices are whole units (toman, rial) or cents for USD. */
export function normalizePaidInput(input: Record<string, unknown>): PaidInput {
  const currency = CURRENCIES.includes(String(input.currency || '').toUpperCase() as (typeof CURRENCIES)[number]) ? String(input.currency).toUpperCase() : 'IRT'
  const toMinor = (value: unknown) => {
    const text = String(value ?? '').replace(/[,،٬\s]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    if (!text) return null
    if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new PaywallError('قیمت معتبر نیست')
    return currency === 'USD' ? BigInt(Math.round(Number(text) * 100)) : BigInt(text.split('.')[0])
  }
  const priceMinor = toMinor(input.price)
  if (!priceMinor || priceMinor <= 0n) throw new PaywallError('قیمت فروش را وارد کنید')
  if (priceMinor > 10_000_000_000n) throw new PaywallError('قیمت بیش از حد بزرگ است')
  const vipAccess = VIP_ACCESS.includes(input.vipAccess as VipAccess) ? input.vipAccess as VipAccess : 'FREE'
  let memberPriceMinor: bigint | null = null
  if (vipAccess === 'DISCOUNT') {
    memberPriceMinor = toMinor(input.memberPrice)
    if (!memberPriceMinor || memberPriceMinor <= 0n || memberPriceMinor >= priceMinor) throw new PaywallError('قیمت اعضای ویژه باید از قیمت اصلی کمتر باشد')
  }
  return { priceMinor, currency, vipAccess, memberPriceMinor, active: input.active !== false }
}

export type PaidRule = { priceMinor: bigint; currency: string; vipAccess: string; memberPriceMinor: bigint | null; active: boolean }

export type AccessDecision =
  | { open: true; reason: 'free' | 'vip' | 'purchased' }
  | { open: false; reason: 'buy'; priceMinor: bigint; listPriceMinor: bigint; currency: string; vipFree: boolean; vipPriceMinor: bigint | null; memberPrice: boolean }

/**
 * Can this viewer open the content, and if not, what do they pay? The price a
 * VIP member sees depends on `vipAccess`; everyone else pays the full price.
 */
export function decideAccess(rule: PaidRule | null | undefined, viewer: { member: boolean; purchased: boolean }): AccessDecision {
  if (!rule || !rule.active) return { open: true, reason: 'free' }
  if (viewer.purchased) return { open: true, reason: 'purchased' }
  if (rule.vipAccess === 'FREE' && viewer.member) return { open: true, reason: 'vip' }
  const vipPriceMinor = rule.vipAccess === 'DISCOUNT' && rule.memberPriceMinor && rule.memberPriceMinor < rule.priceMinor ? rule.memberPriceMinor : null
  const memberPrice = viewer.member && vipPriceMinor !== null
  return {
    open: false, reason: 'buy', priceMinor: memberPrice ? vipPriceMinor! : rule.priceMinor, listPriceMinor: rule.priceMinor, currency: rule.currency,
    vipFree: rule.vipAccess === 'FREE', vipPriceMinor, memberPrice,
  }
}

/**
 * Which paid records guard an item: the item itself, then its parent (a
 * track's album; a download link's title). First active one wins, so a link
 * with its own price is sold on its own — buying the whole item does not open it.
 */
export function pickRule<T extends PaidRule & { ownerType: string; ownerId: number }>(rules: T[], chain: { ownerType: string; ownerId: number }[]): T | null {
  for (const link of chain) {
    const rule = rules.find((row) => row.ownerType === link.ownerType && row.ownerId === link.ownerId && row.active)
    if (rule) return rule
  }
  return null
}

/** Display amount: toman/rial as whole numbers, USD from cents. */
export function formatPrice(minor: bigint, currency: string): string {
  if (currency === 'USD') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(minor) / 100)
  return `${Number(minor).toLocaleString('fa-IR')} ${currency === 'IRR' ? 'ریال' : 'تومان'}`
}

/** Admin-form value of a stored price (inverse of normalizePaidInput). */
export const priceInput = (minor: bigint | null | undefined, currency: string) => (minor == null ? '' : currency === 'USD' ? (Number(minor) / 100).toFixed(2) : minor.toString())

/** Owners whose links may carry their own price (their link ids are stable across edits). */
export const PRICED_LINK_OWNERS = ['title', 'game', 'software'] as const

/** Link-row price from the admin link editor: '' = no own price. */
export function normalizeLinkPrice(input: { price?: unknown; priceVip?: unknown }): PaidInput | null {
  const text = String(input.price ?? '').replace(/[,،٬\s]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  if (!text) return null
  return normalizePaidInput({ price: text, currency: 'IRT', vipAccess: input.priceVip === 'NONE' ? 'NONE' : 'FREE' })
}
