import { db } from '@/platform/database/prisma'
import { capturePublicProductPrices, prepareProductPriceCapture } from '@/modules/catalog/server/price-history'
import { cleanRichText, richTextToPlain } from '@/shared/content/sanitize'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { validateFields, validateSpecifications } from '@/modules/catalog/server/product-config'
import { slugify } from '@/modules/taxonomy/domain/taxonomy'
import { combinationKey, findAttribute, SKU_PATTERN, splitPrice, stockOf, type Kind } from '@/modules/imports/domain/store'
import type { Counters, Message, SourceItem } from '@/modules/imports/domain/types'
import { latinSlug, normalizeName, normalizeValue, toText } from '@/modules/imports/domain/values'
import { identityOf, importImages, localizeHtml, saveIdentity, snapshot, suffixOf, tracked, type Client } from '@/modules/imports/server/adapters/common'
import { type ApplyResult, type Change, type ImportContext, type Plan } from '@/modules/imports/server/registry'
import { type Brand, type Caches, type Cat, type Group, caches, currencyConflict, findBrand, findGroup, mergedSpecs, walkPath } from '@/modules/imports/server/adapters/store/run-caches'
import { E, type Opt } from '@/modules/imports/server/adapters/store/core'
import { type Data, currentValues } from '@/modules/imports/server/adapters/store/planning'
import { PRODUCT_SELECT } from '@/modules/imports/server/adapters/store/per-slice-lookups'

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

export const VARIANT_TRACKED = ['sku', 'name', 'attributes', 'price', 'priceMinor', 'compareAtMinor', 'stock', 'active', 'image']

export function apply(item: SourceItem, planned: Plan, ctx: ImportContext): Promise<ApplyResult> {
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
    const pricesBefore = existing ? await prepareProductPriceCapture(tx, existing.id) : new Map()
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
    await capturePublicProductPrices(tx, productId, pricesBefore)
    return productId
  }, { timeout: 30_000 }).catch((error) => { changes.length = mark; throw error })
  const owners = (ctx.cache.get('variantSkus') as Map<string, number> | undefined) || new Map<string, number>()
  for (const vp of data.variants) owners.set(vp.sku, result)
  return { action: existing ? 'UPDATE' : 'CREATE', entityType: 'product', entityId: result, changes, messages, counters }
}
