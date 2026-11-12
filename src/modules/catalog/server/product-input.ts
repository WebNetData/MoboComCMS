import { db } from '@/platform/database/prisma'
import { normalizeAccess } from '@/modules/membership/domain/membership'
import { cleanRichText, richTextToPlain } from '@/shared/content/sanitize'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { validateCover } from '@/shared/content/cover'
import { attributeGroupForCategory, validateFaqs, validateFields, validateGallery, validateSpecifications, validateVariants } from '@/modules/catalog/server/product-config'
import { applyFxToBody } from '@/modules/fx/server/fx'
import { CATEGORY_KIND_LABEL, productFitsCategory, type CategoryKind } from '@/modules/catalog/domain/category-kind'
import { validateOrderFields } from '@/modules/store/domain/order-inputs'
import { validateDeliveryTemplate } from '@/modules/store/domain/delivery-details'
import { FX_CODES } from '@/modules/fx/domain/fx'

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
  if (categoryId === '' || categoryId == null) return { categoryId: null, fields: [] as ReturnType<typeof validateFields>, appliesTo: 'ANY', categoryKind: '' }
  const id = Number(categoryId)
  if (!Number.isSafeInteger(id) || id <= 0) throw Error('Invalid category')
  // The half of the shop the category is in decides which kind of product may be filed under it.
  const row = await db.productCategory.findUnique({ where: { id }, select: { kind: true } })
  return { categoryId: id, ...await attributeGroupForCategory(id), categoryKind: row?.kind || '' }
}

type FxExisting = { digitalMode?: string; openAmount?: boolean; openCurrencies?: string; openMinMinor?: bigint; openMaxMinor?: bigint; pricingMode?: string; fxCurrency?: string; fxAmountMinor?: bigint; fxCompareAtMinor?: bigint; fxMemberMinor?: bigint; markupBps?: number; markupFixedMinor?: bigint }

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
  if (!productFitsCategory(kind, category.categoryKind)) throw Error(`این دسته در بخش «${CATEGORY_KIND_LABEL[category.categoryKind as CategoryKind]?.fa || category.categoryKind}» است؛ نوع محصول را همان بگذارید یا دستهٔ دیگری انتخاب کنید.`)
  const stock = b?.stock === '' ? -1 : Number(b?.stock ?? existing?.stock ?? -1)
  if (!Number.isSafeInteger(stock) || stock < -1 || priceMinor <= 0n) throw Error('Invalid stock or price')
  const specifications = validateSpecifications(b?.specifications ?? existing?.specifications ?? {}, category.fields.filter(field => !field.variant))
  const faqs = validateFaqs(b?.faqs ?? existing?.faqs ?? [])
  const gallery = validateGallery(b?.gallery ?? existing?.gallery ?? [])
  const variants = b?.variants === undefined ? undefined : validateVariants(b.variants, category.fields, currency)
  const data = sanitizeProduct(pick(b, ['slug', 'name', 'nameEn', 'description', 'descriptionEn', 'image', 'active', 'featured', 'sortOrder']))
  if (data.image !== undefined) data.image = validateCover(data.image)
  if (existing?.digitalMode === 'FILES' && (kind !== 'VIRTUAL' || b.openAmount === true || b.isService === true)) throw Error('برای تغییر این محصول، ابتدا تحویل فایل را خاموش کنید')
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
  const ordering = productOrdering(b, existing, String((fx.fields as { pricingMode?: string }).pricingMode ?? existing?.pricingMode ?? 'FIXED'), Array.isArray(b?.variants) && b.variants.length > 0)
  return { data: { ...data, ...vip, ...merchandising, ...ordering, ...fx.fields, kind, specifications, faqs, gallery, price: legacyNumber(priceMinor, currency), priceMinor, currency, stock, categoryId: category.categoryId }, variants }
}

/**
 * What the product asks its buyer (order fields), and whether the buyer types the foreign amount themselves
 * ("pay a foreign site"): the amount is priced with this product's own rate, percentage and fixed profit.
 */
function productOrdering(b: any, existing: FxExisting | undefined, pricingMode: string, hasVariants: boolean) {
  const out: Record<string, unknown> = {}
  if (b?.isService !== undefined) out.isService = b.isService === true || b.isService === 'true'
  if (b?.orderFields !== undefined) out.orderFields = JSON.stringify(validateOrderFields(b.orderFields))
  if (b?.deliveryTemplate !== undefined) out.deliveryTemplate = JSON.stringify(validateDeliveryTemplate(b.deliveryTemplate))
  const open = b?.openAmount !== undefined ? b.openAmount === true || b.openAmount === 'true' : existing?.openAmount ?? false
  if (b?.openAmount !== undefined) out.openAmount = open
  if (!open) return out
  if (pricingMode !== 'FX') throw Error('مبلغ دلخواه فقط برای محصولی است که قیمت‌گذاری ارزی دارد؛ ابتدا قیمت‌گذاری را روی «ارزی» بگذارید')
  if (hasVariants) throw Error('محصولِ مبلغ دلخواه تنوع ندارد؛ تنوع‌ها را بردارید')
  if (b?.openCurrencies !== undefined) {
    const codes = [...new Set((Array.isArray(b.openCurrencies) ? b.openCurrencies : String(b.openCurrencies).split(',')).map((code: unknown) => String(code).trim().toUpperCase()).filter(Boolean))] as string[]
    if (codes.some((code) => !FX_CODES.includes(code))) throw Error('یکی از ارزهای مبلغ دلخواه پشتیبانی نمی‌شود')
    out.openCurrencies = codes.join(',')
  }
  const cents = (value: unknown, label: string) => {
    const text = String(value ?? '').replace(/[,،٬\s]/g, '')
    if (!text) return 0n
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) throw Error(`${label} معتبر نیست`)
    const [whole, fraction = ''] = text.split('.')
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  }
  const min = b?.openMin !== undefined ? cents(b.openMin, 'حداقل مبلغ') : existing?.openMinMinor ?? 0n
  const max = b?.openMax !== undefined ? cents(b.openMax, 'حداکثر مبلغ') : existing?.openMaxMinor ?? 0n
  if (max > 0n && min > max) throw Error('حداقل مبلغ از حداکثر بیشتر است')
  if (b?.openMin !== undefined) out.openMinMinor = min
  if (b?.openMax !== undefined) out.openMaxMinor = max
  return out
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
  if(b?.barcode !== undefined){const barcode=plain(b.barcode,80);if(barcode&&(!/^[\x21-\x7e]+$/.test(barcode)||/^MC-[PV]-/i.test(barcode)))throw Error('بارکد محصول معتبر نیست');out.barcode=barcode}
  if(b?.costPrice !== undefined){const cost=b.costPrice===''||b.costPrice===null?null:toMinor(String(b.costPrice),currency);if(cost!==null&&cost<0n)throw Error('بهای خرید نمی‌تواند منفی باشد');out.costMinor=cost}
  if (b?.brandId !== undefined) {
    const brandId = b.brandId === '' || b.brandId === null ? null : Number(b.brandId)
    if (brandId !== null && (!Number.isSafeInteger(brandId) || !await db.productBrand.findUnique({ where: { id: brandId }, select: { id: true } }))) throw Error('Brand not found')
    out.brandId = brandId
  }
  if (b?.saleChannel !== undefined) {
    if (!['ONLINE', 'COUNTER', 'BOTH'].includes(String(b.saleChannel))) throw Error('Invalid sale channel')
    out.saleChannel = String(b.saleChannel)
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
    const data = { barcode: variant.barcode, costMinor: variant.costMinor, sku: variant.sku, name: variant.name, nameEn: variant.nameEn, attributes: variant.attributes, price: legacyNumber(priceMinor, variant.currency), priceMinor, memberPriceMinor, compareAtMinor, fxAmountMinor: variant.fxAmountMinor, markupBps: variant.markupBps, markupFixedMinor: variant.markupFixedMinor, stock: variant.stock, active: variant.active }
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
