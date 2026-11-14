/**
 * Product feeds for Iranian price-comparison sites: Torob (torob_api v3),
 * Emalls (shop web service) and a generic Google-Merchant style XML feed.
 * The comparison sites fetch these regularly, so products, prices and stock
 * stay in sync by themselves. Pure functions only; prices are in Toman.
 */

export type FeedSettings = {
  torob: boolean
  emalls: boolean
  xml: boolean
  /** Also list out-of-stock products (marked unavailable) — recommended by Torob. */
  includeOutOfStock: boolean
  /** Category slugs never exported. */
  excludeCategories: string[]
  /** Optional secret for Emalls (?token=…); empty = open. */
  emallsToken: string
  /** Text added to every product title, e.g. brand of the shop (optional). */
  titleSuffix: string
}

export const DEFAULT_FEEDS: FeedSettings = { torob: false, emalls: false, xml: false, includeOutOfStock: true, excludeCategories: [], emallsToken: '', titleSuffix: '' }

export function normalizeFeeds(input: unknown): FeedSettings {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const bool = (key: keyof FeedSettings, fallback: boolean) => (typeof raw[key] === 'boolean' ? raw[key] as boolean : fallback)
  const token = String(raw.emallsToken ?? '').trim()
  return {
    torob: bool('torob', false), emalls: bool('emalls', false), xml: bool('xml', false), includeOutOfStock: bool('includeOutOfStock', true),
    excludeCategories: [...new Set((Array.isArray(raw.excludeCategories) ? raw.excludeCategories : String(raw.excludeCategories ?? '').split(/[\s,،]+/)).map((slug) => String(slug).trim().toLowerCase()).filter((slug) => /^[a-z0-9؀-ۿ_-]{1,80}$/.test(slug)))].slice(0, 100),
    emallsToken: /^[A-Za-z0-9_-]{8,64}$/.test(token) ? token : '',
    titleSuffix: String(raw.titleSuffix ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40),
  }
}

/** Minor units → Toman (IRT/TMN as is, IRR ÷ 10); null for other currencies. */
export function toToman(minor: bigint, currency: string): number | null {
  const c = currency.toUpperCase()
  if (c === 'IRT' || c === 'TMN') return Number(minor)
  if (c === 'IRR') return Number(minor / 10n)
  return null
}

/** One product as the feeds need it (already priced, absolute URLs). */
export type FeedProduct = {
  id: number
  title: string
  subtitle: string
  url: string
  image: string
  images: string[]
  price: number
  oldPrice: number
  available: boolean
  condition: 'NEW' | 'OPEN_BOX' | 'USED' | 'REFURBISHED'
  category: string
  categoryPath: string[]
  brand: string
  description: string
  guarantee: string
  specs: Record<string, string>
  createdAt: Date
  updatedAt: Date
  sku: string
}

const iso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, '+00:00')

/** torob_api v3 product object. */
export function torobItem(product: FeedProduct) {
  return {
    page_unique: String(product.id),
    page_url: product.url,
    product_group_id: String(product.id),
    title: product.title,
    subtitle: product.subtitle,
    current_price: product.available ? product.price : 0,
    old_price: product.oldPrice > product.price ? product.oldPrice : 0,
    availability: product.available ? 'instock' : 'outofstock',
    category_name: product.category,
    image_links: product.images.slice(0, 10),
    short_desc: product.description.slice(0, 1000),
    spec: product.specs,
    guarantee: product.guarantee,
    date_added: iso(product.createdAt),
    date_updated: iso(product.updatedAt),
  }
}

export function torobPage(products: FeedProduct[], page: number, total: number, perPage: number) {
  return { api_version: 'torob_api_v3', current_page: page, total, max_pages: Math.max(1, Math.ceil(total / perPage)), products: products.map(torobItem) }
}

/** Emalls web-service product object. */
export function emallsItem(product: FeedProduct) {
  return {
    id: String(product.id),
    title: product.title,
    url: product.url,
    price: product.available ? product.price : 0,
    old_price: product.oldPrice > product.price ? product.oldPrice : 0,
    is_available: product.available,
    category: product.category,
    image: product.image,
    guarantee: product.guarantee,
    brand: product.brand,
  }
}

export function emallsPage(products: FeedProduct[], page: number, total: number, perPage: number) {
  return { success: true, page, item_per_page: perPage, count: total, total_pages: Math.max(1, Math.ceil(total / perPage)), products: products.map(emallsItem) }
}

const xml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] as string).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

/** Google Merchant style RSS 2.0 feed (prices in IRR, as the standard needs ISO currency codes). */
export function xmlFeed(products: FeedProduct[], shop: { title: string; url: string }) {
  const items = products.map((product) => [
    '<item>',
    `<g:id>${product.id}</g:id>`,
    `<title>${xml(product.title)}</title>`,
    `<link>${xml(product.url)}</link>`,
    `<description>${xml(product.description.slice(0, 4000) || product.title)}</description>`,
    product.image ? `<g:image_link>${xml(product.image)}</g:image_link>` : '',
    ...product.images.slice(1, 10).map((image) => `<g:additional_image_link>${xml(image)}</g:additional_image_link>`),
    `<g:availability>${product.available ? 'in_stock' : 'out_of_stock'}</g:availability>`,
    `<g:price>${(product.oldPrice > product.price ? product.oldPrice : product.price) * 10} IRR</g:price>`,
    product.oldPrice > product.price ? `<g:sale_price>${product.price * 10} IRR</g:sale_price>` : '',
    product.brand ? `<g:brand>${xml(product.brand)}</g:brand>` : '',
    product.sku ? `<g:mpn>${xml(product.sku)}</g:mpn>` : '',
    `<g:product_type>${xml(product.categoryPath.join(' > ') || product.category)}</g:product_type>`,
    `<g:condition>${product.condition === 'USED' || product.condition === 'OPEN_BOX' ? 'used' : product.condition === 'REFURBISHED' ? 'refurbished' : 'new'}</g:condition>`,
    '</item>',
  ].filter(Boolean).join(''))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${xml(shop.title)}</title><link>${xml(shop.url)}</link><description>${xml(shop.title)}</description>\n${items.join('\n')}\n</channel></rss>\n`
}
