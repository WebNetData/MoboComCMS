/**
 * Store rules shared by the storefront, the cart/checkout and the admin:
 * order fulfilment workflow, discount display, cart limits, shop listing
 * query parsing and the merchandising settings. Pure functions only.
 */

export class StoreError extends Error {
  constructor(message: string, public status = 400, public code = 'STORE_INVALID') { super(message) }
}

const toLatin = (value: string) => value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))

// ------------------------------------------------------------------ fulfilment workflow

export const FULFILMENT_STATUSES = ['PENDING', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'] as const
export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number]

export const FULFILMENT_LABEL: Record<FulfilmentStatus, string> = {
  PENDING: 'در انتظار تأیید',
  PROCESSING: 'در حال پردازش',
  PACKED: 'بسته‌بندی شد',
  SHIPPED: 'تحویل به مرسوله‌رسان',
  DELIVERED: 'تحویل داده شد',
  CANCELLED: 'لغو شد',
  RETURNED: 'مرجوع شد',
}

/** Which next states staff may move an order into. */
const NEXT: Record<FulfilmentStatus, FulfilmentStatus[]> = {
  PENDING: ['PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
  PROCESSING: ['PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
  PACKED: ['PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
}

export const isFulfilmentStatus = (value: unknown): value is FulfilmentStatus => (FULFILMENT_STATUSES as readonly string[]).includes(String(value))

export function canMoveTo(from: string, to: string): boolean {
  if (!isFulfilmentStatus(from) || !isFulfilmentStatus(to) || from === to) return false
  return NEXT[from].includes(to)
}

export const nextStatuses = (from: string): FulfilmentStatus[] => (isFulfilmentStatus(from) ? NEXT[from] : [])

/** The customer-facing tracking steps (Digikala style) and how far the order got. */
export const TRACKING_STEPS: { status: FulfilmentStatus; label: string }[] = [
  { status: 'PENDING', label: 'ثبت سفارش' },
  { status: 'PROCESSING', label: 'پردازش انبار' },
  { status: 'PACKED', label: 'آمادهٔ ارسال' },
  { status: 'SHIPPED', label: 'تحویل به مرسوله‌رسان' },
  { status: 'DELIVERED', label: 'تحویل به مشتری' },
]

export function trackingIndex(status: string): number {
  const index = TRACKING_STEPS.findIndex((step) => step.status === status)
  return index < 0 ? 0 : index
}

// ------------------------------------------------------------------ prices

/** A list price is shown only while it is higher than the price and its timed offer has not ended. */
export function listPriceActive(priceMinor: bigint, compareAtMinor: bigint, saleEndsAt: Date | null | undefined, now = new Date()): boolean {
  return compareAtMinor > priceMinor && priceMinor > 0n && (!saleEndsAt || saleEndsAt > now)
}

/** Whole-number discount percentage (floored so we never overstate it). */
export function discountPercent(priceMinor: bigint, compareAtMinor: bigint): number {
  if (compareAtMinor <= priceMinor || compareAtMinor <= 0n) return 0
  return Number(((compareAtMinor - priceMinor) * 100n) / compareAtMinor)
}

// ------------------------------------------------------------------ cart

export const MAX_CART_LINES = 50
export const MAX_LINE_QUANTITY = 30

/** Highest quantity one cart line may hold, from stock (-1 = unlimited) and the per-order limit (0 = none). */
export function lineLimit(stock: number, variantStock: number | null, maxPerOrder: number): number {
  let limit = MAX_LINE_QUANTITY
  if (stock >= 0) limit = Math.min(limit, stock)
  if (variantStock !== null && variantStock >= 0) limit = Math.min(limit, variantStock)
  if (maxPerOrder > 0) limit = Math.min(limit, maxPerOrder)
  return Math.max(0, limit)
}

export function normalizeQuantity(value: unknown): number {
  const quantity = Math.floor(Number(toLatin(String(value ?? '')).trim() || NaN))
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_LINE_QUANTITY) throw new StoreError('تعداد معتبر نیست', 400, 'BAD_QUANTITY')
  return quantity
}

// ------------------------------------------------------------------ shop listing

export const SHOP_SORTS = [
  { key: 'newest', label: 'جدیدترین' },
  { key: 'bestselling', label: 'پرفروش‌ترین' },
  { key: 'views', label: 'پربازدیدترین' },
  { key: 'cheap', label: 'ارزان‌ترین' },
  { key: 'expensive', label: 'گران‌ترین' },
  { key: 'discount', label: 'بیشترین تخفیف' },
] as const
export type ShopSort = (typeof SHOP_SORTS)[number]['key']

export type ShopQuery = {
  q: string
  category: string
  brands: string[]
  /** Price bounds in the shop's display unit (e.g. toman); 0 = open. */
  min: number
  max: number
  available: boolean
  discounted: boolean
  kind: '' | 'PHYSICAL' | 'VIRTUAL'
  sort: ShopSort
  page: number
}

type Params = Record<string, string | string[] | undefined>
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || ''
const slugLike = (value: string) => value.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 80)
const amount = (value: string) => {
  const number = Number(toLatin(value).replace(/[,،٬\s]/g, ''))
  return Number.isFinite(number) && number > 0 ? Math.min(number, 1e13) : 0
}

export function parseShopQuery(params: Params): ShopQuery {
  const sort = first(params.sort)
  const brands = (Array.isArray(params.brand) ? params.brand : first(params.brand).split(','))
    .map(slugLike).filter(Boolean)
  const kind = first(params.kind).toUpperCase()
  let min = amount(first(params.min))
  let max = amount(first(params.max))
  if (min && max && min > max) [min, max] = [max, min]
  return {
    q: first(params.q).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80),
    category: slugLike(first(params.category)),
    brands: [...new Set(brands)].slice(0, 20),
    min,
    max,
    available: first(params.available) === '1',
    discounted: first(params.discounted) === '1',
    kind: kind === 'PHYSICAL' || kind === 'VIRTUAL' ? kind : '',
    sort: SHOP_SORTS.some((option) => option.key === sort) ? (sort as ShopSort) : 'newest',
    page: Math.max(1, Math.min(500, Math.floor(Number(toLatin(first(params.page)))) || 1)),
  }
}

/** Query string for a listing URL; `patch` overrides fields (page resets unless given). */
export function shopQueryString(query: ShopQuery, patch: Partial<ShopQuery> = {}): string {
  const next = { ...query, page: 1, ...patch }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.category) params.set('category', next.category)
  if (next.brands.length) params.set('brand', next.brands.join(','))
  if (next.min) params.set('min', String(next.min))
  if (next.max) params.set('max', String(next.max))
  if (next.available) params.set('available', '1')
  if (next.discounted) params.set('discounted', '1')
  if (next.kind) params.set('kind', next.kind)
  if (next.sort !== 'newest') params.set('sort', next.sort)
  if (next.page > 1) params.set('page', String(next.page))
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** True when anything narrows the listing (the shop landing shows only without filters). */
export const isFiltered = (query: ShopQuery) =>
  Boolean(query.q || query.category || query.brands.length || query.min || query.max || query.available || query.discounted || query.kind || query.sort !== 'newest' || query.page > 1)

// ------------------------------------------------------------------ merchandising settings

export type StoreSlide = { image: string; title: string; subtitle: string; href: string; cta: string }
export type StoreTile = { image: string; title: string; href: string }
export type StoreSettings = {
  /** Shop landing hero carousel. */
  slides: StoreSlide[]
  /** Two/four promotional banners under the offers rail. */
  banners: StoreTile[]
  offerTitle: string
  /** Stock at or below this counts as "low" (per-product threshold overrides it). */
  lowStockDefault: number
  showBrands: boolean
  showCategories: boolean
  /** Trust badges under the product buy box. */
  badges: string[]
  /** Free-text note under the cart total (return policy, shipping note…). */
  cartNote: string
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  slides: [],
  banners: [],
  offerTitle: 'پیشنهاد شگفت‌انگیز',
  lowStockDefault: 3,
  showBrands: true,
  showCategories: true,
  badges: ['ضمانت اصل بودن کالا', 'هفت روز ضمانت بازگشت', 'پرداخت امن', 'پشتیبانی ۷ روز هفته'],
  cartNote: '',
}

const cleanText = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** Same-site path or https URL; anything else is dropped. */
export function safeLink(value: unknown): string {
  const text = String(value ?? '').trim()
  if (/^\/(?!\/)[^\s<>"'`]*$/.test(text)) return text.slice(0, 300)
  try {
    const url = new URL(text)
    return url.protocol === 'https:' ? url.toString().slice(0, 300) : ''
  } catch { return '' }
}

/** Uploaded media path or https image; anything else is dropped. */
export function safeImage(value: unknown): string {
  const text = String(value ?? '').trim()
  if (/^\/(?!\/)[^\s<>"'`\\]{1,299}$/.test(text)) return text
  try {
    const url = new URL(text)
    return url.protocol === 'https:' ? url.toString().slice(0, 500) : ''
  } catch { return '' }
}

export function normalizeStoreSettings(input: unknown, base: StoreSettings = DEFAULT_STORE_SETTINGS): StoreSettings {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const list = (value: unknown) => (Array.isArray(value) ? value : [])
  const slides = raw.slides === undefined ? base.slides : list(raw.slides).slice(0, 8).map((row) => {
    const item = (row || {}) as Record<string, unknown>
    return { image: safeImage(item.image), title: cleanText(item.title, 90), subtitle: cleanText(item.subtitle, 160), href: safeLink(item.href), cta: cleanText(item.cta, 30) }
  }).filter((slide) => slide.image || slide.title)
  const banners = raw.banners === undefined ? base.banners : list(raw.banners).slice(0, 4).map((row) => {
    const item = (row || {}) as Record<string, unknown>
    return { image: safeImage(item.image), title: cleanText(item.title, 60), href: safeLink(item.href) }
  }).filter((banner) => banner.image)
  const badges = raw.badges === undefined ? base.badges : list(raw.badges).map((badge) => cleanText(badge, 40)).filter(Boolean).slice(0, 6)
  const low = raw.lowStockDefault === undefined ? base.lowStockDefault : Math.floor(Number(raw.lowStockDefault))
  return {
    slides,
    banners,
    offerTitle: raw.offerTitle === undefined ? base.offerTitle : cleanText(raw.offerTitle, 40) || DEFAULT_STORE_SETTINGS.offerTitle,
    lowStockDefault: Number.isSafeInteger(low) && low >= 0 && low <= 10_000 ? low : base.lowStockDefault,
    showBrands: raw.showBrands === undefined ? base.showBrands : raw.showBrands === true,
    showCategories: raw.showCategories === undefined ? base.showCategories : raw.showCategories === true,
    badges,
    cartNote: raw.cartNote === undefined ? base.cartNote : cleanText(raw.cartNote, 300),
  }
}

// ------------------------------------------------------------------ brands

export function validateBrand(input: Record<string, unknown>) {
  const name = cleanText(input.name, 80)
  const slug = String(input.slug ?? '').trim().toLowerCase()
  if (name.length < 2) throw new StoreError('نام برند را وارد کنید')
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) throw new StoreError('نامک برند فقط حروف لاتین کوچک، عدد و خط تیره باشد')
  const sortOrder = Math.floor(Number(input.sortOrder) || 0)
  return {
    name, slug,
    nameEn: cleanText(input.nameEn, 80),
    logo: safeImage(input.logo),
    description: cleanText(input.description, 600),
    featured: input.featured === true,
    sortOrder: Number.isSafeInteger(sortOrder) ? sortOrder : 0,
  }
}
