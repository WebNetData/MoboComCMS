import { validateSpecifications, type AttributeField } from '@/modules/catalog/server/product-config'
import { combinationKey, detectKind, findAttribute, generatedSku, kindOf, matchOption, newAttributeKey, SKU_PATTERN, splitPrice, stockOf, type Kind } from '@/modules/imports/domain/store'
import type { Counters, Message, PreviewLine, SourceItem } from '@/modules/imports/domain/types'
import { latinSlug, normalizeName, normalizeValue, toText } from '@/modules/imports/domain/values'
import { countImages, htmlImageUrls, identityOf, planOnce, seenBefore, suffixOf } from '@/modules/imports/server/adapters/common'
import { type Finding, type ImportContext, type Plan } from '@/modules/imports/server/registry'
import { type Existing, findExisting } from '@/modules/imports/server/adapters/store/per-slice-lookups'
import { E, FIELDS, type Opt } from '@/modules/imports/server/adapters/store/core'
import { type Caches, type Cat, caches, currencyConflict, findBrand, findGroup, groupOfCategory, mergedSpecs, optionMapKey, walkPath } from '@/modules/imports/server/adapters/store/run-caches'

type AttrPlan = { name: string; key: string; label: string; value: string; create: boolean; createOption: boolean; variation: boolean }

type VariantPlan = {
  index: number; existingId: number | null; externalId: string; sku: string; skuGenerated: boolean; name: string
  attributes: Record<string, string>; values: Record<string, unknown>; price: string | null; compareAt: string | null; stock: number | null; image: string; active: boolean | null
}

export type Data = {
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

export async function plan(item: SourceItem, values: Record<string, unknown>, variantValues: Record<string, unknown>[], ctx: ImportContext): Promise<Plan> {
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
export function currentValues(p: Existing, c: Caches): Record<string, unknown> {
  const brand = p.brandId ? c.brands.get(p.brandId)?.name : ''
  return {
    title: p.name, titleEn: p.nameEn, sku: p.sku, description: p.description, shortDescription: p.shortDescription, image: p.image,
    gallery: p.gallery === '[]' ? '' : p.gallery, price: p.priceMinor > 0n ? p.priceMinor : '', salePrice: p.compareAtMinor > 0n ? p.priceMinor : '',
    stock: p.stock === -1 ? '' : p.stock, category: p.categoryId ? String(p.categoryId) : '', brand, specifications: p.specifications === '{}' ? '' : p.specifications,
    currency: p.currency, kind: p.kind, status: p.active ? 'active' : 'inactive',
  }
}
