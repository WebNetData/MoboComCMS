import { db } from '@/platform/database/prisma'
import { validateFields } from '@/modules/catalog/server/product-config'
import type { ImportSettings } from '@/modules/imports/domain/types'
import { type ImportAdapter } from '@/modules/imports/server/registry'
import { FIELDS, VARIANT_FIELDS, normalizeOptions } from '@/modules/imports/server/adapters/store/core'
import { prepare } from '@/modules/imports/server/adapters/store/per-slice-lookups'
import { plan } from '@/modules/imports/server/adapters/store/planning'
import { apply } from '@/modules/imports/server/adapters/store/writing'
import { rollback } from '@/modules/imports/server/adapters/store/rollback'

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
