import { db } from '@/platform/database/prisma'
import { cleanRichText, richTextToPlain } from '@/shared/content/sanitize'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { inheritedAttributeGroup, validateFields, validateSpecifications, type AttributeField } from '@/modules/catalog/server/product-config'
import { slugify } from '@/modules/taxonomy/domain/taxonomy'
import { combinationKey, detectKind, findAttribute, generatedSku, kindOf, matchOption, newAttributeKey, SKU_PATTERN, splitPrice, stockOf, type Kind } from '@/modules/imports/domain/store'
import type { Counters, FieldDef, ImportSettings, Message, PreviewLine, SourceItem } from '@/modules/imports/domain/types'
import { latinSlug, normalizeName, normalizeValue, toText } from '@/modules/imports/domain/values'
import { countImages, htmlImageUrls, identityOf, importImages, loadIdentities, localizeHtml, planOnce, saveIdentity, seenBefore, snapshot, suffixOf, tracked, undoChange, type Client } from '@/modules/imports/server/adapters/common'
import { type ApplyResult, type Change, type Finding, type ImportAdapter, type ImportContext, type Plan } from '@/modules/imports/server/registry'

/**
 * Store products, on the store's real model: Product (one category, brand,
 * specifications JSON), ProductVariant (attributes JSON, own SKU/price/
 * stock/image), ProductCategory tree, ProductBrand and ProductAttributeGroup
 * — the group reaches a product through its category, as in the store admin.
 * A product never gets attributes outside its category's group.
 */

const E = { product: 'store.product', variant: 'store.variant', brand: 'store.brand' }

const STOCK_STATUS = [{ value: 'in', label: 'موجود' }, { value: 'out', label: 'ناموجود' }]
const STATUS = [{ value: 'active', label: 'فعال / منتشر' }, { value: 'inactive', label: 'غیرفعال / پیش‌نویس' }]

const FIELDS: FieldDef[] = [
  { key: 'externalId', label: 'شناسهٔ خارجی', type: 'text', group: 'meta', updatable: false, synonyms: ['id', 'external_id', 'externalid', 'product_id', 'source_id', 'شناسه'], hint: 'برای پیدا کردن همین محصول در ورودهای بعدی' },
  { key: 'title', label: 'نام محصول', type: 'text', group: 'main', requiredOnCreate: true, updateByDefault: false, synonyms: ['name', 'product_name', 'productname', 'product_title', 'producttitle', 'title', 'نام', 'عنوان', 'نام محصول'] },
  { key: 'titleEn', label: 'نام انگلیسی', type: 'text', group: 'main', synonyms: ['name_en', 'title_en', 'english_name', 'english_title', 'نام انگلیسی'] },
  { key: 'slug', label: 'نامک (slug)', type: 'slug', group: 'main', updatable: false, synonyms: ['slug', 'url_key', 'handle', 'permalink'] },
  { key: 'sku', label: 'SKU / کد کالا', type: 'text', group: 'commerce', updateByDefault: false, synonyms: ['sku', 'product_sku', 'code', 'product_code', 'model_code', 'کد کالا', 'کد'] },
  { key: 'shortDescription', label: 'توضیح کوتاه', type: 'longtext', group: 'content', synonyms: ['short_description', 'shortdescription', 'summary', 'excerpt', 'خلاصه', 'توضیح کوتاه'] },
  { key: 'description', label: 'توضیحات کامل', type: 'html', group: 'content', synonyms: ['description', 'description_html', 'full_description', 'body', 'content', 'details', 'توضیحات', 'شرح'] },
  { key: 'category', label: 'دسته‌بندی (مسیر)', type: 'category', group: 'relations', synonyms: ['category', 'category_name', 'categories', 'category_path', 'cat', 'دسته', 'دسته‌بندی', 'دسته بندی'], hint: 'مثل «کالای دیجیتال > موبایل > اپل»' },
  { key: 'brand', label: 'برند', type: 'text', group: 'relations', synonyms: ['brand', 'brand_name', 'manufacturer', 'maker', 'vendor', 'برند', 'سازنده', 'تولیدکننده'] },
  { key: 'attributeGroup', label: 'گروه ویژگی', type: 'text', group: 'relations', updatable: false, synonyms: ['attribute_group', 'attributegroup', 'attribute_set', 'product_group', 'گروه ویژگی'] },
  { key: 'kind', label: 'نوع محصول', type: 'enum', group: 'commerce', enum: [{ value: 'PHYSICAL', label: 'فیزیکی' }, { value: 'VIRTUAL', label: 'مجازی / دیجیتال' }], updateByDefault: false, synonyms: ['type', 'product_type', 'kind', 'نوع', 'نوع محصول'] },
  { key: 'price', label: 'قیمت اصلی', type: 'money', group: 'commerce', requiredOnCreate: true, synonyms: ['price', 'regular_price', 'list_price', 'base_price', 'قیمت', 'قیمت اصلی'] },
  { key: 'salePrice', label: 'قیمت فروش ویژه', type: 'money', group: 'commerce', synonyms: ['sale_price', 'saleprice', 'special_price', 'discount_price', 'offer_price', 'final_price', 'قیمت فروش', 'قیمت با تخفیف', 'قیمت ویژه'] },
  { key: 'currency', label: 'واحد پول', type: 'text', group: 'commerce', updatable: false, hint: 'فقط برای محصولات جدید؛ واحد پول محصول موجود با ورود اطلاعات عوض نمی‌شود', synonyms: ['currency', 'currency_code', 'واحد پول'] },
  { key: 'stock', label: 'موجودی', type: 'int', group: 'commerce', synonyms: ['stock', 'quantity', 'qty', 'inventory', 'stock_quantity', 'physical_stock', 'موجودی', 'تعداد'] },
  { key: 'stockStatus', label: 'وضعیت موجودی', type: 'enum', group: 'commerce', enum: STOCK_STATUS, synonyms: ['stock_status', 'availability', 'in_stock', 'وضعیت موجودی'], hint: 'موجود بدون تعداد = بدون محدودیت' },
  { key: 'image', label: 'تصویر شاخص', type: 'image', group: 'media', synonyms: ['image', 'thumbnail', 'featured_image', 'main_image', 'image_url', 'picture', 'تصویر', 'عکس'] },
  { key: 'gallery', label: 'گالری تصاویر', type: 'images', group: 'media', synonyms: ['gallery', 'images', 'pictures', 'photos', 'image_urls', 'گالری', 'تصاویر'] },
  { key: 'weight', label: 'وزن (گرم)', type: 'int', group: 'commerce', synonyms: ['weight', 'weight_grams', 'weight_g', 'وزن'] },
  { key: 'warranty', label: 'گارانتی', type: 'text', group: 'commerce', synonyms: ['warranty', 'guarantee', 'گارانتی', 'ضمانت'] },
  { key: 'status', label: 'وضعیت انتشار', type: 'enum', group: 'meta', enum: STATUS, synonyms: ['status', 'active', 'published', 'visibility', 'وضعیت'] },
  { key: 'featured', label: 'ویژه', type: 'bool', group: 'meta', synonyms: ['featured', 'is_featured', 'ویژه'] },
  { key: 'saleEndsAt', label: 'پایان تخفیف', type: 'date', group: 'commerce', synonyms: ['sale_ends_at', 'sale_end', 'offer_end', 'date_on_sale_to', 'پایان تخفیف'] },
  { key: 'seoTitle', label: 'عنوان سئو', type: 'text', group: 'seo', synonyms: ['seo_title', 'meta_title', 'عنوان سئو'] },
  { key: 'seoDescription', label: 'توضیح سئو', type: 'longtext', group: 'seo', synonyms: ['seo_description', 'meta_description', 'توضیح سئو'] },
  { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', group: 'meta', updatable: false, synonyms: ['created_at', 'date_created', 'created', 'تاریخ ایجاد'] },
  { key: 'specifications', label: 'مشخصات فنی (ویژگی‌ها)', type: 'json', group: 'relations', implicit: true },
  { key: 'variants', label: 'تنوع‌ها', type: 'json', group: 'relations', implicit: true },
]

const VARIANT_FIELDS: FieldDef[] = [
  { key: 'externalId', label: 'شناسهٔ خارجی تنوع', type: 'text', updatable: false, synonyms: ['id', 'variant_id', 'variation_id', 'external_id'] },
  { key: 'sku', label: 'SKU تنوع', type: 'text', updateByDefault: false, synonyms: ['sku', 'variant_sku', 'variation_sku', 'code'] },
  { key: 'name', label: 'نام تنوع', type: 'text', updateByDefault: false, synonyms: ['variant_name', 'variation_name', 'option_name', 'name', 'title'] },
  { key: 'price', label: 'قیمت تنوع', type: 'money', requiredOnCreate: true, synonyms: ['price', 'regular_price', 'variant_price', 'قیمت'] },
  { key: 'salePrice', label: 'قیمت ویژهٔ تنوع', type: 'money', synonyms: ['sale_price', 'special_price', 'discount_price', 'قیمت ویژه'] },
  { key: 'stock', label: 'موجودی تنوع', type: 'int', synonyms: ['stock', 'quantity', 'qty', 'inventory', 'موجودی'] },
  { key: 'stockStatus', label: 'وضعیت موجودی تنوع', type: 'enum', enum: STOCK_STATUS, synonyms: ['stock_status', 'availability', 'in_stock'] },
  { key: 'image', label: 'تصویر تنوع', type: 'image', synonyms: ['image', 'variant_image', 'variation_image', 'photo', 'picture', 'تصویر'] },
  { key: 'active', label: 'فعال بودن تنوع', type: 'bool', synonyms: ['active', 'enabled', 'status', 'فعال'] },
]

type Opt = {
  currency: string; categorySeparator: string; missingCategories: 'create' | 'error'; missingBrands: 'create' | 'error'
  productType: 'auto' | Kind; groupMode: 'none' | 'source' | 'category' | 'fixed' | 'map'; groupFixed: number | null; groupMap: Record<string, number>
  missingGroups: 'create' | 'manual' | 'error'; missingAttributes: 'ignore' | 'manual' | 'add' | 'reject'; missingValues: 'add' | 'map' | 'ignore' | 'reject'
  attributeMap: Record<string, string>; optionMap: Record<string, string>; missingVariants: 'keep' | 'disable' | 'delete'; confirmDelete: boolean; newStatus: 'active' | 'inactive'
}

function normalizeOptions(raw: Record<string, unknown>): Opt {
  const pick = <T extends string>(value: unknown, allowed: T[], fallback: T): T => (allowed.includes(value as T) ? value as T : fallback)
  const idMap = (value: unknown) => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value as Record<string, unknown> : {}).slice(0, 500)
    .map(([k, v]) => [k.slice(0, 200), Number(v)] as const).filter(([, v]) => Number.isSafeInteger(v) && v > 0))
  const keyMap = (value: unknown) => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value as Record<string, unknown> : {}).slice(0, 200)
    .map(([k, v]) => [k.slice(0, 80), String(v)] as const).filter(([, v]) => /^[a-z][a-z0-9_]{0,39}$/.test(v)))
  let currency = 'IRT'
  try { currency = normalizeCurrency(raw.currency || 'IRT', 'IRT') } catch { currency = 'IRT' }
  const fixed = Number(raw.groupFixed)
  return {
    currency, categorySeparator: pick(raw.categorySeparator, ['>', '/', '|', '\\'], '>'),
    missingCategories: pick(raw.missingCategories, ['create', 'error'], 'create'),
    missingBrands: pick(raw.missingBrands, ['create', 'error'], 'create'),
    productType: pick(raw.productType, ['auto', 'PHYSICAL', 'VIRTUAL'], 'auto'),
    groupMode: pick(raw.groupMode, ['none', 'source', 'category', 'fixed', 'map'], 'category'),
    groupFixed: Number.isSafeInteger(fixed) && fixed > 0 ? fixed : null,
    groupMap: idMap(raw.groupMap),
    missingGroups: pick(raw.missingGroups, ['create', 'manual', 'error'], 'error'),
    // Safe defaults: an attribute the group does not define is left out, a value the group does not offer rejects the record.
    missingAttributes: pick(raw.missingAttributes, ['ignore', 'manual', 'add', 'reject'], 'ignore'),
    missingValues: pick(raw.missingValues, ['add', 'map', 'ignore', 'reject'], 'reject'),
    attributeMap: keyMap(raw.attributeMap),
    optionMap: Object.fromEntries(Object.entries(raw.optionMap && typeof raw.optionMap === 'object' ? raw.optionMap as Record<string, unknown> : {}).slice(0, 1000)
      .map(([k, v]) => [k.slice(0, 200), String(v ?? '').trim().slice(0, 80)] as const).filter(([, v]) => v)),
    missingVariants: pick(raw.missingVariants, ['keep', 'disable', 'delete'], 'keep'),
    confirmDelete: raw.confirmDelete === true,
    newStatus: pick(raw.newStatus, ['active', 'inactive'], 'active'),
  }
}

// ------------------------------------------------------------------ run caches (loaded once per run)

type Cat = { id: number; slug: string; name: string; nameEn: string; parentId: number | null; attributeGroupId: number | null }
type Group = { id: number; name: string; nameEn: string; appliesTo: string; fields: AttributeField[] }
type Brand = { id: number; slug: string; name: string; nameEn: string }
type Caches = { cats: Map<number, Cat>; groups: Map<number, Group>; brands: Map<number, Brand>; catSlugs: Set<string>; brandSlugs: Set<string> }

async function caches(ctx: ImportContext): Promise<Caches> {
  const hit = ctx.cache.get('store') as Caches | undefined
  if (hit) return hit
  const [cats, groups, brands] = await Promise.all([
    db.productCategory.findMany({ select: { id: true, slug: true, name: true, nameEn: true, parentId: true, attributeGroupId: true } }),
    db.productAttributeGroup.findMany({ select: { id: true, name: true, nameEn: true, appliesTo: true, fields: true } }),
    db.productBrand.findMany({ select: { id: true, slug: true, name: true, nameEn: true } }),
  ])
  const value: Caches = {
    cats: new Map(cats.map((c) => [c.id, c])),
    groups: new Map(groups.map((g) => { let fields: AttributeField[] = []; try { fields = validateFields(g.fields) } catch { fields = [] } return [g.id, { ...g, fields }] })),
    brands: new Map(brands.map((b) => [b.id, b])),
    catSlugs: new Set(cats.map((c) => c.slug)),
    brandSlugs: new Set(brands.map((b) => b.slug)),
  }
  ctx.cache.set('store', value)
  return value
}

/** Existing category for a path, or how far the path already exists. */
function walkPath(c: Caches, path: string[]): { found: Cat | null; existing: Cat[]; missing: string[] } {
  const existing: Cat[] = []
  let parent: number | null = null
  for (let i = 0; i < path.length; i++) {
    const n = normalizeName(path[i]), s = latinSlug(path[i]) || slugify(path[i])
    const hit = [...c.cats.values()].find((cat) => cat.parentId === parent && (normalizeName(cat.name) === n || (cat.nameEn && normalizeName(cat.nameEn) === n) || cat.slug === s))
    if (!hit) return { found: null, existing, missing: path.slice(i) }
    existing.push(hit)
    parent = hit.id
  }
  return { found: existing[existing.length - 1] || null, existing, missing: [] }
}

/** The group a category uses — the store's own inheritance walk, over the run's category cache. */
async function groupOfCategory(c: Caches, id: number | null): Promise<{ group: Group | null; via: Cat | null }> {
  const found = await inheritedAttributeGroup(id, (catId) => {
    const cat = c.cats.get(catId)
    return cat ? { parentId: cat.parentId, group: cat.attributeGroupId ? c.groups.get(cat.attributeGroupId) || null : null } : null
  })
  return { group: found.group, via: found.categoryId ? c.cats.get(found.categoryId) || null : null }
}

/** Specifications after this import: the product's current ones (unless replacing) plus the file's, only the group's keys. */
function mergedSpecs(existing: Existing | null, specs: Record<string, string>, replace: boolean, fields: AttributeField[]): Record<string, string> {
  const keys = new Set(fields.filter((f) => !f.variant).map((f) => f.key))
  let current: Record<string, string> = {}
  try { current = existing && !replace ? JSON.parse(existing.specifications || '{}') : {} } catch { current = {} }
  const merged: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...current, ...specs })) if (keys.has(key)) merged[key] = value
  return merged
}

/**
 * File prices are in the import's currency. An existing product priced in
 * another currency keeps its prices (its currency is never switched by an
 * import, since its other amounts — variants, VIP price — would change meaning).
 */
function currencyConflict(existing: Existing | null, o: Opt): string {
  if (!existing || existing.currency === o.currency) return ''
  return `قیمت‌های فایل به ${o.currency} است ولی این محصول به ${existing.currency} قیمت‌گذاری شده؛ قیمت محصول و تنوع‌هایش تغییر نمی‌کند`
}

/** Key of a manual value mapping: attribute key and the normalized source value. */
export const optionMapKey = (key: string, value: string) => `${key}=${normalizeValue(value)}`

const findBrand = (c: Caches, name: string) => {
  const n = normalizeName(name), s = latinSlug(name)
  return [...c.brands.values()].find((b) => normalizeName(b.name) === n || (b.nameEn && normalizeName(b.nameEn) === n) || (s && b.slug === s)) || null
}
const findGroup = (c: Caches, name: string) => {
  const n = normalizeName(name)
  return [...c.groups.values()].find((g) => normalizeName(g.name) === n || (g.nameEn && normalizeName(g.nameEn) === n)) || null
}

// ------------------------------------------------------------------ per-slice lookups

type Existing = {
  id: number; slug: string; name: string; nameEn: string; sku: string; description: string; shortDescription: string; image: string; gallery: string
  priceMinor: bigint; compareAtMinor: bigint; currency: string; stock: number; kind: string; categoryId: number | null; brandId: number | null
  specifications: string; pricingMode: string; active: boolean; updatedAt: Date
  variants: { id: number; sku: string; name: string; attributes: string; priceMinor: bigint; compareAtMinor: bigint; stock: number; active: boolean; image: string }[]
}
const PRODUCT_SELECT = {
  id: true, slug: true, name: true, nameEn: true, sku: true, description: true, shortDescription: true, image: true, gallery: true, priceMinor: true, compareAtMinor: true,
  currency: true, stock: true, kind: true, categoryId: true, brandId: true, specifications: true, pricingMode: true, active: true, updatedAt: true,
  variants: { select: { id: true, sku: true, name: true, attributes: true, priceMinor: true, compareAtMinor: true, stock: true, active: true, image: true } },
} as const

async function prepare(items: SourceItem[], values: Record<string, unknown>[], ctx: ImportContext) {
  await caches(ctx)
  const externalIds = values.map((v) => toText(v.externalId, 190)).filter(Boolean)
  const variantIds = values.flatMap((_v, i) => items[i].variants.map((variant) => toText(variant.externalId, 190))).filter(Boolean)
  await loadIdentities(ctx, E.product, externalIds)
  await loadIdentities(ctx, E.variant, variantIds)
  const skus = [...new Set(values.map((v) => toText(v.sku, 80)).filter(Boolean))]
  const slugs = [...new Set(values.map((v) => toText(v.slug, 120)).filter(Boolean))]
  const idsFromIdentity = externalIds.map((id) => identityOf(ctx, E.product, id)).filter((id): id is number => !!id)
  const products = await db.product.findMany({ where: { OR: [{ id: { in: idsFromIdentity } }, ...(skus.length ? [{ sku: { in: skus } }] : []), ...(slugs.length ? [{ slug: { in: slugs } }] : [])] }, select: PRODUCT_SELECT })
  const byId = (ctx.cache.get('products') as Map<number, Existing> | undefined) || new Map<number, Existing>()
  for (const p of products) byId.set(p.id, p)
  ctx.cache.set('products', byId)
  const variantSkus = [...new Set(items.flatMap((item) => item.variants.map((v) => toText(v.sku, 80))).filter(Boolean))]
  const owners = variantSkus.length ? await db.productVariant.findMany({ where: { sku: { in: variantSkus } }, select: { sku: true, productId: true } }) : []
  const skuOwner = (ctx.cache.get('variantSkus') as Map<string, number> | undefined) || new Map<string, number>()
  for (const o of owners) skuOwner.set(o.sku, o.productId)
  ctx.cache.set('variantSkus', skuOwner)
}

function findExisting(ctx: ImportContext, values: Record<string, unknown>): Existing | null {
  const byId = (ctx.cache.get('products') as Map<number, Existing> | undefined) || new Map<number, Existing>()
  const externalId = toText(values.externalId, 190)
  const viaIdentity = externalId ? identityOf(ctx, E.product, externalId) : undefined
  if (viaIdentity && byId.get(viaIdentity)) return byId.get(viaIdentity)!
  const sku = toText(values.sku, 80)
  if (sku) { const hit = [...byId.values()].find((p) => p.sku === sku); if (hit) return hit }
  const slug = toText(values.slug, 120)
  if (slug) { const hit = [...byId.values()].find((p) => p.slug === slug); if (hit) return hit }
  return null
}

// ------------------------------------------------------------------ planning

type AttrPlan = { name: string; key: string; label: string; value: string; create: boolean; createOption: boolean; variation: boolean }
type VariantPlan = {
  index: number; existingId: number | null; externalId: string; sku: string; skuGenerated: boolean; name: string
  attributes: Record<string, string>; values: Record<string, unknown>; price: string | null; compareAt: string | null; stock: number | null; image: string; active: boolean | null
}
type Data = {
  existing: Existing | null
  values: Record<string, unknown>
  categoryPath: string[]
  brandName: string
  group: { id: number | null; name: string; create: boolean; link: boolean; appliesTo: string } | null
  newFields: AttributeField[]
  newOptions: { key: string; value: string }[]
  specs: Record<string, string>
  kind: Kind
  variants: VariantPlan[]
  missingVariantIds: number[]
  images: { image: string; gallery: string[] }
  derivedPrice: string | null
}

const money = (v: unknown) => (v === null || v === undefined ? '' : Number(v).toLocaleString('en-US'))

async function plan(item: SourceItem, values: Record<string, unknown>, variantValues: Record<string, unknown>[], ctx: ImportContext): Promise<Plan> {
  const o = ctx.settings.options as unknown as Opt
  const c = await caches(ctx)
  const messages: Message[] = []
  const counters: Counters = {}
  const title = toText(values.title, 200) || toText(values.sku, 80) || `ردیف ${item.rows[0]}`
  const sourceKey = toText(values.externalId, 190) || toText(values.sku, 80) || toText(values.slug, 120) || ''
  const fail = (text: string): Plan => ({ action: 'FAIL', title, sourceKey, messages: [...messages, { level: 'error', text }], counters, preview: { title, action: 'FAIL', lines: [], messages: [...messages, { level: 'error', text }] } })

  // Identity: external id → SKU → slug; a repeat inside the same file updates what the first row made.
  const existing = findExisting(ctx, values)
  const dupKey = sourceKey ? `product:${sourceKey}` : ''
  const firstSeen = dupKey ? seenBefore(ctx, dupKey, item.index) : null
  if (firstSeen !== null) { counters.duplicates = 1; messages.push({ level: 'warning', text: `این محصول در فایل تکراری است (همان شناسه در رکورد ${firstSeen + 1}); روی همان محصول اعمال می‌شود` }) }
  let action: Plan['action'] = existing || firstSeen !== null ? 'UPDATE' : 'CREATE'
  if (action === 'UPDATE' && ctx.settings.existing === 'skip') {
    return { action: 'SKIP', title, sourceKey, entityId: existing?.id, messages: [...messages, { level: 'info', text: 'محصول از قبل وجود دارد و طبق تنظیمات رد می‌شود' }], counters, preview: { title, action: 'SKIP', lines: [], messages } }
  }
  const mode = action === 'CREATE' ? 'create' : 'update'

  // Category (one per product in this store).
  const paths = (values.category as string[][] | undefined) || []
  if (paths.length > 1) messages.push({ level: 'warning', text: `محصول فروشگاه یک دسته دارد؛ فقط «${paths[0].join(' > ')}» استفاده می‌شود` })
  const categoryPath = paths[0] || []
  let category: Cat | null = null
  // Where the attribute group is inherited from: the category itself, or — when the end of the path is
  // still to be created — its deepest existing ancestor (new categories inherit exactly like existing ones).
  let groupSource: Cat | null = null
  if (categoryPath.length) {
    const walk = walkPath(c, categoryPath)
    category = walk.found
    groupSource = walk.found || walk.existing[walk.existing.length - 1] || null
    if (walk.missing.length) {
      if (o.missingCategories === 'error') return fail(`دستهٔ «${categoryPath.join(' > ')}» وجود ندارد`)
      for (let i = walk.existing.length; i < categoryPath.length; i++) planOnce(ctx, `cat:${categoryPath.slice(0, i + 1).map(normalizeName).join('>')}`, counters, 'categoriesCreated')
    }
  }

  // Brand.
  const brandName = toText(values.brand, 120)
  if (brandName && !findBrand(c, brandName)) {
    if (o.missingBrands === 'error') return fail(`برند «${brandName}» وجود ندارد`)
    planOnce(ctx, `brand:${normalizeName(brandName)}`, counters, 'brandsCreated')
  }

  // Product type.
  let kind: Kind
  const explicit = (values.kind as Kind | undefined) || kindOf(values.kind)
  if (o.productType !== 'auto') kind = o.productType
  else if (explicit) kind = explicit
  else {
    const detected = detectKind(item.raw)
    if (detected.kind) kind = detected.kind
    else {
      kind = (existing?.kind as Kind) || 'VIRTUAL'
      if (!existing) messages.push({ level: 'warning', text: 'نوع محصول (فیزیکی/مجازی) از داده‌ها قابل تشخیص نبود؛ «مجازی» (پیش‌فرض فروشگاه) در نظر گرفته شد — در صورت نیاز نوع را در تنظیمات مشخص کنید' })
    }
  }

  // Attribute group: from the file, the category, one group for all, or a map by source category.
  // When the product's category is not imported, its current category decides the group.
  const categoryAllowed = 'category' in ctx.allow({ category: categoryPath }, mode, existing ? currentValues(existing, c) : undefined)
  if (existing && (!categoryAllowed || !categoryPath.length) && existing.categoryId) groupSource = category = c.cats.get(existing.categoryId) || null
  const categoryGroup = groupSource ? await groupOfCategory(c, groupSource.id) : { group: null, via: null }
  let desired: { id: number | null; name: string; create: boolean } | null = null
  if (o.groupMode === 'category') desired = categoryGroup.group ? { id: categoryGroup.group.id, name: categoryGroup.group.name, create: false } : null
  else if (o.groupMode === 'fixed' && o.groupFixed) { const g = c.groups.get(o.groupFixed); if (!g) return fail('گروه ویژگی انتخاب‌شده پیدا نشد'); desired = { id: g.id, name: g.name, create: false } }
  else if (o.groupMode === 'map') {
    const key = categoryPath.join(' > ')
    const mapped = o.groupMap[key] ?? o.groupMap[categoryPath[categoryPath.length - 1] || '']
    const g = mapped ? c.groups.get(mapped) : null
    desired = g ? { id: g.id, name: g.name, create: false } : categoryGroup.group ? { id: categoryGroup.group.id, name: categoryGroup.group.name, create: false } : null
  } else if (o.groupMode === 'source') {
    const name = toText(values.attributeGroup, 120)
    if (name) {
      const g = findGroup(c, name)
      if (g) desired = { id: g.id, name: g.name, create: false }
      else if (o.missingGroups === 'create') { desired = { id: null, name, create: true }; planOnce(ctx, `group:${normalizeName(name)}`, counters, 'groupsCreated') }
      else return fail(o.missingGroups === 'manual' ? `گروه ویژگی «${name}» وجود ندارد؛ آن را در مرحلهٔ نگاشت به یک گروه موجود وصل کنید` : `گروه ویژگی «${name}» وجود ندارد`)
    } else if (categoryGroup.group) desired = { id: categoryGroup.group.id, name: categoryGroup.group.name, create: false }
  }
  let group: Data['group'] = null
  let fields: AttributeField[] = []
  if (desired) {
    if (!category && !(categoryAllowed && categoryPath.length)) return fail(`گروه ویژگی «${desired.name}» از طریق دسته به محصول می‌رسد؛ این محصول دسته ندارد`)
    if (categoryGroup.group && desired.id !== categoryGroup.group.id) return fail(`دستهٔ «${categoryGroup.via?.name}» به گروه ویژگی «${categoryGroup.group.name}» متصل است؛ گروه «${desired.name}» برای این محصول مجاز نیست (ویژگی‌های نامرتبط به محصول اضافه نمی‌شود)`)
    const existingGroup = desired.id ? c.groups.get(desired.id)! : null
    const appliesTo = existingGroup?.appliesTo || 'ANY'
    if (appliesTo !== 'ANY' && appliesTo !== kind) return fail(`گروه ویژگی «${desired.name}» مخصوص محصولات ${appliesTo === 'PHYSICAL' ? 'فیزیکی' : 'مجازی'} است`)
    const link = !categoryGroup.group
    if (link) planOnce(ctx, `link:${categoryPath.map(normalizeName).join('>')}`, counters, 'groupsLinked')
    group = { id: desired.id, name: desired.name, create: desired.create, link, appliesTo }
    fields = existingGroup ? [...existingGroup.fields] : []
  }

  // Attributes: only what the product's attribute group defines. An attribute the group does not
  // define, or a value its options do not offer, follows the import options (reported in the dry run).
  const attrPlans: AttrPlan[] = []
  const newFields: AttributeField[] = []
  const newOptions: { key: string; value: string }[] = []
  const findings: Finding[] = []
  type Resolved = AttrPlan | { skip: string } | string
  const resolveAttr = (name: string, value: string, variation: boolean): Resolved => {
    const groupName = group?.name || ''
    let field = findAttribute([...fields, ...newFields], name, o.attributeMap)
    let create = false
    if (!field) {
      const finding = { type: 'unknownAttribute' as const, attribute: name, label: name, value, group: groupName, product: title, variation, mapKey: name }
      if (o.missingAttributes === 'add') {
        if (fields.length + newFields.length >= 30) { findings.push({ ...finding, outcome: 'rejected' }); return `ویژگی ناشناخته «${name}»: گروه «${groupName}» حداکثر ۳۰ ویژگی دارد` }
        field = { key: newAttributeKey(name, [...fields, ...newFields].map((f) => f.key)), label: name.slice(0, 80), labelEn: '', kind: variation ? 'select' : 'text', options: [], required: false, variant: variation }
        newFields.push(field)
        create = true
        findings.push({ ...finding, outcome: 'added' })
        planOnce(ctx, `attr:${groupName}:${normalizeName(name)}`, counters, 'attributesCreated')
      } else if (o.missingAttributes === 'ignore' && !variation) {
        findings.push({ ...finding, outcome: 'ignored' })
        return { skip: `ویژگی ناشناخته «${name}» در گروه ویژگی «${groupName}» تعریف نشده؛ وارد نمی‌شود` }
      } else {
        findings.push({ ...finding, outcome: o.missingAttributes === 'manual' ? 'needs-mapping' : 'rejected' })
        if (o.missingAttributes === 'manual') return `ویژگی ناشناخته «${name}» در گروه ویژگی «${groupName}» نیست؛ آن را در تنظیمات به یکی از ویژگی‌های گروه نگاشت کنید`
        if (variation && o.missingAttributes === 'ignore') return `ویژگی تنوع «${name}» در گروه ویژگی «${groupName}» تعریف نشده؛ ویژگی تنوع را نمی‌توان نادیده گرفت (ترکیب تنوع ناقص می‌شود)`
        return `ویژگی ناشناخته «${name}» در گروه ویژگی «${groupName}» تعریف نشده است`
      }
    }
    if (field.variant !== variation) return `ویژگی «${field.label}» در گروه «${groupName}» ${field.variant ? 'ویژگی تنوع است و نمی‌تواند مشخصهٔ ثابت باشد' : 'مشخصهٔ ثابت است و نمی‌تواند ویژگی تنوع باشد'}`
    let stored = matchOption(field, value)
    let createOption = false
    if (stored === null) {
      const finding = { type: 'newOption' as const, attribute: field.key, label: field.label, value, group: groupName, product: title, options: [...field.options], variation, mapKey: optionMapKey(field.key, value) }
      const mapped = o.optionMap[optionMapKey(field.key, value)]
      if (mapped) {
        const target = matchOption(field, mapped)
        if (!target) { findings.push({ ...finding, outcome: 'rejected' }); return `نگاشت مقدار «${value}» به «${mapped}» معتبر نیست؛ «${mapped}» از گزینه‌های «${field.label}» نیست` }
        findings.push({ ...finding, outcome: 'mapped' })
        stored = target
      } else if (o.missingValues === 'add') {
        if (field.options.length >= 40) { findings.push({ ...finding, outcome: 'rejected' }); return `ویژگی «${field.label}» حداکثر ۴۰ گزینه دارد؛ «${value}» اضافه نمی‌شود` }
        stored = value.trim().slice(0, 80)
        createOption = true
        findings.push({ ...finding, outcome: 'added' })
        if (!newOptions.some((n) => n.key === field!.key && normalizeValue(n.value) === normalizeValue(stored!))) {
          newOptions.push({ key: field.key, value: stored })
          field.options = [...field.options, stored]
          planOnce(ctx, `opt:${groupName}:${field.key}:${normalizeValue(stored)}`, counters, 'valuesCreated')
        }
      } else if (o.missingValues === 'ignore' && !variation) {
        findings.push({ ...finding, outcome: 'ignored' })
        return { skip: `مقدار جدید «${value}» برای «${field.label}» در گروه «${groupName}» نیست؛ این مشخصه وارد نمی‌شود` }
      } else {
        findings.push({ ...finding, outcome: o.missingValues === 'map' ? 'needs-mapping' : 'rejected' })
        return o.missingValues === 'map'
          ? `مقدار جدید «${value}» برای «${field.label}» (گروه «${groupName}»): آن را در تنظیمات به یکی از گزینه‌های موجود نگاشت کنید`
          : `مقدار «${value}» از گزینه‌های «${field.label}» در گروه «${groupName}» نیست`
      }
    }
    return { name, key: field.key, label: field.label, value: stored, create, createOption, variation }
  }
  // Keep the group's own field objects unmodified in the cache (options are appended on copies).
  fields = fields.map((f) => ({ ...f, options: [...f.options] }))
  const specs: Record<string, string> = {}
  const specNames = Object.keys(item.specs)
  if (specNames.length && !group) messages.push({ level: 'warning', text: `محصول گروه ویژگی ندارد؛ ${specNames.length} مشخصه وارد نمی‌شود` })
  if (group) {
    for (const name of specNames) {
      const r = resolveAttr(name, item.specs[name], false)
      if (typeof r === 'string') { messages.push({ level: 'error', text: r }); continue }
      if ('skip' in r) { messages.push({ level: 'warning', text: r.skip }); continue }
      specs[r.key] = r.value
      attrPlans.push(r)
    }
  }
  const failWith = (text: string): Plan => ({ ...fail(text), findings })
  if (messages.some((m) => m.level === 'error')) return failWith('مشخصات این محصول با گروه ویژگی آن سازگار نیست')
  // The store's own validator decides: required attributes, allowed values, nothing outside the group.
  // A new product is always checked (the store never creates one that breaks its group); an existing
  // one only when its specifications are being imported.
  const specsPolicyOn = 'specifications' in ctx.allow({ specifications: specs }, mode, existing ? currentValues(existing, c) : undefined)
  if (group && (mode === 'create' || specsPolicyOn)) {
    const allFields = [...fields, ...newFields]
    const target = mode === 'create' && !specsPolicyOn ? {} : mergedSpecs(existing, specs, ctx.settings.existing === 'replace', allFields)
    try { validateSpecifications(target, allFields.filter((f) => !f.variant)) } catch (error) {
      return failWith(`مشخصات با گروه ویژگی «${group.name}» سازگار نیست: ${error instanceof Error ? error.message : ''}`)
    }
  }

  // Variants.
  const variantPlans: VariantPlan[] = []
  const variationNames = ctx.settings.attributes.filter((a) => a.variation).map((a) => a.name)
  if (item.variants.length > 100) return fail('هر محصول حداکثر ۱۰۰ تنوع دارد')
  if (item.variants.length && !group) return fail('تنوع‌ها بدون گروه ویژگی قابل ساخت نیستند؛ گروه ویژگی را در تنظیمات مشخص کنید')
  const existingVariants = existing?.variants || []
  const seenCombos = new Map<string, number>()
  const skuOwner = (ctx.cache.get('variantSkus') as Map<string, number> | undefined) || new Map<string, number>()
  const parentKey = toText(values.sku, 80) || toText(values.slug, 80) || latinSlug(values.titleEn || values.title, 30) || `p${suffixOf(title)}`
  for (let i = 0; i < item.variants.length; i++) {
    const v = variantValues[i] || {}
    const attrs = item.variantAttributes[i] || {}
    const label = `تنوع ${i + 1}`
    const resolved: Record<string, string> = {}
    let bad = ''
    for (const name of variationNames) {
      if (!attrs[name]) { bad = `${label}: مقدار «${name}» ندارد (ترکیب ویژگی ناقص)`; break }
      const r = resolveAttr(name, attrs[name], true)
      if (typeof r === 'string') { bad = `${label}: ${r}`; break }
      if ('skip' in r) { bad = `${label}: ${r.skip}`; break }
      resolved[r.key] = r.value
    }
    if (!bad && !Object.keys(resolved).length) bad = `${label}: هیچ ویژگی تنوعی (مثل رنگ یا حافظه) ندارد`
    if (!bad) {
      try { validateSpecifications(resolved, [...fields, ...newFields].filter((f) => f.variant)) } catch (error) { bad = `${label}: ترکیب ویژگی‌ها با گروه «${group?.name}» سازگار نیست (${error instanceof Error ? error.message : ''})` }
    }
    if (bad) { messages.push({ level: 'error', text: bad }); continue }
    const combo = combinationKey(resolved)
    if (seenCombos.has(combo)) { messages.push({ level: 'error', text: `${label}: تنوع تکراری (${Object.entries(resolved).map(([k, val]) => `${k}=${val}`).join('، ')}) — مثل تنوع ${seenCombos.get(combo)! + 1}` }); continue }
    seenCombos.set(combo, i)
    const externalId = toText(v.externalId, 190)
    const viaIdentity = externalId ? identityOf(ctx, E.variant, externalId) : undefined
    let sku = toText(v.sku, 80)
    let skuGenerated = false
    if (sku && !SKU_PATTERN.test(sku)) { messages.push({ level: 'error', text: `${label}: SKU «${sku}» فقط حروف لاتین، عدد، نقطه، خط تیره و زیرخط می‌تواند داشته باشد` }); continue }
    const match = existingVariants.find((ev) => ev.id === viaIdentity) || (sku ? existingVariants.find((ev) => ev.sku === sku) : undefined)
      || existingVariants.find((ev) => { try { return combinationKey(JSON.parse(ev.attributes || '{}')) === combo } catch { return false } })
    if (!sku) { sku = match?.sku || generatedSku(parentKey, resolved); skuGenerated = !match }
    const owner = skuOwner.get(sku)
    if (owner && owner !== existing?.id) { messages.push({ level: 'error', text: `${label}: SKU «${sku}» متعلق به محصول دیگری است` }); continue }
    const { price, compareAt } = splitPrice(v.price as string | null, v.salePrice as string | null)
    const stock = stockOf(v.stock as number | null, v.stockStatus as string | null)
    const vMode = match ? 'update' : 'create'
    const allowed = ctx.allowVariant({ ...v, sku }, vMode)
    if (vMode === 'create' && !(('price' in allowed || 'salePrice' in allowed) && price)) { messages.push({ level: 'error', text: `${label}: امکان ساخت تنوع نیست؛ فیلد الزامی «قیمت تنوع» ${price ? 'از ورود اطلاعات کنار گذاشته شده' : 'در فایل مقدار ندارد'} و مقدار جایگزین معتبری وجود ندارد` }); continue }
    if (skuGenerated) messages.push({ level: 'info', text: `${label}: SKU ندارد؛ «${sku}» ساخته شد` })
    variantPlans.push({
      index: i, existingId: match?.id ?? null, externalId, sku, skuGenerated,
      name: toText(v.name, 120) || `${title} - ${Object.values(resolved).join(' / ')}`.slice(0, 120),
      attributes: resolved, values: v, price, compareAt, stock, image: toText(v.image, 2048), active: typeof v.active === 'boolean' ? v.active : null,
    })
  }
  if (item.variants.length && !variantPlans.length) return failWith('هیچ‌کدام از تنوع‌های این محصول معتبر نیست')
  const missingVariantIds = existing && item.variants.length ? existingVariants.filter((ev) => !variantPlans.some((vp) => vp.existingId === ev.id)).map((ev) => ev.id) : []

  // Prices: the product's own price, or (for a new variable product without one) the lowest variant price.
  const main = splitPrice(values.price as string | null, values.salePrice as string | null)
  let derivedPrice: string | null = null
  const allowedMain = ctx.allow({ ...values, ...(ctx.settings.specsSource || specNames.length ? { specifications: specs } : {}), ...(variantPlans.length ? { variants: true } : {}) }, mode, existing ? currentValues(existing, c) : undefined)
  if (mode === 'create') {
    const priceAllowed = 'price' in allowedMain || 'salePrice' in allowedMain
    if (!(priceAllowed && main.price)) {
      const variantPrices = variantPlans.map((vp) => Number(vp.price)).filter((n) => n > 0)
      if (variantPrices.length && ctx.settings.policies.variants?.create) {
        derivedPrice = String(Math.min(...variantPrices))
        messages.push({ level: 'info', text: `قیمت پایه از کمترین قیمت تنوع‌ها (${money(derivedPrice)}) گرفته شد` })
      } else return failWith(priceAllowed
        ? 'امکان ساخت محصول نیست؛ فیلد الزامی «قیمت» در فایل مقدار ندارد و مقدار جایگزین معتبری (قیمت تنوع‌ها) وجود ندارد'
        : 'امکان ساخت محصول نیست؛ فیلد الزامی «قیمت» از ورود اطلاعات کنار گذاشته شده و مقدار جایگزین معتبری وجود ندارد')
    }
    if (!('title' in allowedMain)) return failWith('امکان ساخت محصول نیست؛ فیلد الزامی «نام محصول» در فایل نیست یا از ورود اطلاعات کنار گذاشته شده')
  } else if (existing?.pricingMode === 'FX' && ('price' in allowedMain || 'salePrice' in allowedMain)) {
    messages.push({ level: 'warning', text: 'قیمت این محصول ارزی (از نرخ روز) محاسبه می‌شود؛ قیمت فایل روی آن اعمال نمی‌شود' })
  }
  const priceNote = currencyConflict(existing, o)
  if (priceNote && (('price' in allowedMain || 'salePrice' in allowedMain) || variantPlans.some((vp) => vp.existingId && vp.price))) messages.push({ level: 'warning', text: priceNote })

  // Images.
  const image = toText(values.image, 2048)
  const gallery = ((values.gallery as string[] | undefined) || []).slice(0, 12)
  if ((values.gallery as string[] | undefined)?.length && (values.gallery as string[]).length > 12) messages.push({ level: 'warning', text: 'گالری محصول حداکثر ۱۲ تصویر دارد؛ بقیه وارد نمی‌شود' })
  countImages(ctx, [...('image' in allowedMain && image ? [image] : []), ...('gallery' in allowedMain ? gallery : []), ...('description' in allowedMain ? htmlImageUrls(String(values.description || '')) : []), ...variantPlans.map((vp) => vp.image).filter(Boolean)], counters)

  // Counters and preview.
  for (const vp of variantPlans) counters[vp.existingId ? 'variantsUpdated' : 'variantsCreated'] = (counters[vp.existingId ? 'variantsUpdated' : 'variantsCreated'] || 0) + 1
  if (missingVariantIds.length && o.missingVariants !== 'keep') counters[o.missingVariants === 'delete' ? 'variantsDeleted' : 'variantsDisabled'] = missingVariantIds.length
  if (missingVariantIds.length && o.missingVariants === 'keep') messages.push({ level: 'info', text: `${missingVariantIds.length} تنوع موجود در فایل نیست و بدون تغییر می‌ماند` })
  if (action === 'UPDATE' && !Object.keys(allowedMain).length && !variantPlans.length) { action = 'SKIP'; messages.push({ level: 'info', text: 'هیچ فیلدی برای به‌روزرسانی فعال نیست' }) }

  const data: Data = { existing, values, categoryPath, brandName, group, newFields, newOptions, specs, kind, variants: variantPlans, missingVariantIds, images: { image, gallery }, derivedPrice }
  const lines: PreviewLine[] = ctx.previewLines(FIELDS.filter((f) => !f.implicit && f.key !== 'category'), values, allowedMain, (key, value) => (key === 'price' || key === 'salePrice' ? money(value) : Array.isArray(value) ? `${value.length} تصویر` : toText(value, 120)))
  if (categoryPath.length) lines.unshift({ label: 'دسته', value: categoryPath.join(' › '), state: 'category' in allowedMain ? (category ? 'IMPORTED' : 'NEW') : 'IGNORED' })
  lines.push({ label: 'نوع محصول', value: kind === 'PHYSICAL' ? 'فیزیکی' : 'مجازی / دیجیتال', state: mode === 'create' || 'kind' in allowedMain ? 'IMPORTED' : 'UNCHANGED' })
  if (group) lines.push({ label: 'گروه ویژگی', value: `${group.name}${group.create ? ' (جدید)' : ''}${group.link ? ' — به دسته وصل می‌شود' : ''}`, state: group.create ? 'NEW' : 'IMPORTED' })
  for (const a of attrPlans) lines.push({ label: `ویژگی: ${a.label}`, value: a.value, state: 'specifications' in allowedMain ? (a.create || a.createOption ? 'NEW' : 'IMPORTED') : 'IGNORED' })
  if (derivedPrice) lines.push({ label: 'قیمت پایه', value: money(derivedPrice), state: 'IMPORTED' })
  const children = variantPlans.slice(0, 30).map((vp) => {
    const allowedV = ctx.allowVariant({ ...vp.values, sku: vp.sku }, vp.existingId ? 'update' : 'create')
    return {
      title: `${Object.values(vp.attributes).join(' / ')}${vp.existingId ? ' (موجود)' : ''}`,
      lines: [
        { label: 'SKU', value: vp.sku, state: vp.existingId ? ('sku' in allowedV ? 'IMPORTED' : 'UNCHANGED') : 'IMPORTED' },
        ...(vp.price ? [{ label: 'قیمت', value: money(vp.price), state: 'price' in allowedV || 'salePrice' in allowedV ? 'IMPORTED' : 'IGNORED' }] : []),
        ...(vp.stock !== null ? [{ label: 'موجودی', value: vp.stock === -1 ? 'بدون محدودیت' : String(vp.stock), state: 'stock' in allowedV || 'stockStatus' in allowedV ? 'IMPORTED' : 'IGNORED' }] : []),
        ...(vp.image ? [{ label: 'تصویر', value: '۱ تصویر', state: 'image' in allowedV ? 'IMPORTED' : 'IGNORED' }] : []),
      ] as PreviewLine[],
    }
  })
  if (variantPlans.length) lines.push({ label: 'تنوع‌ها', value: `${variantPlans.length} تنوع`, state: 'variants' in allowedMain ? 'IMPORTED' : 'IGNORED' })
  const imageCount = (image ? 1 : 0) + gallery.length
  return {
    action, title, sourceKey, entityId: existing?.id, messages, counters, data, findings,
    preview: { title, subtitle: [brandName, categoryPath.join(' › ')].filter(Boolean).join(' · '), image, action, lines: [...lines, ...(imageCount ? [{ label: 'تصاویر', value: String(imageCount), state: 'IMPORTED' as const }] : [])], children, messages },
  }
}

/** The existing product as field values ("fill empty fields only" compares against these). */
function currentValues(p: Existing, c: Caches): Record<string, unknown> {
  const brand = p.brandId ? c.brands.get(p.brandId)?.name : ''
  return {
    title: p.name, titleEn: p.nameEn, sku: p.sku, description: p.description, shortDescription: p.shortDescription, image: p.image,
    gallery: p.gallery === '[]' ? '' : p.gallery, price: p.priceMinor > 0n ? p.priceMinor : '', salePrice: p.compareAtMinor > 0n ? p.priceMinor : '',
    stock: p.stock === -1 ? '' : p.stock, category: p.categoryId ? String(p.categoryId) : '', brand, specifications: p.specifications === '{}' ? '' : p.specifications,
    currency: p.currency, kind: p.kind, status: p.active ? 'active' : 'inactive',
  }
}

// ------------------------------------------------------------------ writing

async function uniqueSlug(client: Client, base: string, table: 'product' | 'productCategory' | 'productBrand', taken?: Set<string>): Promise<string> {
  const clean = base.slice(0, 90) || 'item'
  for (let n = 1; n < 500; n++) {
    const candidate = n === 1 ? clean : `${clean}-${n}`
    if (taken?.has(candidate)) continue
    const hit = table === 'product' ? await client.product.findUnique({ where: { slug: candidate }, select: { id: true } })
      : table === 'productCategory' ? await client.productCategory.findUnique({ where: { slug: candidate }, select: { id: true } })
        : await client.productBrand.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!hit) return candidate
  }
  return `${clean}-${Date.now().toString(36)}`
}

/** Missing categories along a path, created top-down (each in its own small transaction). */
async function ensureCategory(ctx: ImportContext, c: Caches, path: string[], changes: Change[], counters: Counters): Promise<Cat | null> {
  if (!path.length) return null
  const walk = walkPath(c, path)
  if (walk.found) return walk.found
  let parent = walk.existing[walk.existing.length - 1] || null
  for (const name of walk.missing) {
    const slug = await uniqueSlug(db, latinSlug(name) || slugify(name) || `cat-${suffixOf(path.join('>'))}`, 'productCategory', c.catSlugs)
    const created = await db.productCategory.create({ data: { slug, name: name.slice(0, 120), parentId: parent?.id ?? null } })
    const cat: Cat = { id: created.id, slug, name: created.name, nameEn: '', parentId: parent?.id ?? null, attributeGroupId: null }
    c.cats.set(cat.id, cat); c.catSlugs.add(slug)
    changes.push({ kind: 'created', entity: 'productCategory', id: cat.id, stamp: JSON.stringify({ slug, name: cat.name, parentId: cat.parentId }) })
    counters.categoriesCreated = (counters.categoriesCreated || 0) + 1
    parent = cat
  }
  void ctx
  return parent
}

async function ensureBrand(ctx: ImportContext, c: Caches, name: string, changes: Change[], counters: Counters): Promise<Brand | null> {
  if (!name) return null
  const hit = findBrand(c, name)
  if (hit) return hit
  const slug = await uniqueSlug(db, latinSlug(name) || slugify(name) || `brand-${suffixOf(name)}`, 'productBrand', c.brandSlugs)
  const created = await db.productBrand.create({ data: { slug, name: name.slice(0, 120) } })
  const brand: Brand = { id: created.id, slug, name: created.name, nameEn: '' }
  c.brands.set(brand.id, brand); c.brandSlugs.add(slug)
  changes.push({ kind: 'created', entity: 'productBrand', id: brand.id, stamp: created.updatedAt.toISOString() })
  await saveIdentity(db, ctx, E.brand, normalizeName(name), brand.id)
  counters.brandsCreated = (counters.brandsCreated || 0) + 1
  return brand
}

/** The attribute group (created if planned), its new fields/options, and the category link. */
async function ensureGroup(c: Caches, data: Data, category: Cat | null, kind: Kind, changes: Change[], counters: Counters): Promise<Group | null> {
  if (!data.group) return null
  let group = data.group.id ? c.groups.get(data.group.id) || null : findGroup(c, data.group.name)
  if (!group) {
    const created = await db.productAttributeGroup.create({ data: { name: data.group.name.slice(0, 120), appliesTo: 'ANY', fields: '[]' } })
    group = { id: created.id, name: created.name, nameEn: '', appliesTo: 'ANY', fields: [] }
    c.groups.set(group.id, group)
    changes.push({ kind: 'created', entity: 'productAttributeGroup', id: group.id, stamp: created.updatedAt.toISOString() })
    counters.groupsCreated = (counters.groupsCreated || 0) + 1
  }
  // New attributes and values go into the group definition (re-read inside the transaction so concurrent edits are kept).
  if (data.newFields.length || data.newOptions.length) {
    await db.$transaction(async (tx) => {
      const row = await tx.productAttributeGroup.findUnique({ where: { id: group!.id } })
      if (!row) throw new Error('گروه ویژگی حذف شده است')
      const fields = validateFields(row.fields)
      const before = JSON.stringify(fields)
      for (const nf of data.newFields) {
        const same = findAttribute(fields, nf.label)
        if (same) { if (same.key !== nf.key) { for (const opt of data.newOptions) if (opt.key === nf.key) opt.key = same.key; for (const vp of data.variants) if (nf.key in vp.attributes) { vp.attributes[same.key] = vp.attributes[nf.key]; delete vp.attributes[nf.key] } if (nf.key in data.specs) { data.specs[same.key] = data.specs[nf.key]; delete data.specs[nf.key] } } continue }
        if (fields.length >= 30) throw new Error(`گروه «${row.name}» حداکثر ۳۰ ویژگی دارد`)
        fields.push({ ...nf, options: [] })
        counters.attributesCreated = (counters.attributesCreated || 0) + 1
      }
      for (const opt of data.newOptions) {
        const field = fields.find((f) => f.key === opt.key)
        if (!field || field.kind === 'text') continue
        if (field.options.some((existing) => normalizeValue(existing) === normalizeValue(opt.value))) continue
        if (field.options.length >= 40) throw new Error(`ویژگی «${field.label}» حداکثر ۴۰ مقدار دارد`)
        field.options.push(opt.value)
        counters.valuesCreated = (counters.valuesCreated || 0) + 1
      }
      const after = JSON.stringify(validateFields(fields))
      if (after !== before) {
        await tx.productAttributeGroup.update({ where: { id: group!.id }, data: { fields: after } })
        changes.push({ kind: 'updated', entity: 'productAttributeGroup', id: group!.id, before: { fields: before }, after: { fields: after } })
      }
      group!.fields = validateFields(after)
    })
  }
  if (group.appliesTo !== 'ANY' && group.appliesTo !== kind) throw new Error(`گروه ویژگی «${group.name}» مخصوص نوع دیگری از محصول است`)
  if (data.group.link && category && !category.attributeGroupId) {
    await db.productCategory.update({ where: { id: category.id }, data: { attributeGroupId: group.id } })
    changes.push({ kind: 'updated', entity: 'productCategory', id: category.id, before: { attributeGroupId: null }, after: { attributeGroupId: group.id } })
    category.attributeGroupId = group.id
    counters.groupsLinked = (counters.groupsLinked || 0) + 1
  }
  return group
}

const PRODUCT_TRACKED = ['name', 'nameEn', 'slug', 'sku', 'description', 'shortDescription', 'image', 'gallery', 'price', 'priceMinor', 'compareAtMinor', 'currency', 'stock', 'kind', 'categoryId', 'brandId', 'specifications', 'weightGrams', 'warranty', 'active', 'featured', 'saleEndsAt', 'seoTitle', 'seoDescription']
const VARIANT_TRACKED = ['sku', 'name', 'attributes', 'price', 'priceMinor', 'compareAtMinor', 'stock', 'active', 'image']

function apply(item: SourceItem, planned: Plan, ctx: ImportContext): Promise<ApplyResult> {
  return tracked((changes) => applyProduct(item, planned, ctx, changes))
}

async function applyProduct(_item: SourceItem, planned: Plan, ctx: ImportContext, changes: Change[]): Promise<ApplyResult> {
  const data = planned.data as Data
  const o = ctx.settings.options as unknown as Opt
  const c = await caches(ctx)
  const messages: Message[] = []
  const counters: Counters = {}
  const creating = planned.action === 'CREATE'
  // The same product earlier in this file: update what it created.
  let existing = data.existing
  if (!existing && !creating) {
    const externalId = toText(data.values.externalId, 190)
    const id = externalId ? identityOf(ctx, E.product, externalId) : undefined
    const row = id ? await db.product.findUnique({ where: { id }, select: PRODUCT_SELECT }) : toText(data.values.sku, 80) ? await db.product.findFirst({ where: { sku: toText(data.values.sku, 80) }, select: PRODUCT_SELECT }) : null
    if (!row) throw new Error('محصول تکراریِ پیشین در این فایل پیدا نشد')
    existing = row
  }
  const mode = existing ? 'update' : 'create'
  const allowed = ctx.allow({ ...data.values, ...(Object.keys(data.specs).length || ctx.settings.specsSource ? { specifications: data.specs } : {}), ...(data.variants.length ? { variants: true } : {}) }, mode, existing ? currentValues(existing, c) : undefined)

  // Relations (small transactions, cached for the rest of the run).
  const category = 'category' in allowed ? await ensureCategory(ctx, c, data.categoryPath, changes, counters) : existing?.categoryId ? c.cats.get(existing.categoryId) || null : null
  if ('category' in allowed && data.categoryPath.length && !category) throw new Error('دسته ساخته نشد')
  const brand = 'brand' in allowed ? await ensureBrand(ctx, c, data.brandName, changes, counters) : null
  const group = await ensureGroup(c, data, category, data.kind, changes, counters)

  // Images into the media library.
  const row: Record<string, unknown> = {}
  if ('image' in allowed && data.images.image) { const [img] = await importImages(ctx, [data.images.image], messages, counters, 'تصویر شاخص'); if (img) row.image = img }
  if ('gallery' in allowed && data.images.gallery.length) { const imgs = await importImages(ctx, data.images.gallery, messages, counters, 'گالری'); row.gallery = JSON.stringify([...new Set(imgs)].slice(0, 12)) }
  if ('description' in allowed) row.description = cleanRichText(await localizeHtml(ctx, String(data.values.description || ''), messages, counters, 'تصویر توضیحات'))

  // Plain columns.
  if ('title' in allowed) row.name = toText(allowed.title, 200)
  if ('titleEn' in allowed) row.nameEn = toText(allowed.titleEn, 200)
  if ('shortDescription' in allowed) row.shortDescription = richTextToPlain(String(allowed.shortDescription), 600)
  if ('sku' in allowed) {
    const sku = toText(allowed.sku, 80)
    if (SKU_PATTERN.test(sku)) row.sku = sku
    else messages.push({ level: 'warning', text: `SKU «${sku}» فقط حروف لاتین، عدد، نقطه، خط تیره و زیرخط می‌تواند داشته باشد؛ وارد نشد` })
  }
  if ('warranty' in allowed) row.warranty = toText(allowed.warranty, 160).replace(/[<>]/g, '')
  if ('seoTitle' in allowed) row.seoTitle = toText(allowed.seoTitle, 120).replace(/[<>]/g, '')
  if ('seoDescription' in allowed) row.seoDescription = toText(allowed.seoDescription, 320).replace(/[<>]/g, '')
  if ('weight' in allowed) { const w = Number(allowed.weight); if (Number.isSafeInteger(w) && w >= 0 && w <= 1_000_000) row.weightGrams = w; else messages.push({ level: 'warning', text: 'وزن نامعتبر است؛ وارد نشد' }) }
  if ('featured' in allowed) row.featured = allowed.featured === true
  if ('status' in allowed) row.active = allowed.status === 'active'
  else if (!existing) row.active = o.newStatus === 'active'
  if ('saleEndsAt' in allowed) row.saleEndsAt = allowed.saleEndsAt as Date
  if ('createdAt' in allowed && !existing) row.createdAt = allowed.createdAt as Date
  if ('category' in allowed && category) row.categoryId = category.id
  if ('brand' in allowed && brand) row.brandId = brand.id
  if (!existing || 'kind' in allowed) row.kind = data.kind
  if ('stock' in allowed || 'stockStatus' in allowed) {
    const stock = stockOf('stock' in allowed ? allowed.stock as number : null, 'stockStatus' in allowed ? allowed.stockStatus as string : null)
    if (stock !== null) row.stock = stock
  }
  // Currency is explicit: a new product gets the file's (mapped column, else the import option), never a database default.
  let currency = existing?.currency || o.currency
  if (!existing && 'currency' in allowed) { try { currency = normalizeCurrency(allowed.currency, o.currency) } catch { messages.push({ level: 'warning', text: `واحد پول «${toText(allowed.currency, 10)}» نامعتبر است؛ ${o.currency} استفاده شد` }) } }
  if (!existing) row.currency = currency
  const pricesUsable = !currencyConflict(existing, o)
  const priceAllowed = ('price' in allowed || 'salePrice' in allowed) && existing?.pricingMode !== 'FX' && pricesUsable
  if (priceAllowed || (!existing && data.derivedPrice)) {
    const regular = 'price' in allowed ? allowed.price as string : null
    const sale = 'salePrice' in allowed ? allowed.salePrice as string : null
    let { price, compareAt } = splitPrice(regular, sale)
    if (!price && data.derivedPrice) { price = data.derivedPrice; compareAt = null }
    if (price) {
      const priceMinor = toMinor(price, currency)
      row.priceMinor = priceMinor
      row.price = legacyNumber(priceMinor, currency)
      row.currency = currency
      const compareMinor = compareAt ? toMinor(compareAt, currency) : 0n
      if (compareAt || 'price' in allowed) row.compareAtMinor = compareMinor > priceMinor ? compareMinor : 0n
    }
  }
  if (!existing && !row.priceMinor) throw new Error('محصول بدون قیمت ساخته نمی‌شود')

  // Specifications: the group's non-variation attributes, checked by the store's own validator.
  if ('specifications' in allowed && group) {
    row.specifications = validateSpecifications(mergedSpecs(existing, data.specs, ctx.settings.existing === 'replace', group.fields), group.fields.filter((f) => !f.variant))
  } else if (!existing && group) row.specifications = validateSpecifications({}, group.fields.filter((f) => !f.variant))

  // Variant images before the transaction (network must not hold a database transaction open).
  const variantImages = new Map<number, string>()
  for (const vp of data.variants) {
    if (!vp.image) continue
    const allowedV = ctx.allowVariant({ ...vp.values }, vp.existingId ? 'update' : 'create')
    if (!('image' in allowedV)) continue
    const [img] = await importImages(ctx, [vp.image], messages, counters, `تصویر تنوع ${Object.values(vp.attributes).join(' / ')}`)
    if (img) variantImages.set(vp.index, img)
  }

  const externalId = toText(data.values.externalId, 190)
  // Changes made inside the transaction are only kept if it commits.
  const mark = changes.length
  const result = await db.$transaction(async (tx) => {
    let productId: number
    if (!existing) {
      row.slug = await uniqueSlug(tx, toText(data.values.slug, 100) || latinSlug(data.values.titleEn || data.values.title, 80) || latinSlug(data.values.sku, 60) || `product-${suffixOf(planned.sourceKey || planned.title)}`, 'product')
      row.approval = 'APPROVED'
      const created = await tx.product.create({ data: row as never, select: { id: true, updatedAt: true } })
      productId = created.id
      changes.push({ kind: 'created', entity: 'product', id: productId, stamp: created.updatedAt.toISOString() })
    } else {
      productId = existing.id
      const current = await tx.product.findUnique({ where: { id: productId } })
      const before = snapshot(current as Record<string, unknown>, Object.keys(row))
      if (Object.keys(row).length) {
        const updated = await tx.product.update({ where: { id: productId }, data: row as never })
        changes.push({ kind: 'updated', entity: 'product', id: productId, before, after: snapshot(updated as Record<string, unknown>, Object.keys(row)) })
      }
    }
    if (externalId) await saveIdentity(tx, ctx, E.product, externalId, productId)

    // Variants: matched by external id, SKU or attribute combination; nothing is duplicated.
    if ('variants' in allowed) {
      const currentVariants = await tx.productVariant.findMany({ where: { productId } })
      for (const vp of data.variants) {
        const match = currentVariants.find((v) => v.id === vp.existingId) || currentVariants.find((v) => v.sku === vp.sku)
          || currentVariants.find((v) => { try { return combinationKey(JSON.parse(v.attributes || '{}')) === combinationKey(vp.attributes) } catch { return false } })
        const vMode = match ? 'update' : 'create'
        const allowedV = ctx.allowVariant({ ...vp.values, sku: vp.sku }, vMode)
        const v: Record<string, unknown> = {}
        if (('price' in allowedV || 'salePrice' in allowedV) && vp.price && pricesUsable) {
          const priceMinor = toMinor(vp.price, currency)
          v.priceMinor = priceMinor; v.price = legacyNumber(priceMinor, currency)
          v.compareAtMinor = vp.compareAt ? (toMinor(vp.compareAt, currency) > priceMinor ? toMinor(vp.compareAt, currency) : 0n) : 0n
        }
        if ('stock' in allowedV || 'stockStatus' in allowedV) { const s = stockOf('stock' in allowedV ? vp.values.stock as number : null, 'stockStatus' in allowedV ? (vp.values.stockStatus as string) : null); if (s !== null) v.stock = s }
        if ('image' in allowedV && variantImages.has(vp.index)) v.image = variantImages.get(vp.index)
        if ('active' in allowedV && vp.active !== null) v.active = vp.active
        if (!match) {
          const owner = await tx.productVariant.findUnique({ where: { sku: vp.sku }, select: { productId: true } })
          if (owner) { messages.push({ level: 'error', text: `SKU تنوع «${vp.sku}» متعلق به محصول دیگری است؛ این تنوع ساخته نشد` }); continue }
          const created = await tx.productVariant.create({ data: { productId, sku: vp.sku, name: vp.name, attributes: JSON.stringify(vp.attributes), ...v } as never })
          changes.push({ kind: 'created', entity: 'productVariant', id: created.id, stamp: JSON.stringify(snapshot(created as Record<string, unknown>, VARIANT_TRACKED)) })
          counters.variantsCreated = (counters.variantsCreated || 0) + 1
          if (vp.externalId) await saveIdentity(tx, ctx, E.variant, vp.externalId, created.id)
        } else {
          if ('sku' in allowedV && vp.sku !== match.sku && !vp.skuGenerated) {
            const owner = await tx.productVariant.findUnique({ where: { sku: vp.sku }, select: { id: true } })
            if (owner && owner.id !== match.id) messages.push({ level: 'warning', text: `SKU «${vp.sku}» قبلاً استفاده شده؛ SKU تنوع تغییر نکرد` })
            else v.sku = vp.sku
          }
          if ('name' in allowedV && toText(vp.values.name, 120)) v.name = toText(vp.values.name, 120)
          if (Object.keys(v).length) {
            const before = snapshot(match as unknown as Record<string, unknown>, Object.keys(v))
            const updated = await tx.productVariant.update({ where: { id: match.id }, data: v as never })
            changes.push({ kind: 'updated', entity: 'productVariant', id: match.id, before, after: snapshot(updated as unknown as Record<string, unknown>, Object.keys(v)) })
            counters.variantsUpdated = (counters.variantsUpdated || 0) + 1
          }
          if (vp.externalId) await saveIdentity(tx, ctx, E.variant, vp.externalId, match.id)
        }
      }
      // Variants missing from the file: kept (default), disabled, or deleted when nothing refers to them.
      if (existing && data.missingVariantIds.length && o.missingVariants !== 'keep') {
        for (const id of data.missingVariantIds) {
          const current = currentVariants.find((v) => v.id === id)
          if (!current) continue
          const used = o.missingVariants === 'delete' ? await tx.orderLine.count({ where: { variantId: id } }) + await tx.inventoryReservation.count({ where: { variantId: id } }) : 0
          if (o.missingVariants === 'delete' && o.confirmDelete && !used) {
            await tx.productVariant.delete({ where: { id } })
            changes.push({ kind: 'created', entity: 'deletedVariant', id, stamp: JSON.stringify({ ...snapshot(current as unknown as Record<string, unknown>, VARIANT_TRACKED), productId }) })
            counters.variantsDeleted = (counters.variantsDeleted || 0) + 1
          } else if (current.active) {
            await tx.productVariant.update({ where: { id }, data: { active: false } })
            changes.push({ kind: 'updated', entity: 'productVariant', id, before: { active: true }, after: { active: false } })
            counters.variantsDisabled = (counters.variantsDisabled || 0) + 1
            if (used) messages.push({ level: 'warning', text: `تنوع «${current.sku}» در سفارش‌ها استفاده شده؛ به‌جای حذف غیرفعال شد` })
          }
        }
      }
    }
    return productId
  }, { timeout: 30_000 }).catch((error) => { changes.length = mark; throw error })
  const owners = (ctx.cache.get('variantSkus') as Map<string, number> | undefined) || new Map<string, number>()
  for (const vp of data.variants) owners.set(vp.sku, result)
  return { action: existing ? 'UPDATE' : 'CREATE', entityType: 'product', entityId: result, changes, messages, counters }
}

// ------------------------------------------------------------------ rollback

async function rollback(changes: Change[]) {
  const conflicts: string[] = []
  let undone = 0
  for (const change of [...changes].reverse()) {
    let problem: string | null = null
    if (change.entity === 'product') {
      problem = await undoChange(change, 'product', {
        label: 'محصول', dates: ['saleEndsAt'], bigints: ['priceMinor', 'compareAtMinor'],
        canDelete: async (id) => {
          const [orders, lines, invoices, reviews] = await Promise.all([db.order.count({ where: { productId: id } }), db.orderLine.count({ where: { productId: id } }), db.invoice.count({ where: { productId: id } }), db.productReview.count({ where: { productId: id } })])
          return orders + lines + invoices + reviews ? 'سفارش، فاکتور یا دیدگاه دارد' : null
        },
      })
    } else if (change.entity === 'productVariant') {
      if (change.kind === 'created') {
        const row = await db.productVariant.findUnique({ where: { id: change.id } })
        if (row) {
          const same = JSON.stringify(snapshot(row as unknown as Record<string, unknown>, VARIANT_TRACKED)) === change.stamp
          const used = await db.orderLine.count({ where: { variantId: change.id } })
          if (!same) problem = `تنوع #${change.id} پس از ورود اطلاعات تغییر کرده؛ حذف نشد`
          else if (used) problem = `تنوع #${change.id} در سفارش‌ها استفاده شده؛ حذف نشد`
          else await db.productVariant.delete({ where: { id: change.id } })
        }
      } else problem = await undoChange(change, 'productVariant', { label: 'تنوع', bigints: ['priceMinor', 'compareAtMinor'] })
    } else if (change.entity === 'deletedVariant') {
      // A variant this import deleted comes back with its old values.
      const saved = (change.kind === 'created' ? JSON.parse(change.stamp || '{}') : {}) as Record<string, unknown>
      const taken = await db.productVariant.findUnique({ where: { sku: String(saved.sku) } })
      const product = await db.product.findUnique({ where: { id: Number(saved.productId) }, select: { id: true } })
      if (taken || !product) problem = `تنوع حذف‌شدهٔ «${saved.sku}» قابل بازگرداندن نیست`
      else await db.productVariant.create({ data: { productId: product.id, sku: String(saved.sku), name: String(saved.name), attributes: String(saved.attributes), price: Number(saved.price), priceMinor: BigInt(String(saved.priceMinor)), compareAtMinor: BigInt(String(saved.compareAtMinor)), stock: Number(saved.stock), active: saved.active === true, image: String(saved.image || '') } })
    } else if (change.entity === 'productCategory') {
      if (change.kind === 'updated') problem = await undoChange(change, 'productCategory', { label: 'دسته' })
      else {
        const row = await db.productCategory.findUnique({ where: { id: change.id }, include: { _count: { select: { products: true, children: true } } } })
        if (row) {
          const same = JSON.stringify({ slug: row.slug, name: row.name, parentId: row.parentId }) === change.stamp
          if (!same) problem = `دستهٔ «${row.name}» پس از ورود اطلاعات تغییر کرده؛ حذف نشد`
          else if (row._count.products || row._count.children) problem = `دستهٔ «${row.name}» هنوز محصول یا زیردسته دارد؛ حذف نشد`
          else await db.productCategory.delete({ where: { id: change.id } })
        }
      }
    } else if (change.entity === 'productBrand') {
      problem = await undoChange(change, 'productBrand', { label: 'برند', canDelete: async (id) => ((await db.product.count({ where: { brandId: id } })) ? 'هنوز محصول دارد' : null) })
    } else if (change.entity === 'productAttributeGroup') {
      if (change.kind === 'created') problem = await undoChange(change, 'productAttributeGroup', { label: 'گروه ویژگی', canDelete: async (id) => ((await db.productCategory.count({ where: { attributeGroupId: id } })) ? 'هنوز به دسته‌ای متصل است' : null) })
      else problem = await rollbackGroupFields(change)
    }
    if (problem) conflicts.push(problem); else undone++
  }
  return { undone, conflicts }
}

/** New attributes/values of a group are removed only if no product still uses them. */
async function rollbackGroupFields(change: Extract<Change, { kind: 'updated' }>): Promise<string | null> {
  const row = await db.productAttributeGroup.findUnique({ where: { id: change.id }, include: { categories: { select: { id: true } } } })
  if (!row) return null
  if (row.fields !== change.after.fields) return `گروه ویژگی «${row.name}» پس از ورود اطلاعات ویرایش شده؛ ویژگی‌های اضافه‌شده دست نخورد`
  const before = validateFields(String(change.before.fields))
  const after = validateFields(row.fields)
  const products = await db.product.findMany({ where: { categoryId: { in: row.categories.map((cat) => cat.id) } }, select: { specifications: true, variants: { select: { attributes: true } } } })
  const used = new Map<string, Set<string>>()
  for (const p of products) for (const raw of [p.specifications, ...p.variants.map((v) => v.attributes)]) {
    try { for (const [k, v] of Object.entries(JSON.parse(raw || '{}') as Record<string, string>)) { if (!used.has(k)) used.set(k, new Set()); used.get(k)!.add(normalizeValue(v)) } } catch { /* skip */ }
  }
  const restored = after.map((field) => {
    const old = before.find((f) => f.key === field.key)
    if (!old) return used.has(field.key) ? field : null
    return { ...field, options: field.options.filter((opt) => old.options.includes(opt) || used.get(field.key)?.has(normalizeValue(opt))) }
  }).filter((f): f is AttributeField => !!f)
  await db.productAttributeGroup.update({ where: { id: row.id }, data: { fields: JSON.stringify(restored) } })
  return restored.length !== before.length || restored.some((f, i) => f.options.length !== before[i]?.options.length) ? `بخشی از ویژگی‌های اضافه‌شده به «${row.name}» هنوز در محصولات استفاده می‌شود و ماند` : null
}

// ------------------------------------------------------------------ registration

async function choices(key: string) {
  if (key === 'groupFixed' || key === 'groupMap') return (await db.productAttributeGroup.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })).map((g) => ({ value: String(g.id), label: g.name }))
  if (key === 'attributeMap') {
    const groups = await db.productAttributeGroup.findMany({ select: { name: true, fields: true } })
    return groups.flatMap((g) => { try { return validateFields(g.fields).map((f) => ({ value: f.key, label: `${g.name}: ${f.label} (${f.key})` })) } catch { return [] } })
  }
  return []
}

export const storeImporter: ImportAdapter = {
  id: 'store', label: 'فروشگاه — محصولات', entity: 'محصول', module: 'store',
  description: 'محصولات فیزیکی و مجازی با دسته، برند، گروه ویژگی، مشخصات فنی، تنوع (رنگ، حافظه…) و تصاویر',
  fields: FIELDS, variantFields: VARIANT_FIELDS,
  supports: { variants: true, attributes: true, specs: true },
  identity: ['شناسهٔ خارجی (external id)', 'SKU', 'نامک (slug)'],
  options: [
    { key: 'currency', label: 'واحد پول قیمت‌های فایل', type: 'select', step: 8, default: 'IRT', choices: [{ value: 'IRT', label: 'تومان' }, { value: 'IRR', label: 'ریال' }, { value: 'USD', label: 'دلار' }, { value: 'EUR', label: 'یورو' }, { value: 'AED', label: 'درهم' }] },
    { key: 'categorySeparator', label: 'جداکنندهٔ سطح‌های دسته', type: 'select', step: 4, default: '>', choices: [{ value: '>', label: 'A > B > C' }, { value: '/', label: 'A / B / C' }, { value: '|', label: 'A | B | C' }] },
    { key: 'missingCategories', label: 'دستهٔ موجود نیست', type: 'select', step: 4, default: 'create', choices: [{ value: 'create', label: 'ساخته شود' }, { value: 'error', label: 'خطا' }] },
    { key: 'missingBrands', label: 'برند موجود نیست', type: 'select', step: 4, default: 'create', choices: [{ value: 'create', label: 'ساخته شود' }, { value: 'error', label: 'خطا' }] },
    { key: 'productType', label: 'نوع محصول', type: 'select', step: 4, default: 'auto', choices: [{ value: 'auto', label: 'تشخیص خودکار' }, { value: 'PHYSICAL', label: 'فیزیکی' }, { value: 'VIRTUAL', label: 'مجازی / دیجیتال' }] },
    { key: 'groupMode', label: 'گروه ویژگی محصولات', type: 'select', step: 4, default: 'category', choices: [{ value: 'category', label: 'از گروهِ دستهٔ محصول' }, { value: 'source', label: 'از ستون «گروه ویژگی» فایل' }, { value: 'fixed', label: 'یک گروه برای همهٔ محصولات' }, { value: 'map', label: 'نگاشت دسته‌های فایل به گروه‌ها' }, { value: 'none', label: 'بدون گروه ویژگی (بدون مشخصات و تنوع)' }] },
    { key: 'groupFixed', label: 'گروه ویژگی برای همه', type: 'select', step: 4, dynamic: true, when: { key: 'groupMode', values: ['fixed'] } },
    { key: 'groupMap', label: 'دستهٔ فایل ← گروه ویژگی', type: 'valueMap', step: 4, dynamic: true, valuesOf: 'category', when: { key: 'groupMode', values: ['map'] } },
    { key: 'missingGroups', label: 'گروه ویژگیِ فایل موجود نیست', type: 'select', step: 4, default: 'error', choices: [{ value: 'create', label: 'ساخته شود' }, { value: 'manual', label: 'نگاشت دستی لازم است' }, { value: 'error', label: 'خطا' }], when: { key: 'groupMode', values: ['source'] } },
    { key: 'missingAttributes', label: 'ویژگی ناشناخته (در گروه ویژگی محصول تعریف نشده)', type: 'select', step: 4, default: 'ignore', hint: 'ویژگی نامرتبط هرگز بی‌اجازه به محصول اضافه نمی‌شود؛ موارد در اجرای آزمایشی فهرست می‌شوند', choices: [{ value: 'ignore', label: 'نادیده گرفته شود' }, { value: 'manual', label: 'نگاشت دستی به ویژگی موجود' }, { value: 'add', label: 'به گروه ویژگی اضافه شود' }, { value: 'reject', label: 'رکورد رد شود' }] },
    { key: 'attributeMap', label: 'ویژگی فایل ← ویژگی موجود', type: 'valueMap', step: 4, dynamic: true, valuesOf: '__attributes__' },
    { key: 'missingValues', label: 'گزینهٔ جدید (مقدار در گزینه‌های ویژگی نیست)', type: 'select', step: 4, default: 'reject', hint: 'مثلاً «1TB» برای حافظه‌ای که فقط 128/256/512 دارد', choices: [{ value: 'add', label: 'به گزینه‌های گروه ویژگی اضافه شود' }, { value: 'map', label: 'نگاشت به گزینهٔ موجود' }, { value: 'ignore', label: 'نادیده گرفته شود' }, { value: 'reject', label: 'رکورد رد شود' }] },
    { key: 'optionMap', label: 'مقدار جدید ← گزینهٔ موجود', type: 'valueMap', step: 4, valuesOf: '__options__', hint: 'از فهرست «گزینه‌های جدید» اجرای آزمایشی پر می‌شود' },
    { key: 'missingVariants', label: 'تنوع‌های موجودی که در فایل نیستند', type: 'select', step: 8, default: 'keep', choices: [{ value: 'keep', label: 'بدون تغییر بمانند' }, { value: 'disable', label: 'غیرفعال شوند' }, { value: 'delete', label: 'حذف شوند (برگشت‌ناپذیر)' }] },
    { key: 'confirmDelete', label: 'حذف تنوع‌های غایب را تأیید می‌کنم (تنوع‌های دارای سفارش فقط غیرفعال می‌شوند)', type: 'bool', step: 8, default: false, destructive: true, when: { key: 'missingVariants', values: ['delete'] } },
    { key: 'newStatus', label: 'وضعیت محصولات جدید (اگر ستون وضعیت نگاشت نشده)', type: 'select', step: 8, default: 'active', choices: [{ value: 'active', label: 'فعال' }, { value: 'inactive', label: 'غیرفعال' }] },
  ],
  normalizeOptions: normalizeOptions as unknown as (raw: Record<string, unknown>) => Record<string, unknown>,
  implicitActive: (settings: ImportSettings) => [
    ...(settings.attributes.some((a) => !a.variation) || settings.specsSource ? ['specifications'] : []),
    ...(settings.variants.mode !== 'none' ? ['variants'] : []),
  ],
  choices, prepare, plan, apply, rollback,
}
