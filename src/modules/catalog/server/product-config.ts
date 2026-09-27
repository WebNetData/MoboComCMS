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

export async function attributeGroupForCategory(categoryId: number | null | undefined): Promise<{ fields: AttributeField[]; appliesTo: string }> {
  const visited = new Set<number>()
  let id = categoryId || null
  while (id && !visited.has(id)) {
    visited.add(id)
    const category = await db.productCategory.findUnique({ where: { id }, include: { attributeGroup: true } })
    if (!category) throw Error('Category not found')
    if (category.attributeGroup) return { fields: validateFields(category.attributeGroup.fields), appliesTo: category.attributeGroup.appliesTo }
    id = category.parentId
  }
  return { fields: [], appliesTo: 'ANY' }
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
    if (!Number.isFinite(memberPrice) || memberPrice < 0 || memberPrice >= price && memberPrice > 0) throw Error('VIP price must be lower than the variant price')
    if (!sku || !name || !Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(stock) || stock < -1 || skuSet.has(sku) || combinationSet.has(attributes)) throw Error('Variant SKU, attributes, price or stock are invalid or duplicated')
    skuSet.add(sku)
    combinationSet.add(attributes)
    return { id, sku, name, nameEn, attributes, price, memberPrice, compareAt, stock, active: raw?.active !== false, currency }
  })
}

export function safeProductText(value: unknown) {
  return cleanRichText(String(value || '').slice(0, 50000))
}
