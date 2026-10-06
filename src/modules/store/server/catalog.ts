import type { Prisma } from '@prisma/client'
import { deliversInstantly } from '@/modules/store/domain/digital-codes'
import { cache } from 'react'
import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { richTextToPlain } from '@/shared/content/sanitize'
import { minorToNumber } from '@/shared/money'
import { unitPrice } from '@/modules/store/server/pricing'
import { publicProductRelationshipIds } from '@/modules/catalog/server/product-relationships'
import {
  DEFAULT_STORE_SETTINGS, discountPercent, normalizeStoreSettings, type ShopQuery, type StoreSettings,
} from '@/modules/store/domain/store'

// Storefront reads: product cards, the shop landing rails, the filtered
// listing with facets and related products. Prices are the regular (non-VIP)
// prices; VIP pricing is applied on the product page, in the cart and at checkout.

const SETTINGS_KEY = 'store.merchandising.v1'

export async function getStoreSettings(): Promise<StoreSettings> {
  const stored = await readJsonSetting(SETTINGS_KEY)
  return stored ? normalizeStoreSettings(stored, DEFAULT_STORE_SETTINGS) : structuredClone(DEFAULT_STORE_SETTINGS)
}

export async function saveStoreSettings(input: unknown) {
  const next = normalizeStoreSettings(input, await getStoreSettings())
  await writeJsonSetting(SETTINGS_KEY, next)
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
  variants: { where: { active: true }, select: { id: true, price: true, priceMinor: true, memberPriceMinor: true, compareAtMinor: true, stock: true } },
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
  const stock = row.stock >= 0 ? (variantStock >= 0 ? Math.min(row.stock, variantStock) : row.stock) : variantStock
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
  const rows = await db.product.findMany({ where: { AND: [{ active: true, approval: 'APPROVED' }, where] }, orderBy, take, include: CARD_INCLUDE }).catch(() => [] as CardRow[])
  return cards(rows)
}

// ------------------------------------------------------------------ categories

export type CategoryNode = { id: number; slug: string; name: string; image: string; icon: string; description: string; parentId: number | null; count: number; total: number; children: CategoryNode[] }

/** Whole product-category tree with direct and subtree product counts (active products). */
export const categoryTree = cache(async (): Promise<CategoryNode[]> => {
  const [rows, counts] = await Promise.all([
    db.productCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    db.product.groupBy({ by: ['categoryId'], where: { active: true, approval: 'APPROVED' }, _count: { _all: true } }),
  ])
  const direct = new Map(counts.map((row) => [row.categoryId, row._count._all]))
  const nodes = new Map<number, CategoryNode>(rows.map((row) => [row.id, { id: row.id, slug: row.slug, name: row.name, image: row.image, icon: row.icon, description: row.description, parentId: row.parentId, count: direct.get(row.id) || 0, total: 0, children: [] }]))
  const roots: CategoryNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }
  const visiting = new Set<number>()
  const sum = (node: CategoryNode): number => {
    if (visiting.has(node.id)) return 0
    visiting.add(node.id)
    node.total = node.count + node.children.reduce((total, child) => total + sum(child), 0)
    return node.total
  }
  roots.forEach(sum)
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
    settings.showBrands ? db.productBrand.findMany({ where: { products: { some: { active: true, approval: 'APPROVED' } } }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }], take: 18, select: { id: true, slug: true, name: true, logo: true } }) : Promise.resolve([]),
  ])
  const offers = offersRaw.filter((card) => card.discount > 0).slice(0, 12)
  // One rail per top-level category that has enough products (up to three).
  const rails = await Promise.all(tree.filter((node) => node.total >= 4).slice(0, 3).map(async (node) => ({
    category: { slug: node.slug, name: node.name },
    products: await productCards({ categoryId: { in: subtreeIds(node) } }, [{ featured: 'desc' }, { soldCount: 'desc' }, { id: 'desc' }], 12),
  })))
  return { settings, categories: tree, offers, bestselling, newest, popular, brands, rails }
}

// ------------------------------------------------------------------ listing

const LISTING_CAP = 2000

export async function shopListing(query: ShopQuery, pageSize = 24) {
  const tree = await categoryTree()
  const found = query.category ? findCategory(tree, query.category) : null
  const where: Prisma.ProductWhereInput = { active: true, approval: 'APPROVED' }
  if (found) where.categoryId = { in: subtreeIds(found.node) }
  if (query.kind) where.kind = query.kind
  if (query.q) where.OR = [{ name: { contains: query.q } }, { nameEn: { contains: query.q } }, { sku: { contains: query.q } }, { shortDescription: { contains: query.q } }, { brand: { name: { contains: query.q } } }]
  const brandFilter: Prisma.ProductWhereInput = query.brands.length ? { brand: { slug: { in: query.brands } } } : {}

  // Brand facet counts ignore the brand filter itself (so choosing one brand still lists the others).
  const [rows, brandCounts] = await Promise.all([
    db.product.findMany({ where: { ...where, ...brandFilter }, include: CARD_INCLUDE, take: LISTING_CAP, orderBy: { id: 'desc' } }),
    db.product.groupBy({ by: ['brandId'], where: { ...where, brandId: { not: null } }, _count: { _all: true } }),
  ])
  let list = await cards(rows)
  const priceBounds = list.length ? { min: Math.min(...list.map((card) => card.price)), max: Math.max(...list.map((card) => card.price)) } : { min: 0, max: 0 }
  if (query.min) list = list.filter((card) => card.price >= query.min)
  if (query.max) list = list.filter((card) => card.price <= query.max)
  if (query.available) list = list.filter((card) => card.inStock)
  if (query.discounted) list = list.filter((card) => card.discount > 0)
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
    brands: brandRows.map((brand) => ({ ...brand, count: countOf.get(brand.id) || 0 })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fa')),
    currency: list[0]?.currency || rows[0]?.currency || 'IRT',
  }
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
