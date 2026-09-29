import { db } from '@/platform/database/prisma'
import { normalizeAccess } from '@/modules/membership/domain/membership'
import { cleanRichText, richTextToPlain } from '@/shared/content/sanitize'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { validateCover } from '@/shared/content/cover'
import { attributeGroupForCategory, validateFaqs, validateFields, validateGallery, validateSpecifications, validateVariants } from '@/modules/catalog/server/product-config'
import { applyFxToBody } from '@/modules/fx/server/fx'

/**
 * Product form → row data, shared by the store admin (CMS products) and the
 * seller panel (marketplace), so both follow exactly the same rules.
 */

function pick(b: any, keys: string[]) {
  const out: Record<string, unknown> = {}
  for (const k of keys) if (b?.[k] !== undefined) out[k] = b[k]
  return out
}

function sanitizeProduct(data: Record<string, unknown>) {
  if (data.sortOrder !== undefined) {
    const sortOrder = Number(data.sortOrder)
    if (!Number.isSafeInteger(sortOrder)) throw new Error('ترتیب نمایش معتبر نیست')
    data.sortOrder = sortOrder
  }
  for (const k of ['description', 'descriptionEn']) if (typeof data[k] === 'string') data[k] = cleanRichText(data[k] as string)
  return data
}

export async function productCategoryConfig(categoryId: unknown) {
  if (categoryId === '' || categoryId == null) return { categoryId: null, fields: [] as ReturnType<typeof validateFields>, appliesTo: 'ANY' }
  const id = Number(categoryId)
  if (!Number.isSafeInteger(id) || id <= 0) throw Error('Invalid category')
  return { categoryId: id, ...await attributeGroupForCategory(id) }
}

type FxExisting = { pricingMode?: string; fxCurrency?: string; fxAmountMinor?: bigint; fxCompareAtMinor?: bigint; fxMemberMinor?: bigint; markupBps?: number; markupFixedMinor?: bigint }

export async function productInput(input: any, existing?: { price: number; currency: string; categoryId: number | null; specifications: string; faqs: string; gallery: string; kind: string; stock: number } & FxExisting) {
  const currency = normalizeCurrency(input?.currency ?? existing?.currency ?? 'IRT')
  // A foreign-currency product: its prices are computed from the cost and the live rate.
  const fx = await applyFxToBody(input || {}, existing, currency)
  const b: any = fx.body
  const priceMinor = toMinor(String(b?.price ?? existing?.price ?? '0'), currency)
  const category = await productCategoryConfig(b?.categoryId !== undefined ? b.categoryId : existing?.categoryId)
  const kind = String(b?.kind ?? existing?.kind ?? 'VIRTUAL')
  if (!['VIRTUAL', 'PHYSICAL'].includes(kind)) throw Error('Invalid product type')
  if (category.appliesTo !== 'ANY' && category.appliesTo !== kind) throw Error('This category belongs to a different product type')
  const stock = b?.stock === '' ? -1 : Number(b?.stock ?? existing?.stock ?? -1)
  if (!Number.isSafeInteger(stock) || stock < -1 || priceMinor <= 0n) throw Error('Invalid stock or price')
  const specifications = validateSpecifications(b?.specifications ?? existing?.specifications ?? {}, category.fields.filter(field => !field.variant))
  const faqs = validateFaqs(b?.faqs ?? existing?.faqs ?? [])
  const gallery = validateGallery(b?.gallery ?? existing?.gallery ?? [])
  const variants = b?.variants === undefined ? undefined : validateVariants(b.variants, category.fields, currency)
  const data = sanitizeProduct(pick(b, ['slug', 'name', 'nameEn', 'description', 'descriptionEn', 'image', 'active', 'featured', 'sortOrder']))
  if (data.image !== undefined) data.image = validateCover(data.image)
  // VIP: member-only access, member price (must undercut the regular price) and gift days.
  const vip: Record<string, unknown> = {}
  if (b?.access !== undefined) vip.access = normalizeAccess(b.access)
  if (b?.memberPrice !== undefined) {
    const memberPriceMinor = b.memberPrice === '' || b.memberPrice === null ? 0n : toMinor(String(b.memberPrice), currency)
    if (memberPriceMinor < 0n || (memberPriceMinor > 0n && memberPriceMinor >= priceMinor)) throw Error('VIP price must be lower than the regular price')
    vip.memberPriceMinor = memberPriceMinor
  }
  if (b?.vipGiftDays !== undefined) {
    const days = b.vipGiftDays === '' ? 0 : Number(b.vipGiftDays)
    if (!Number.isSafeInteger(days) || days < 0 || days > 3650) throw Error('Invalid VIP gift days')
    vip.vipGiftDays = days
  }
  const merchandising = await productMerchandising(b, priceMinor, currency)
  return { data: { ...data, ...vip, ...merchandising, ...fx.fields, kind, specifications, faqs, gallery, price: legacyNumber(priceMinor, currency), priceMinor, currency, stock, categoryId: category.categoryId }, variants }
}

const plain = (value: unknown, max: number) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max)
const count = (value: unknown, label: string, max = 1_000_000) => {
  const number = value === '' || value == null ? 0 : Number(value)
  if (!Number.isSafeInteger(number) || number < 0 || number > max) throw Error(`Invalid ${label}`)
  return number
}

/** Store fields: brand, SKU, list price and timed offer, shipping weight, limits and SEO. */
async function productMerchandising(b: any, priceMinor: bigint, currency: string) {
  const out: Record<string, unknown> = {}
  if (b?.brandId !== undefined) {
    const brandId = b.brandId === '' || b.brandId === null ? null : Number(b.brandId)
    if (brandId !== null && (!Number.isSafeInteger(brandId) || !await db.productBrand.findUnique({ where: { id: brandId }, select: { id: true } }))) throw Error('Brand not found')
    out.brandId = brandId
  }
  if (b?.compareAtPrice !== undefined) {
    const compareAtMinor = b.compareAtPrice === '' || b.compareAtPrice === null ? 0n : toMinor(String(b.compareAtPrice), currency)
    if (compareAtMinor < 0n || (compareAtMinor > 0n && compareAtMinor <= priceMinor)) throw Error('List price must be higher than the sale price')
    out.compareAtMinor = compareAtMinor
  }
  if (b?.saleEndsAt !== undefined) {
    const date = b.saleEndsAt ? new Date(String(b.saleEndsAt)) : null
    if (date && Number.isNaN(date.getTime())) throw Error('Invalid offer end date')
    out.saleEndsAt = date
  }
  if (b?.sku !== undefined) {
    out.sku = plain(b.sku, 80)
    if (out.sku && !/^[A-Za-z0-9._-]+$/.test(String(out.sku))) throw Error('SKU may contain Latin letters, digits, dot, dash and underscore')
  }
  if (b?.shortDescription !== undefined) out.shortDescription = richTextToPlain(String(b.shortDescription), 600)
  if (b?.warranty !== undefined) out.warranty = plain(b.warranty, 160)
  if (b?.seoTitle !== undefined) out.seoTitle = plain(b.seoTitle, 120)
  if (b?.seoDescription !== undefined) out.seoDescription = plain(b.seoDescription, 320)
  if (b?.weightGrams !== undefined) out.weightGrams = count(b.weightGrams, 'weight', 1_000_000)
  if (b?.maxPerOrder !== undefined) out.maxPerOrder = count(b.maxPerOrder, 'order limit', 1000)
  if (b?.lowStockAt !== undefined) out.lowStockAt = count(b.lowStockAt, 'low-stock threshold', 100_000)
  return out
}

export async function saveVariants(tx: any, productId: number, variants: ReturnType<typeof validateVariants>) {
  const retained: number[] = []
  for (const variant of variants) {
    const priceMinor = toMinor(String(variant.price), variant.currency)
    const memberPriceMinor = variant.memberPrice ? toMinor(String(variant.memberPrice), variant.currency) : 0n
    const compareAtMinor = variant.compareAt ? toMinor(String(variant.compareAt), variant.currency) : 0n
    const data = { sku: variant.sku, name: variant.name, nameEn: variant.nameEn, attributes: variant.attributes, price: legacyNumber(priceMinor, variant.currency), priceMinor, memberPriceMinor, compareAtMinor, fxAmountMinor: variant.fxAmountMinor, stock: variant.stock, active: variant.active }
    if (variant.id) {
      const current = await tx.productVariant.findFirst({ where: { id: variant.id, productId } })
      if (!current) throw Error('Variant does not belong to this product')
      await tx.productVariant.update({ where: { id: variant.id }, data })
      retained.push(variant.id)
    } else {
      const created = await tx.productVariant.create({ data: { ...data, productId } })
      retained.push(created.id)
    }
  }
  // Keep historical variants for paid and in-flight orders, but stop selling removed ones.
  await tx.productVariant.updateMany({ where: { productId, id: { notIn: retained } }, data: { active: false } })
}
