import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting, getSettings } from '@/modules/settings/server'
import { siteBase } from '@/modules/site/server/seo'
import { loadRouteAliases } from '@/modules/site/server/routes'
import { toPublicPath } from '@/shared/routing/aliases'
import { richTextToPlain } from '@/shared/content/sanitize'
import { attributeFieldsForCategory, parseJson } from '@/modules/catalog/server/product-config'
import { unitPrice } from '@/modules/store/server/pricing'
import { normalizeFeeds, toToman, type FeedProduct, type FeedSettings } from '@/modules/store/domain/feeds'

// Product feeds for Torob, Emalls and a generic XML feed (see domain/feeds.ts).

const KEY = 'store.feeds.v1'
export const getFeedSettings = async () => normalizeFeeds(await readJsonSetting(KEY))
export async function saveFeedSettings(input: unknown) {
  const previous = await getFeedSettings()
  const raw = input && typeof input === 'object' ? { ...(input as Record<string, unknown>) } : {}
  // An empty token field keeps the stored one; "-" clears it.
  if (raw.emallsToken === '') raw.emallsToken = previous.emallsToken
  if (raw.emallsToken === '-') raw.emallsToken = ''
  const next = normalizeFeeds(raw)
  await writeJsonSetting(KEY, next)
  return next
}

export const PER_PAGE = 100

type Filter = { ids?: number[]; slugs?: string[] }

async function where(settings: FeedSettings, filter: Filter = {}) {
  const excluded = settings.excludeCategories.length ? (await db.productCategory.findMany({ where: { slug: { in: settings.excludeCategories } }, select: { id: true } })).map((row) => row.id) : []
  return {
    active: true, access: 'PUBLIC', currency: { in: ['IRT', 'IRR', 'TMN'] },
    ...(settings.includeOutOfStock ? {} : { stock: { not: 0 } }),
    ...(excluded.length ? { OR: [{ categoryId: null }, { categoryId: { notIn: excluded } }] } : {}),
    ...(filter.ids ? { id: { in: filter.ids } } : {}),
    ...(filter.slugs ? { slug: { in: filter.slugs } } : {}),
  }
}

const absolute = (base: string, url: string) => (!url ? '' : /^https?:\/\//i.test(url) ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`)

/** One page of feed products (newest changes first) and the total count. */
export async function feedProducts(settings: FeedSettings, page: number, filter: Filter = {}): Promise<{ products: FeedProduct[]; total: number }> {
  const [condition, base, aliases] = await Promise.all([where(settings, filter), siteBase(), loadRouteAliases().catch(() => ({}))])
  const [rows, total] = await Promise.all([
    db.product.findMany({
      where: condition, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * PER_PAGE, take: PER_PAGE,
      include: { variants: { where: { active: true } }, category: { include: { parent: { include: { parent: true } } } }, brand: { select: { name: true } } },
    }),
    db.product.count({ where: condition }),
  ])
  const fieldCache = new Map<number, Awaited<ReturnType<typeof attributeFieldsForCategory>>>()
  const products: FeedProduct[] = []
  for (const product of rows) {
    // Lowest price among variants that can be bought; the product itself when it has none.
    const candidates = product.variants.length ? product.variants.filter((variant) => variant.stock !== 0) : [null]
    const priced = (candidates.length ? candidates : product.variants).map((variant) => unitPrice(product, variant, false))
    const best = priced.sort((a, b) => (a.unitMinor < b.unitMinor ? -1 : 1))[0]
    const price = best ? toToman(best.unitMinor, best.currency) : null
    if (price === null || price <= 0) continue
    const available = product.stock !== 0 && (!product.variants.length || product.variants.some((variant) => variant.stock !== 0))
    const path = [product.category?.parent?.parent?.name, product.category?.parent?.name, product.category?.name].filter((name): name is string => !!name)
    let specs: Record<string, string> = {}
    if (product.categoryId) {
      if (!fieldCache.has(product.categoryId)) fieldCache.set(product.categoryId, await attributeFieldsForCategory(product.categoryId).catch(() => []))
      const values = parseJson<Record<string, unknown>>(product.specifications, {})
      for (const field of fieldCache.get(product.categoryId) || []) {
        const value = values[field.key]
        if (value !== undefined && value !== null && String(value).trim()) specs[field.label] = Array.isArray(value) ? value.join('، ') : String(value).slice(0, 200)
      }
    }
    if (Object.keys(specs).length > 40) specs = Object.fromEntries(Object.entries(specs).slice(0, 40))
    const images = [product.image, ...parseJson<string[]>(product.gallery, [])].filter(Boolean).map((image) => absolute(base, image))
    products.push({
      id: product.id,
      title: `${product.name}${settings.titleSuffix ? ` ${settings.titleSuffix}` : ''}`.slice(0, 250),
      subtitle: product.nameEn || '',
      url: absolute(base, toPublicPath(`/products/${encodeURIComponent(product.slug)}`, aliases)),
      image: images[0] || '', images,
      price, oldPrice: best && best.listMinor > best.unitMinor ? toToman(best.listMinor, best.currency) || 0 : 0,
      available, category: product.category?.name || '', categoryPath: path, brand: product.brand?.name || '',
      description: product.shortDescription || richTextToPlain(product.description, 1000),
      guarantee: product.warranty || '', specs, createdAt: product.createdAt, updatedAt: product.updatedAt, sku: product.sku,
    })
  }
  return { products, total }
}

export async function shopInfo() {
  const [settings, base] = await Promise.all([getSettings().catch(() => ({} as Record<string, string>)), siteBase()])
  return { title: settings.brandName || settings.siteName || 'فروشگاه', url: base }
}

/** Admin overview: feed addresses and a sample of what the sites will see. */
export async function feedOverview() {
  const settings = await getFeedSettings()
  const base = await siteBase()
  const sample = await feedProducts({ ...settings, includeOutOfStock: true }, 1)
  const eligible = await db.product.count({ where: await where({ ...settings, includeOutOfStock: true }) })
  const skippedCurrency = await db.product.count({ where: { active: true, access: 'PUBLIC', currency: { notIn: ['IRT', 'IRR', 'TMN'] } } })
  return {
    settings: { ...settings, emallsToken: settings.emallsToken ? '••••' : '', hasEmallsToken: !!settings.emallsToken },
    urls: { torob: `${base}/api/feeds/torob`, emalls: `${base}/api/feeds/emalls${settings.emallsToken ? '?token=…' : ''}`, xml: `${base}/api/feeds/products.xml` },
    eligible, skippedCurrency,
    sample: sample.products.slice(0, 12).map((product) => ({ id: product.id, title: product.title, price: product.price, oldPrice: product.oldPrice, available: product.available, category: product.category, url: product.url, image: product.image })),
  }
}
