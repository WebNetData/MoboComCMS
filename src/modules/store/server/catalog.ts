import { publicProductWhere } from '@/modules/catalog/domain/product-publication'
import { sellableStock } from '@/modules/store/domain/store'
import { audienceClause } from '@/modules/account/server/item-audience'
import type { Prisma } from '@prisma/client'
import { deliversInstantly } from '@/modules/store/domain/digital-codes'
import { cache } from 'react'
import { db } from '@/platform/database/prisma'
import { readJsonSetting, createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server'
import { richTextToPlain } from '@/shared/content/sanitize'
import { minorToNumber } from '@/shared/money'
import { unitPrice } from '@/modules/store/server/pricing'
import { publicProductRelationshipIds } from '@/modules/catalog/server/product-relationships'
import { parseJson, type AttributeField } from '@/modules/catalog/server/product-config'
import { inCategories } from '@/modules/catalog/server/product-categories'
import { colorSwatch } from '@/modules/store/domain/colors'
import {
  DEFAULT_STORE_SETTINGS, discountPercent, normalizeStoreSettings, type ShopQuery, type StoreSettings,
} from '@/modules/store/domain/store'

// Storefront reads: product cards, the shop landing rails, the filtered
// listing with facets and related products. Prices are the regular (non-VIP)
// prices; VIP pricing is applied on the product page, in the cart and at checkout.

const SETTINGS_KEY = 'store.merchandising.v1'

export async function getStoreSettings(): Promise<StoreSettings> {
  const stored = await readJsonSetting(SETTINGS_KEY)
  return normalizeStoreSettings(stored ?? {}, DEFAULT_STORE_SETTINGS)
}

const storefrontHistory = () => createSectionSettingsHistory(SETTINGS_KEY, 'settings-storefront', raw => normalizeStoreSettings(raw || {}, DEFAULT_STORE_SETTINGS), settings => ({ slides: settings.slides.length, banners: settings.banners.length }), { action: 'store.settings.update', targetId: 0 })
export const storefrontSettingsState = () => storefrontHistory().current()
export const restoreStorefrontSettings = (...args: Parameters<ReturnType<typeof storefrontHistory>['restore']>) => storefrontHistory().restore(...args)

export async function saveStoreSettings(input: unknown, context?: SectionSettingsContext) {
  const next = await storefrontHistory().save(input, context)
  return next
}

export type ProductCard = {
  id: number
  slug: string
  name: string
  image: string
  brand: string
  category: string
  kind: string
  /** A virtual product that hands over its code by itself on payment (and has one to give). */
  instant: boolean
  price: number
  listPrice: number
  discount: number
  currency: string
  inStock: boolean
  lowStock: number
  rating: number
  ratingCount: number
  soldCount: number
  views: number
  saleEndsAt: string | null
  hasVariants: boolean
  vipOnly: boolean
  createdAt: string
  excerpt: string
}

const CARD_INCLUDE = {
  brand: { select: { name: true, slug: true } },
  category: { select: { name: true, slug: true } },
  variants: { where: { active: true }, select: { id: true, price: true, priceMinor: true, memberPriceMinor: true, compareAtMinor: true, stock: true, attributes: true } },
} satisfies Prisma.ProductInclude

type CardRow = Prisma.ProductGetPayload<{ include: typeof CARD_INCLUDE }>

async function ratings(ids: number[]) {
  if (!ids.length) return new Map<number, { rating: number; count: number }>()
  const rows = await db.productReview.groupBy({ by: ['productId'], where: { status: 'APPROVED', productId: { in: ids } }, _avg: { rating: true }, _count: { rating: true } }).catch(() => [])
  return new Map(rows.map((row) => [row.productId, { rating: Math.round((row._avg.rating || 0) * 10) / 10, count: row._count.rating }]))
}

function toCard(row: CardRow, rating: { rating: number; count: number } | undefined, lowStockDefault: number, now: Date): ProductCard {
  // The cheapest purchasable option is the card price.
  const options = row.variants.length
    ? row.variants.map((variant) => unitPrice(row, variant, false, now))
    : [unitPrice(row, null, false, now)]
  const best = options.reduce((low, option) => (option.unitMinor < low.unitMinor ? option : low))
  const variantStock = row.variants.length ? (row.variants.some((variant) => variant.stock < 0) ? -1 : row.variants.reduce((sum, variant) => sum + Math.max(0, variant.stock), 0)) : -1
  const inStock = row.stock !== 0 && (!row.variants.length || row.variants.some((variant) => variant.stock !== 0))
  const stock = sellableStock(row.stock, variantStock)
  const threshold = row.lowStockAt || lowStockDefault
  return {
    id: row.id, slug: row.slug, name: row.name, image: row.image, brand: row.brand?.name || '', category: row.category?.name || '', kind: row.kind, instant: deliversInstantly(row),
    price: minorToNumber(best.unitMinor, best.currency), listPrice: best.listMinor ? minorToNumber(best.listMinor, best.currency) : 0,
    discount: best.listMinor ? discountPercent(best.unitMinor, best.listMinor) : 0, currency: best.currency,
    inStock, lowStock: inStock && stock >= 0 && stock <= threshold ? stock : 0,
    rating: rating?.rating || 0, ratingCount: rating?.count || 0, soldCount: row.soldCount, views: row.views,
    saleEndsAt: best.listMinor && row.saleEndsAt ? row.saleEndsAt.toISOString() : null,
    hasVariants: row.variants.length > 0, vipOnly: row.access === 'MEMBERS', createdAt: row.createdAt.toISOString(),
    excerpt: row.shortDescription || richTextToPlain(row.description, 140),
  }
}

async function cards(rows: CardRow[]) {
  const [rated, settings] = await Promise.all([ratings(rows.map((row) => row.id)), getStoreSettings()])
  const now = new Date()
  return rows.map((row) => toCard(row, rated.get(row.id), settings.lowStockDefault, now))
}

export async function productCards(where: Prisma.ProductWhereInput, orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ id: 'desc' }], take = 12) {
  const rows = await db.product.findMany({ where: { AND: [{ active: true, approval: 'APPROVED', audienceGroups: '' }, where] }, orderBy, take, include: CARD_INCLUDE }).catch(() => [] as CardRow[])
  return cards(rows)
}

/** Dashboard service discovery uses the same cards/pricing and canonical audience rules. */
export async function memberServiceCards(query = '', foreign = false, page = 1) {
  const q = query.trim().slice(0, 80), current = Number.isSafeInteger(page) ? Math.max(1, Math.min(1000, page)) : 1
  const where: Prisma.ProductWhereInput = { active: true, approval: 'APPROVED', kind: 'VIRTUAL', digitalMode: { not: 'FILES' }, ...(foreign ? { openAmount: true } : {}), ...(await audienceClause('product')), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { shortDescription: { contains: q, mode: 'insensitive' } }] } : {}) }
  const [rows, total] = await Promise.all([db.product.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }], skip: (current - 1) * 12, take: 12, include: CARD_INCLUDE }), db.product.count({ where })])
  return { items: await cards(rows), total, page: current, pages: Math.max(1, Math.ceil(total / 12)) }
}

// ------------------------------------------------------------------ categories

export type CategoryNode = { id: number; slug: string; name: string; image: string; icon: string; description: string; parentId: number | null; kind: string; count: number; total: number; children: CategoryNode[] }

/** Which products each category holds, as main or further category (sets, so a product counts once per branch). */
async function membership(where: Prisma.ProductWhereInput) {
  const [own, extra] = await Promise.all([
    db.product.findMany({ where: { ...where, categoryId: { not: null } }, select: { id: true, categoryId: true } }).catch(() => []),
    db.productCategoryAssignment.findMany({ where: { product: where }, select: { productId: true, categoryId: true } }).catch(() => []),
  ])
  const map = new Map<number, Set<number>>()
  const add = (categoryId: number, productId: number) => { let set = map.get(categoryId); if (!set) map.set(categoryId, set = new Set()); set.add(productId) }
  for (const row of own) add(row.categoryId!, row.id)
  for (const row of extra) add(row.categoryId, row.productId)
  return map
}

/** The distinct products of a category and everything under it (a loop in the tree is cut). */
function branchSets(members: Map<number, Set<number>>) {
  const memo = new Map<number, Set<number>>()
  const of = (node: { id: number; children: { id: number; children: unknown[] }[] }, path: Set<number> = new Set()): Set<number> => {
    const known = memo.get(node.id)
    if (known) return known
    if (path.has(node.id)) return new Set()
    path.add(node.id)
    const all = new Set(members.get(node.id) || [])
    for (const child of node.children as { id: number; children: { id: number; children: unknown[] }[] }[]) for (const id of of(child, path)) all.add(id)
    path.delete(node.id)
    memo.set(node.id, all)
    return all
  }
  return of
}

/** Whole product-category tree with direct and subtree product counts (active products). */
export const categoryTree = cache(async (): Promise<CategoryNode[]> => {
  const [rows, members] = await Promise.all([
    db.productCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    membership({ active: true, approval: 'APPROVED', audienceGroups: '' }),
  ])
  const direct = new Map([...members].map(([id, set]) => [id, set.size]))
  const nodes = new Map<number, CategoryNode>(rows.map((row) => [row.id, { id: row.id, slug: row.slug, name: row.name, image: row.image, icon: row.icon, description: row.description, parentId: row.parentId, kind: row.kind, count: direct.get(row.id) || 0, total: 0, children: [] }]))
  const roots: CategoryNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }
  const setOf = branchSets(members)
  const fill = (node: CategoryNode, depth = 0) => { node.total = setOf(node).size; if (depth < 20) node.children.forEach((child) => fill(child, depth + 1)) }
  roots.forEach((root) => fill(root))
  return roots
})

export function findCategory(tree: CategoryNode[], slug: string): { node: CategoryNode; chain: CategoryNode[] } | null {
  const walk = (nodes: CategoryNode[], chain: CategoryNode[]): { node: CategoryNode; chain: CategoryNode[] } | null => {
    for (const node of nodes) {
      if (node.slug === slug) return { node, chain: [...chain, node] }
      const found = walk(node.children, [...chain, node])
      if (found) return found
    }
    return null
  }
  return walk(tree, [])
}

const subtreeIds = (node: CategoryNode): number[] => [node.id, ...node.children.flatMap(subtreeIds)]

// ------------------------------------------------------------------ landing

export async function shopHome() {
  const settings = await getStoreSettings()
  const now = new Date()
  const [tree, offersRaw, bestselling, newest, popular, brands] = await Promise.all([
    categoryTree(),
    productCards({ compareAtMinor: { gt: 0 }, OR: [{ saleEndsAt: null }, { saleEndsAt: { gt: now } }] }, [{ saleEndsAt: 'asc' }, { soldCount: 'desc' }], 24),
    productCards({}, [{ soldCount: 'desc' }, { id: 'desc' }], 12),
    productCards({}, [{ createdAt: 'desc' }], 12),
    productCards({}, [{ views: 'desc' }, { id: 'desc' }], 12),
    settings.showBrands ? db.productBrand.findMany({ where: { products: { some: { active: true, approval: 'APPROVED', audienceGroups: '' } } }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }], take: 18, select: { id: true, slug: true, name: true, logo: true } }) : Promise.resolve([]),
  ])
  const offers = offersRaw.filter((card) => card.discount > 0).slice(0, 12)
  // One rail per top-level category that has enough products (up to three).
  const rails = await Promise.all(tree.filter((node) => node.total >= 4).slice(0, 3).map(async (node) => ({
    category: { slug: node.slug, name: node.name },
    products: await productCards(inCategories(subtreeIds(node)), [{ featured: 'desc' }, { soldCount: 'desc' }, { id: 'desc' }], 12),
  })))
  return { settings, categories: tree, offers, bestselling, newest, popular, brands, rails }
}

// ------------------------------------------------------------------ the two halves of the shop

export type DivisionCategory = { slug: string; name: string; image: string; icon: string; total: number; children: { slug: string; name: string; total: number }[] }
export type ShopDivision = { kind: 'PHYSICAL' | 'VIRTUAL'; total: number; categories: DivisionCategory[]; products: ProductCard[] }

/**
 * The shop as its two halves — goods that are shipped and products that are delivered online. Each half
 * carries the categories (with their sub-categories) that hold products of its kind, counted for that kind only.
 */
export async function shopDivisions(): Promise<ShopDivision[]> {
  const tree = await categoryTree()
  return Promise.all((['PHYSICAL', 'VIRTUAL'] as const).map(async (kind) => {
    const where = { active: true, approval: 'APPROVED', audienceGroups: '', kind }
    const [members, total, products] = await Promise.all([
      membership(where),
      db.product.count({ where }).catch(() => 0),
      productCards({ kind }, [{ featured: 'desc' }, { soldCount: 'desc' }, { id: 'desc' }], 12),
    ])
    // Counted for this kind only; a product ticked under a parent and its child counts once.
    const setOf = branchSets(members)
    const categories = tree.map((node) => {
      const children = node.children.map((child) => ({ slug: child.slug, name: child.name, total: setOf(child).size })).filter((child) => child.total > 0)
      return { slug: node.slug, name: node.name, image: node.image, icon: node.icon, total: setOf(node).size, children }
    }).filter((node, index) => node.total > 0 && (tree[index].kind === '' || tree[index].kind === kind)).sort((a, b) => b.total - a.total)
    return { kind, total, categories, products }
  }))
}

// ------------------------------------------------------------------ listing

const LISTING_CAP = 2000

export async function shopListing(query: ShopQuery, pageSize = 24) {
  const tree = await categoryTree()
  const found = query.category ? findCategory(tree, query.category) : null
  const where: Prisma.ProductWhereInput = { active: true, approval: 'APPROVED', ...(await audienceClause('product')) }
  // A product is found under its main category and under the further ones ticked for it.
  if (found) where.AND = [inCategories(subtreeIds(found.node))]
  if (query.kind) where.kind = query.kind
  if (query.files) { where.kind = 'VIRTUAL'; where.digitalMode = 'FILES'; where.files = { some: { active: true } } }
  if (query.q) where.OR = [{ name: { contains: query.q } }, { nameEn: { contains: query.q } }, { sku: { contains: query.q } }, { shortDescription: { contains: query.q } }, { brand: { name: { contains: query.q } } }]
  const brandFilter: Prisma.ProductWhereInput = query.brands.length ? { brand: { slug: { in: query.brands } } } : {}

  // Brand facet counts ignore the brand filter itself (so choosing one brand still lists the others).
  const [rows, brandCounts] = await Promise.all([
    db.product.findMany({ where: { ...where, ...brandFilter }, include: CARD_INCLUDE, take: LISTING_CAP, orderBy: { id: 'desc' } }),
    db.product.groupBy({ by: ['brandId'], where: { ...where, brandId: { not: null } }, _count: { _all: true } }),
  ])
  const all = await cards(rows)
  const priceBounds = all.length ? { min: Math.min(...all.map((card) => card.price)), max: Math.max(...all.map((card) => card.price)) } : { min: 0, max: 0 }
  // What a product offers per specification: its own value plus every value of its active variants (colour, size…).
  const specsOf = new Map(rows.map((row) => [row.id, offeredSpecs(row)]))
  const offers = (card: ProductCard, key: string, values: string[]) => { const have = specsOf.get(card.id)?.get(key); return !!have && values.some((value) => have.has(value)) }
  // Every filter but one (the facet being counted sees the others, not itself).
  const keep = (card: ProductCard, skip = '') =>
    (skip === 'price' || ((!query.min || card.price >= query.min) && (!query.max || card.price <= query.max)))
    && (skip === 'available' || !query.available || card.inStock)
    && (skip === 'discounted' || !query.discounted || card.discount > 0)
    && (skip === 'rating' || !query.rating || card.rating >= query.rating)
    && (skip === 'instant' || !query.instant || card.instant)
    && Object.entries(query.specs).every(([key, values]) => skip === `spec:${key}` || offers(card, key, values))
  const list = all.filter((card) => keep(card))
  const fields = await specFields(rows)
  const specFacets = fields.map((field) => {
    const counts = new Map<string, number>()
    for (const card of all) if (keep(card, `spec:${field.key}`)) for (const value of specsOf.get(card.id)?.get(field.key) || []) counts.set(value, (counts.get(value) || 0) + 1)
    const order = (value: string) => { const at = field.options.indexOf(value); return at < 0 ? 999 : at }
    const values = [...new Set([...counts.keys(), ...(query.specs[field.key] || [])])].map((value) => ({ value, count: counts.get(value) || 0 })).sort((a, b) => order(a.value) - order(b.value) || b.count - a.count || a.value.localeCompare(b.value, 'fa'))
    // A colour field, or a choice whose every value is a known colour name, is drawn with dots.
    return { key: field.key, label: field.label, color: field.kind === 'color' || (values.length > 0 && values.every((item) => !!colorSwatch(item.value))), values }
  }).filter((facet) => facet.values.length > 1 || (query.specs[facet.key]?.length ?? 0) > 0)
  const counted = (skip: string, test: (card: ProductCard) => boolean) => all.filter((card) => keep(card, skip) && test(card)).length
  const toggles = {
    available: counted('available', (card) => card.inStock),
    discounted: counted('discounted', (card) => card.discount > 0),
    instant: counted('instant', (card) => card.instant),
    rating4: counted('rating', (card) => card.rating >= 4),
    rating3: counted('rating', (card) => card.rating >= 3),
  }
  const by: Record<ShopQuery['sort'], (a: ProductCard, b: ProductCard) => number> = {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    bestselling: (a, b) => b.soldCount - a.soldCount || b.id - a.id,
    views: (a, b) => b.views - a.views || b.id - a.id,
    cheap: (a, b) => a.price - b.price,
    expensive: (a, b) => b.price - a.price,
    discount: (a, b) => b.discount - a.discount || a.price - b.price,
  }
  // Out-of-stock items sink to the end whatever the order (Digikala behaviour).
  list.sort((a, b) => Number(b.inStock) - Number(a.inStock) || by[query.sort](a, b))
  const total = list.length
  // Ready price ranges only when every listed price is in one currency.
  const priced = all.filter((card) => keep(card, 'price'))
  const oneCurrency = new Set(priced.map((card) => card.currency)).size === 1
  const priceSteps = oneCurrency ? priceBuckets(priced.map((card) => card.price)) : []
  // The slider's ends: the cheapest and dearest of what the other filters leave, in one currency only.
  const priceRange = oneCurrency && priced.length > 1 ? { min: Math.floor(Math.min(...priced.map((card) => card.price))), max: Math.ceil(Math.max(...priced.map((card) => card.price))) } : null
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(query.page, pages)
  const brandIds = brandCounts.map((row) => row.brandId!).filter(Boolean)
  const brandRows = brandIds.length ? await db.productBrand.findMany({ where: { id: { in: brandIds } }, select: { id: true, slug: true, name: true, logo: true } }) : []
  const countOf = new Map(brandCounts.map((row) => [row.brandId, row._count._all]))
  return {
    tree,
    category: found,
    products: list.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pages,
    capped: rows.length >= LISTING_CAP,
    priceBounds,
    priceSteps,
    priceRange,
    specFacets,
    toggles,
    brands: brandRows.map((brand) => ({ ...brand, count: countOf.get(brand.id) || 0 })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fa')),
    currency: list[0]?.currency || rows[0]?.currency || 'IRT',
  }
}

/** A product's own specification values and those of its active variants, per key. */
function offeredSpecs(row: { specifications: string; variants: { attributes: string }[] }) {
  const out = new Map<string, Set<string>>()
  const add = (key: string, value: string) => { if (!out.has(key)) out.set(key, new Set()); out.get(key)!.add(value) }
  for (const [key, value] of Object.entries(readSpecs(row.specifications))) add(key, value)
  for (const variant of row.variants) for (const [key, value] of Object.entries(readSpecs(variant.attributes))) add(key, value)
  return out
}

/** A product's specifications as stored (key → text); anything malformed reads as none. */
function readSpecs(value: string | null | undefined): Record<string, string> {
  try {
    const raw = JSON.parse(value || '{}')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).filter(([, item]) => typeof item === 'string' && item.trim()).map(([key, item]) => [key, String(item).trim()])) : {}
  } catch { return {} }
}

/**
 * The specification fields the listed products can be narrowed by: the choice fields (and colours) of the
 * attribute groups their categories use (own or nearest ancestor's), and text fields that repeat a few values.
 */
async function specFields(rows: { categoryId: number | null; specifications: string; variants: { attributes: string }[] }[]): Promise<AttributeField[]> {
  const ids = [...new Set(rows.map((row) => row.categoryId).filter((id): id is number => !!id))]
  if (!ids.length) return []
  const categories = await db.productCategory.findMany({ select: { id: true, parentId: true, attributeGroupId: true } }).catch(() => [])
  const byId = new Map(categories.map((row) => [row.id, row]))
  const groupOf = (id: number) => { for (let at = byId.get(id), guard = 0; at && guard < 20; at = at.parentId ? byId.get(at.parentId) : undefined, guard++) if (at.attributeGroupId) return at.attributeGroupId; return null }
  const groupIds = [...new Set(ids.map(groupOf).filter((id): id is number => !!id))]
  if (!groupIds.length) return []
  const groups = await db.productAttributeGroup.findMany({ where: { id: { in: groupIds } }, select: { fields: true } }).catch(() => [])
  const seen = new Set<string>(), fields: AttributeField[] = []
  for (const group of groups) for (const field of parseJson<AttributeField[]>(group.fields, [])) {
    if (!field?.key || seen.has(field.key)) continue
    seen.add(field.key)
    if (field.kind === 'select' || field.kind === 'color') { fields.push(field); continue }
    const values = new Set(rows.flatMap((row) => [...(offeredSpecs(row).get(field.key) || [])]))
    if (values.size >= 2 && values.size <= 12) fields.push({ ...field, options: [] })
  }
  return fields.slice(0, 10)
}

/** Four price ranges with round edges from the listed prices (none for a handful of products). */
export function priceBuckets(prices: number[]): { min: number; max: number }[] {
  const sorted = prices.filter((price) => price > 0).sort((a, b) => a - b)
  if (sorted.length < 6) return []
  const round = (value: number) => { const step = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1); return Math.max(step, Math.round(value / step) * step) }
  const edges = [...new Set([0.25, 0.5, 0.75].map((at) => round(sorted[Math.floor(at * (sorted.length - 1))])))].sort((a, b) => a - b)
  if (!edges.length) return []
  return [{ min: 0, max: edges[0] }, ...edges.slice(1).map((edge, index) => ({ min: edges[index], max: edge })), { min: edges[edges.length - 1], max: 0 }]
}

// ------------------------------------------------------------------ one half of the shop

/** Front page data of one half of the shop (digital or physical): its own offers, best sellers, categories and brands. */
export async function shopDivisionHome(kind: 'PHYSICAL' | 'VIRTUAL') {
  const settings = await getStoreSettings()
  const now = new Date()
  const [divisions, tree, offersRaw, bestselling, newest, popular, brands] = await Promise.all([
    shopDivisions(),
    categoryTree(),
    productCards({ kind, compareAtMinor: { gt: 0 }, OR: [{ saleEndsAt: null }, { saleEndsAt: { gt: now } }] }, [{ saleEndsAt: 'asc' }, { soldCount: 'desc' }], 24),
    productCards({ kind }, [{ soldCount: 'desc' }, { id: 'desc' }], 12),
    productCards({ kind }, [{ createdAt: 'desc' }], 12),
    productCards({ kind }, [{ views: 'desc' }, { id: 'desc' }], 12),
    settings.showBrands ? db.productBrand.findMany({ where: { products: { some: { active: true, approval: 'APPROVED', audienceGroups: '', kind } } }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }], take: 18, select: { id: true, slug: true, name: true, logo: true } }).catch(() => []) : [],
  ])
  const division = divisions.find((item) => item.kind === kind) || { kind, total: 0, categories: [], products: [] }
  const nodes = new Map<string, CategoryNode>()
  const walk = (list: CategoryNode[]) => { for (const node of list) { nodes.set(node.slug, node); walk(node.children) } }
  walk(tree)
  // One rail per category of this half that has enough of its products (up to four).
  const rails = (await Promise.all(division.categories.slice(0, 4).map(async (category) => {
    const node = nodes.get(category.slug)
    const products = node ? await productCards({ kind, ...inCategories(subtreeIds(node)) }, [{ featured: 'desc' }, { soldCount: 'desc' }, { id: 'desc' }], 12) : []
    return { category: { slug: category.slug, name: category.name }, products }
  }))).filter((rail) => rail.products.length >= 3)
  return { settings, division, offers: offersRaw.filter((card) => card.discount > 0).slice(0, 12), bestselling, newest, popular, brands, rails }
}

// ------------------------------------------------------------------ product page

export async function relatedProducts(product: { id: number; categoryId: number | null; brandId: number | null }, take = 12) {
  const ids = (await getStoreSettings()).showProductRelationships ? await publicProductRelationshipIds(product.id, 'RELATED', take) : []
  const explicit = ids.length ? await productCards({ id: { in: ids } }, [{ id: 'asc' }], take) : []
  const cardsById = new Map(explicit.map(card => [card.id, card]))
  const ordered = ids.flatMap(id => cardsById.has(id) ? [cardsById.get(id)!] : [])
  if (ordered.length >= take) return ordered.slice(0, take)
  const same = await productCards({ id: { notIn: [product.id, ...ordered.map(card => card.id)] }, ...(product.categoryId ? { categoryId: product.categoryId } : product.brandId ? { brandId: product.brandId } : {}) }, [{ soldCount: 'desc' }, { id: 'desc' }], take - ordered.length)
  if (ordered.length + same.length >= 4 || !product.categoryId) return [...ordered, ...same]
  const more = await productCards({ id: { notIn: [product.id, ...ordered.map(card => card.id), ...same.map(card => card.id)] } }, [{ soldCount: 'desc' }], take - ordered.length - same.length)
  return [...ordered, ...same, ...more]
}

/** Best-effort view counter (never blocks the page). */
export function countProductView(id: number) {
  void db.product.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => {})
}

export async function brandBySlug(slug: string) {
  return db.productBrand.findUnique({ where: { slug } })
}

// ------------------------------------------------------------------ file store

/** What a file product's card shows about its files: never a download address, only their kinds, count and size. */
export type FileCard = ProductCard & { files: { count: number; bytes: number; types: string[] } }
const FILE_WHERE = { kind: 'VIRTUAL', digitalMode: 'FILES', files: { some: { active: true } } } satisfies Prisma.ProductWhereInput
const fileType = (name: string) => { const ext = name.split('.').pop()?.toUpperCase() || ''; return /^[A-Z0-9]{2,5}$/.test(ext) && ext !== name.toUpperCase() ? ext : 'FILE' }

async function fileCards(where: Prisma.ProductWhereInput, orderBy: Prisma.ProductOrderByWithRelationInput[], take: number): Promise<FileCard[]> {
  const list = await productCards({ AND: [FILE_WHERE, where] }, orderBy, take)
  if (!list.length) return []
  const rows = await db.productFile.findMany({ where: { productId: { in: list.map((card) => card.id) }, active: true }, select: { productId: true, filename: true, sizeBytes: true } }).catch(() => [])
  const by = new Map<number, { count: number; bytes: number; types: string[] }>()
  for (const row of rows) {
    const entry = by.get(row.productId) || { count: 0, bytes: 0, types: [] }
    entry.count += 1; entry.bytes += Number(row.sizeBytes)
    const type = fileType(row.filename); if (!entry.types.includes(type)) entry.types.push(type)
    by.set(row.productId, entry)
  }
  return list.map((card) => ({ ...card, files: by.get(card.id) || { count: 0, bytes: 0, types: [] } }))
}

/** The file store's own front: its numbers, categories, a spotlight, and new, best-selling and free files. */
export async function fileStoreHome() {
  const settings = await getStoreSettings()
  const [newest, bestselling, popular, total, totals, categories] = await Promise.all([
    fileCards({}, [{ createdAt: 'desc' }], 12),
    fileCards({}, [{ soldCount: 'desc' }, { id: 'desc' }], 8),
    fileCards({}, [{ views: 'desc' }, { id: 'desc' }], 8),
    db.product.count({ where: { AND: [publicProductWhere, FILE_WHERE] } }).catch(() => 0),
    db.productFile.aggregate({ where: { active: true, product: { AND: [publicProductWhere, FILE_WHERE] } }, _count: { _all: true }, _sum: { sizeBytes: true } }).catch(() => null),
    db.productCategory.findMany({ where: { products: { some: { AND: [publicProductWhere, FILE_WHERE] } } }, select: { slug: true, name: true, image: true, _count: { select: { products: { where: { AND: [publicProductWhere, FILE_WHERE] } } } } }, orderBy: { sortOrder: 'asc' }, take: 12 }).catch(() => []),
  ])
  const sold = bestselling.reduce((sum, card) => sum + card.soldCount, 0)
  const spotlight = bestselling.find((card) => card.soldCount > 0 && card.image) || newest.find((card) => card.image) || newest[0] || null
  return {
    settings, newest, bestselling: bestselling.filter((card) => card.soldCount > 0), popular: popular.filter((card) => card.views > 0), spotlight,
    stats: { products: total, files: totals?._count._all || 0, bytes: Number(totals?._sum.sizeBytes || 0), sold },
    categories: categories.map((row) => ({ slug: row.slug, name: row.name, image: row.image, total: row._count.products })).filter((row) => row.total > 0),
  }
}
