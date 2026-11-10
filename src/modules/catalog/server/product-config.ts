import { cleanRichText } from '@/shared/content/sanitize'
import { db } from '@/platform/database/prisma'
import { validateCover } from '@/shared/content/cover'

export type AttributeField = {
  key: string
  label: string
  labelEn: string
  kind: 'text' | 'select' | 'color'
  options: string[]
  required: boolean
  variant: boolean
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try { return JSON.parse(value || '') as T } catch { return fallback }
}

export function validateFields(input: unknown): AttributeField[] {
  const raw = typeof input === 'string' ? parseJson<unknown>(input, null) : input
  if (!Array.isArray(raw) || raw.length > 30) throw Error('Attribute group must contain at most 30 fields')
  const keys = new Set<string>()
  return raw.map((value) => {
    if (!value || typeof value !== 'object') throw Error('Invalid attribute')
    const field = value as Record<string, unknown>
    const key = String(field.key || '').trim().toLowerCase()
    const label = String(field.label || '').trim().slice(0, 80)
    const labelEn = String(field.labelEn || '').trim().slice(0, 80)
    const kind = String(field.kind || 'text')
    const options = Array.isArray(field.options) ? field.options.map(x => String(x).trim().slice(0, 80)).filter(Boolean) : []
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key) || keys.has(key) || !label || !['text', 'select', 'color'].includes(kind) || options.length > 40 || (kind !== 'text' && !options.length)) throw Error('Invalid or duplicate attribute field')
    keys.add(key)
    return { key, label, labelEn, kind: kind as AttributeField['kind'], options: [...new Set(options)], required: field.required === true, variant: field.variant === true }
  })
}

/**
 * The attribute group a category uses: its own, else the nearest ancestor's.
 * One walk for every caller (product form, seller panel, bulk import); the
 * caller supplies how a category is loaded (a query, or a run-wide cache).
 */
export async function inheritedAttributeGroup<G>(
  categoryId: number | null | undefined,
  load: (id: number) => Promise<{ parentId: number | null; group: G | null } | null> | { parentId: number | null; group: G | null } | null,
): Promise<{ group: G | null; categoryId: number | null }> {
  const visited = new Set<number>()
  let id = categoryId || null
  while (id && !visited.has(id)) {
    visited.add(id)
    const category = await load(id)
    if (!category) throw Error('Category not found')
    if (category.group) return { group: category.group, categoryId: id }
    id = category.parentId
  }
  return { group: null, categoryId: null }
}

export async function attributeGroupForCategory(categoryId: number | null | undefined): Promise<{ fields: AttributeField[]; appliesTo: string }> {
  const { group } = await inheritedAttributeGroup(categoryId, async (id) => {
    const category = await db.productCategory.findUnique({ where: { id }, include: { attributeGroup: true } })
    return category ? { parentId: category.parentId, group: category.attributeGroup } : null
  })
  return group ? { fields: validateFields(group.fields), appliesTo: group.appliesTo } : { fields: [], appliesTo: 'ANY' }
}

export async function attributeFieldsForCategory(categoryId: number | null | undefined): Promise<AttributeField[]> {
  return (await attributeGroupForCategory(categoryId)).fields
}

export function validateSpecifications(input: unknown, fields: AttributeField[]): string {
  const raw = typeof input === 'string' ? parseJson<unknown>(input, null) : input
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid specifications')
  const values = raw as Record<string, unknown>
  const result: Record<string, string> = {}
  for (const field of fields) {
    const value = String(values[field.key] ?? '').trim()
    if (field.required && !value) throw Error(`${field.label} is required`)
    if (value.length > 500 || (field.kind !== 'text' && value && !field.options.includes(value))) throw Error(`Invalid value for ${field.label}`)
    if (value) result[field.key] = value
  }
  if (Object.keys(values).some(key => !fields.some(field => field.key === key))) throw Error('Specifications do not belong to this category')
  return JSON.stringify(result)
}

export function validateFaqs(input: unknown) {
  const raw = typeof input === 'string' ? parseJson<unknown>(input, null) : input
  if (!Array.isArray(raw) || raw.length > 30) throw Error('Invalid FAQs')
  return JSON.stringify(raw.map((row) => {
    const question = String(row?.question || '').trim().slice(0, 250)
    const answer = String(row?.answer || '').trim().slice(0, 3000)
    const questionEn = String(row?.questionEn || '').trim().slice(0, 250)
    const answerEn = String(row?.answerEn || '').trim().slice(0, 3000)
    if (!question || !answer) throw Error('Every FAQ needs a question and answer')
    return { question, answer, questionEn, answerEn }
  }))
}

export function validateGallery(input: unknown) {
  const raw = typeof input === 'string' ? parseJson<unknown>(input, null) : input
  if (!Array.isArray(raw) || raw.length > 12) throw Error('Invalid product gallery')
  return JSON.stringify([...new Set(raw.map(value => validateCover(value)).filter(Boolean))])
}

export function validateVariants(input: unknown, fields: AttributeField[], currency: string) {
  if (!Array.isArray(input) || input.length > 100) throw Error('Invalid variants')
  const skuSet = new Set<string>()
  const combinationSet = new Set<string>()
  return input.map((raw) => {
    const id = Number(raw?.id) || undefined
    const sku = String(raw?.sku || '').trim().slice(0, 80)
    const name = String(raw?.name || '').trim().slice(0, 120)
    const nameEn = String(raw?.nameEn || '').trim().slice(0, 120)
    const price = Number(raw?.price)
    const memberPrice = raw?.memberPrice === '' || raw?.memberPrice == null ? 0 : Number(raw.memberPrice)
    const stock = Number(raw?.stock)
    const compareAt = raw?.compareAtPrice === '' || raw?.compareAtPrice == null ? 0 : Number(raw.compareAtPrice)
    if (!Number.isFinite(compareAt) || compareAt < 0 || (compareAt > 0 && compareAt <= price)) throw Error('Variant list price must be higher than its price')
    const attributes = validateSpecifications(raw?.attributes || {}, fields.filter(field => field.variant))
    // Options without attributes of their own ("ready-made" / "on your account") are told apart by name.
    const combination = attributes === '{}' ? `name:${name}` : attributes
    if (!Number.isFinite(memberPrice) || memberPrice < 0 || memberPrice >= price && memberPrice > 0) throw Error('VIP price must be lower than the variant price')
    if (!sku || !name || !Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(stock) || stock < -1 || skuSet.has(sku) || combinationSet.has(combination)) throw Error('Variant SKU, attributes, price or stock are invalid or duplicated')
    skuSet.add(sku)
    combinationSet.add(combination)
    // Set only by the FX pricing step (never from a raw JSON body): the variant's own foreign cost.
    const fxAmountMinor = typeof raw?.fxAmountMinor === 'bigint' && raw.fxAmountMinor > 0n ? raw.fxAmountMinor : 0n
    // Also only from the FX step: the variant's own profit (null = the product's).
    const markupBps = Number.isSafeInteger(raw?.markupBps) && raw.markupBps >= 0 && raw.markupBps <= 100_000 ? raw.markupBps as number : null
    const markupFixedMinor = typeof raw?.markupFixedMinor === 'bigint' && raw.markupFixedMinor >= 0n ? raw.markupFixedMinor : null
    return { id, sku, name, nameEn, attributes, price, memberPrice, compareAt, fxAmountMinor, markupBps, markupFixedMinor, stock, active: raw?.active !== false, currency }
  })
}

export function safeProductText(value: unknown) {
  return cleanRichText(String(value || '').slice(0, 50000))
}
