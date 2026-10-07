import { db } from '@/platform/database/prisma'
import { capturePublicProductPrices, prepareProductPriceCapture } from '@/modules/catalog/server/price-history'
import { validateFields, type AttributeField } from '@/modules/catalog/server/product-config'
import { normalizeValue } from '@/modules/imports/domain/values'
import { snapshot, undoChange } from '@/modules/imports/server/adapters/common'
import { type Change } from '@/modules/imports/server/registry'
import { VARIANT_TRACKED } from '@/modules/imports/server/adapters/store/writing'

export async function rollback(changes: Change[]) {
  const conflicts: string[] = []
  let undone = 0
  for (const change of [...changes].reverse()) {
    let problem: string | null = null
    if (change.entity === 'product') {
      if (change.kind === 'updated') {
        problem = await db.$transaction(async tx => {
          const before = await prepareProductPriceCapture(tx, change.id)
          const conflict = await undoChange(change, 'product', { client: tx, label: 'محصول', dates: ['saleEndsAt'], bigints: ['priceMinor', 'compareAtMinor'] })
          if (!conflict) await capturePublicProductPrices(tx, change.id, before)
          return conflict
        })
      } else {
        problem = await undoChange(change, 'product', {
          label: 'محصول', dates: ['saleEndsAt'], bigints: ['priceMinor', 'compareAtMinor'],
          canDelete: async (id) => {
            const [orders, lines, invoices, reviews] = await Promise.all([db.order.count({ where: { productId: id } }), db.orderLine.count({ where: { productId: id } }), db.invoice.count({ where: { productId: id } }), db.productReview.count({ where: { productId: id } })])
            return orders + lines + invoices + reviews ? 'سفارش، فاکتور یا دیدگاه دارد' : null
          },
        })
      }
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
      } else problem = await db.$transaction(async tx => {
        const variant = await tx.productVariant.findUnique({ where: { id: change.id }, select: { productId: true } })
        const before = variant ? await prepareProductPriceCapture(tx, variant.productId) : new Map()
        const conflict = await undoChange(change, 'productVariant', { client: tx, label: 'تنوع', bigints: ['priceMinor', 'compareAtMinor'] })
        if (!conflict && variant) await capturePublicProductPrices(tx, variant.productId, before)
        return conflict
      })
    } else if (change.entity === 'deletedVariant') {
      // A variant this import deleted comes back with its old values.
      const saved = (change.kind === 'created' ? JSON.parse(change.stamp || '{}') : {}) as Record<string, unknown>
      const taken = await db.productVariant.findUnique({ where: { sku: String(saved.sku) } })
      const product = await db.product.findUnique({ where: { id: Number(saved.productId) }, select: { id: true } })
      if (taken || !product) problem = `تنوع حذف‌شدهٔ «${saved.sku}» قابل بازگرداندن نیست`
      else await db.$transaction(async tx => {
        const before = await prepareProductPriceCapture(tx, product.id)
        await tx.productVariant.create({ data: { productId: product.id, sku: String(saved.sku), name: String(saved.name), attributes: String(saved.attributes), price: Number(saved.price), priceMinor: BigInt(String(saved.priceMinor)), compareAtMinor: BigInt(String(saved.compareAtMinor)), stock: Number(saved.stock), active: saved.active === true, image: String(saved.image || '') } })
        await capturePublicProductPrices(tx, product.id, before)
      })
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
