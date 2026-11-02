import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { productInput, saveVariants } from '@/modules/catalog/server/product-input'
import { capturePublicProductPrices, prepareProductPriceCapture } from '@/modules/catalog/server/price-history'
import { attributeGroupForCategory } from '@/modules/catalog/server/product-config'
import { contentChanged } from '@/modules/content/server/events'
import { minorToNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { MarketplaceError } from '@/modules/marketplace/domain/marketplace'
import { type SellerRow, notifyAdmins } from '@/modules/marketplace/server/marketplace/identity'
import { getMarketplaceSettings } from '@/modules/marketplace/server/marketplace/core'

const SELLER_FIELDS = ['name', 'nameEn', 'slug', 'categoryId', 'brandId', 'kind', 'price', 'compareAtPrice', 'stock', 'sku', 'image', 'gallery', 'shortDescription', 'description', 'weightGrams', 'warranty', 'maxPerOrder', 'specifications', 'variants', 'currency'] as const

function sellerBody(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const key of SELLER_FIELDS) if (input[key] !== undefined) out[key] = input[key]
  return out
}

export async function sellerProducts(sellerId: number, input: { q?: string; status?: string; page?: number }) {
  const where: Prisma.ProductWhereInput = { sellerId }
  if (input.status === 'active') Object.assign(where, { active: true })
  if (input.status === 'inactive') Object.assign(where, { active: false, approval: 'APPROVED' })
  if (input.status === 'pending') Object.assign(where, { approval: 'PENDING' })
  if (input.status === 'rejected') Object.assign(where, { approval: 'REJECTED' })
  if (input.status === 'out') Object.assign(where, { stock: 0 })
  const q = String(input.q || '').trim().slice(0, 80)
  if (q) where.OR = [{ name: { contains: q } }, { sku: { contains: q } }]
  const page = Math.max(1, Number(input.page) || 1)
  const [rows, total, counts] = await Promise.all([
    db.product.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * 30, take: 30, include: { category: { select: { name: true } }, variants: { where: { active: true }, select: { id: true } } } }),
    db.product.count({ where }),
    db.product.groupBy({ by: ['approval'], where: { sellerId }, _count: { _all: true } }),
  ])
  return {
    rows: rows.map((row) => ({
      id: row.id, slug: row.slug, name: row.name, image: row.image, category: row.category?.name || '', price: minorToNumber(row.priceMinor, row.currency), currency: row.currency,
      stock: row.stock, active: row.active, approval: row.approval, approvalNote: row.approvalNote, soldCount: row.soldCount, views: row.views, variants: row.variants.length, updatedAt: row.updatedAt.toISOString(),
    })),
    total, page, pages: Math.max(1, Math.ceil(total / 30)),
    counts: Object.fromEntries(counts.map((row) => [row.approval, row._count._all])),
  }
}

export async function sellerProduct(sellerId: number, id: number) {
  const row = await db.product.findFirst({ where: { id, sellerId }, include: { variants: { where: { active: true }, orderBy: { id: 'asc' } } } })
  if (!row) throw new MarketplaceError('محصول پیدا نشد', 404)
  const price = (minor: bigint) => (minor ? minorToNumber(minor, row.currency) : '')
  return {
    id: row.id, name: row.name, nameEn: row.nameEn, slug: row.slug, categoryId: row.categoryId, brandId: row.brandId, kind: row.kind,
    price: minorToNumber(row.priceMinor, row.currency), compareAtPrice: price(row.compareAtMinor), currency: row.currency, stock: row.stock, sku: row.sku,
    image: row.image, gallery: JSON.parse(row.gallery || '[]'), shortDescription: row.shortDescription, description: row.description, weightGrams: row.weightGrams,
    warranty: row.warranty, maxPerOrder: row.maxPerOrder, specifications: JSON.parse(row.specifications || '{}'), active: row.active, approval: row.approval, approvalNote: row.approvalNote,
    variants: row.variants.map((v) => ({ id: v.id, sku: v.sku, name: v.name, attributes: JSON.parse(v.attributes || '{}'), price: minorToNumber(v.priceMinor, row.currency), compareAt: v.compareAtMinor ? minorToNumber(v.compareAtMinor, row.currency) : '', stock: v.stock, active: v.active })),
  }
}

/** Category fields (specifications and variant attributes) for the seller's product form. */
export async function categoryForm(categoryId: number) {
  const { fields, appliesTo } = await attributeGroupForCategory(categoryId)
  return { fields, appliesTo }
}

export async function saveSellerProduct(seller: SellerRow, input: Record<string, unknown>, id?: number) {
  const settings = await getMarketplaceSettings()
  const body: Record<string, unknown> = { ...sellerBody(input), currency: input.currency || 'IRT' }
  // Seller slugs are namespaced so they never collide with the shop's own products.
  if (!id && !String(body.slug || '').trim()) body.slug = `s${seller.id}-${Date.now().toString(36)}`
  if (body.slug !== undefined && !/^[a-z0-9-]{3,80}$/.test(String(body.slug))) throw new MarketplaceError('نامک محصول فقط حروف انگلیسی کوچک، عدد و خط تیره')
  // Sellers rarely keep SKUs; a variant without one gets a unique shop-scoped code.
  if (Array.isArray(body.variants)) {
    const stamp = Date.now().toString(36)
    body.variants = body.variants.slice(0, 100).map((variant: Record<string, unknown>, index: number) => ({ ...variant, sku: String(variant?.sku || '').trim() || `S${seller.id}-${stamp}-${index + 1}` }))
  }
  if (id) {
    const current = await db.product.findFirst({ where: { id, sellerId: seller.id }, select: { price: true, currency: true, categoryId: true, specifications: true, faqs: true, gallery: true, kind: true, stock: true, active: true, approval: true, audienceGroups: true, name: true, priceMinor: true } })
    if (!current) throw new MarketplaceError('محصول پیدا نشد', 404)
    const parsed = await productInput(body, current).catch((error: Error) => { throw new MarketplaceError(error.message) })
    // A rejected product goes back to review when edited.
    const approval = current.approval === 'REJECTED' ? (settings.autoApproveProducts ? 'APPROVED' : 'PENDING') : current.approval
    const saved = await db.$transaction(async (tx) => {
      const pricesBefore = await prepareProductPriceCapture(tx, id)
      const row = await tx.product.update({ where: { id }, data: { ...(parsed.data as Prisma.ProductUpdateInput), approval, ...(approval !== 'APPROVED' ? { active: false } : {}) } })
      if (parsed.variants) await saveVariants(tx, id, parsed.variants)
      await capturePublicProductPrices(tx, id, pricesBefore)
      return row
    }).catch((error: { code?: string }) => { throw error?.code === 'P2002' ? new MarketplaceError('این نامک یا کد تنوع (SKU) تکراری است', 409) : error })
    contentChanged({ type: 'product', id }, current, saved)
    if (approval === 'PENDING' && current.approval === 'REJECTED') await notifyAdmins('محصول ویرایش‌شده منتظر بررسی', `«${saved.name}» از ${seller.shopName}`, '/admin/marketplace?tab=products', `product-review:${id}:${Date.now()}`)
    return saved
  }
  const parsed = await productInput(body).catch((error: Error) => { throw new MarketplaceError(error.message) })
  const approval = settings.autoApproveProducts ? 'APPROVED' : 'PENDING'
  const created = await db.$transaction(async (tx) => {
    const row = await tx.product.create({ data: { ...(parsed.data as Prisma.ProductUncheckedCreateInput), sellerId: seller.id, approval, active: approval === 'APPROVED', featured: false } })
    if (parsed.variants) await saveVariants(tx, row.id, parsed.variants)
    await capturePublicProductPrices(tx, row.id, new Map())
    return row
  }).catch((error: { code?: string }) => { throw error?.code === 'P2002' ? new MarketplaceError('این نامک یا SKU تکراری است', 409) : error })
  contentChanged({ type: 'product', id: created.id }, null, created)
  if (approval === 'PENDING') await notifyAdmins('محصول تازهٔ فروشنده', `«${created.name}» از ${seller.shopName} منتظر بررسی است.`, '/admin/marketplace?tab=products', `product-review:${created.id}`)
  return created
}

/** Seller switches a product on/off (only approved products can go live) or updates stock. */
export async function quickUpdate(seller: SellerRow, id: number, input: { active?: unknown; stock?: unknown; price?: unknown }) {
  const product = await db.product.findFirst({ where: { id, sellerId: seller.id } })
  if (!product) throw new MarketplaceError('محصول پیدا نشد', 404)
  const data: Prisma.ProductUpdateInput = {}
  if (input.active !== undefined) {
    if (input.active === true && product.approval !== 'APPROVED') throw new MarketplaceError('محصول پس از تأیید مدیر قابل انتشار است', 409)
    data.active = input.active === true
  }
  if (input.stock !== undefined) {
    const stock = input.stock === '' ? -1 : Number(input.stock)
    if (!Number.isSafeInteger(stock) || stock < -1 || stock > 1_000_000) throw new MarketplaceError('موجودی معتبر نیست')
    data.stock = stock
  }
  if (input.price !== undefined) {
    const priceMinor = toMinor(String(input.price), normalizeCurrency(product.currency, 'IRT'))
    if (priceMinor <= 0n) throw new MarketplaceError('قیمت معتبر نیست')
    if (product.compareAtMinor && product.compareAtMinor <= priceMinor) data.compareAtMinor = 0n
    data.priceMinor = priceMinor
    data.price = minorToNumber(priceMinor, product.currency)
  }
  return db.$transaction(async tx => {
    const pricesBefore = await prepareProductPriceCapture(tx, id)
    const saved = await tx.product.update({ where: { id }, data })
    await capturePublicProductPrices(tx, id, pricesBefore)
    return saved
  })
}
