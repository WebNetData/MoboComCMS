import { normalizeCurrency } from '@/shared/money'
import { type Kind } from '@/modules/imports/domain/store'
import type { FieldDef } from '@/modules/imports/domain/types'

/**
 * Store products, on the store's real model: Product (one category, brand,
 * specifications JSON), ProductVariant (attributes JSON, own SKU/price/
 * stock/image), ProductCategory tree, ProductBrand and ProductAttributeGroup
 * — the group reaches a product through its category, as in the store admin.
 * A product never gets attributes outside its category's group.
 */

export const E = { product: 'store.product', variant: 'store.variant', brand: 'store.brand' }

const STOCK_STATUS = [{ value: 'in', label: 'موجود' }, { value: 'out', label: 'ناموجود' }]

const STATUS = [{ value: 'active', label: 'فعال / منتشر' }, { value: 'inactive', label: 'غیرفعال / پیش‌نویس' }]

export const FIELDS: FieldDef[] = [
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

export const VARIANT_FIELDS: FieldDef[] = [
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

export type Opt = {
  currency: string; categorySeparator: string; missingCategories: 'create' | 'error'; missingBrands: 'create' | 'error'
  productType: 'auto' | Kind; groupMode: 'none' | 'source' | 'category' | 'fixed' | 'map'; groupFixed: number | null; groupMap: Record<string, number>
  missingGroups: 'create' | 'manual' | 'error'; missingAttributes: 'ignore' | 'manual' | 'add' | 'reject'; missingValues: 'add' | 'map' | 'ignore' | 'reject'
  attributeMap: Record<string, string>; optionMap: Record<string, string>; missingVariants: 'keep' | 'disable' | 'delete'; confirmDelete: boolean; newStatus: 'active' | 'inactive'
}

export function normalizeOptions(raw: Record<string, unknown>): Opt {
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
