/**
 * Store import rules that need no database: product type detection, the
 * regular/sale price split, matching attribute names and values against an
 * attribute group, and variant identity. Pure.
 */
import { attributeKey, normalizeName, normalizeValue, stableHash, latinSlug } from '@/modules/imports/domain/values'

export type Kind = 'PHYSICAL' | 'VIRTUAL'

/** The store's attribute definition (ProductAttributeGroup.fields). */
export type AttributeField = { key: string; label: string; labelEn: string; kind: 'text' | 'select' | 'color'; options: string[]; required: boolean; variant: boolean }

const PHYSICAL_HINTS = /^(weight|weight_?grams?|dimensions?|length|width|height|shipping.*|physical.*|package.*|وزن|ابعاد|ارسال)$/i
const DIGITAL_HINTS = /^(download.*|license.*|licen[cs]e_?key|activation.*|account.*|digital.*|virtual|downloadable|email_?delivery|serial.*|لایسنس|دانلود|اکانت|فعال.?سازی)$/i

/**
 * Physical or digital from the record's own columns (weight, dimensions,
 * shipping… vs download URL, license, activation…). Returns null when the
 * record gives no clear signal, so the caller warns instead of guessing.
 */
export function detectKind(raw: Record<string, unknown>): { kind: Kind | null; reason: string } {
  let physical = 0, digital = 0
  const reasons: string[] = []
  for (const [key, value] of Object.entries(raw)) {
    const filled = value !== '' && value !== null && value !== undefined && value !== false && value !== 0 && !(Array.isArray(value) && !value.length)
    if (!filled) continue
    const name = key.split('.').pop() || key
    if (PHYSICAL_HINTS.test(name)) { physical++; reasons.push(name) }
    if (DIGITAL_HINTS.test(name)) { digital++; reasons.push(name) }
    if (/^(virtual|downloadable|is_?virtual|is_?digital)$/i.test(name) && (value === true || /^(1|true|yes|بله)$/i.test(String(value)))) digital += 2
  }
  if (physical > digital) return { kind: 'PHYSICAL', reason: reasons.join(', ') }
  if (digital > physical) return { kind: 'VIRTUAL', reason: reasons.join(', ') }
  return { kind: null, reason: reasons.join(', ') }
}

/** "Physical", "digital", "فیزیکی", "مجازی" … → store kind. */
export function kindOf(value: unknown): Kind | null {
  const key = normalizeName(value).replace(/\s+/g, '')
  if (!key) return null
  if (/^(physical|simple|fiz|فیزیکی|کالا|فیزیکال)$/.test(key)) return 'PHYSICAL'
  if (/^(virtual|digital|downloadable|service|مجازی|دیجیتال|دانلودی|خدمت)$/.test(key)) return 'VIRTUAL'
  return null
}

/**
 * Regular and sale price → what the store keeps: `price` is what the buyer
 * pays, `compareAt` the struck-through list price (only when it is higher).
 */
export function splitPrice(regular: string | null | undefined, sale: string | null | undefined): { price: string | null; compareAt: string | null } {
  const r = regular ? Number(regular) : 0
  const s = sale ? Number(sale) : 0
  if (s > 0 && r > 0) return s < r ? { price: String(s), compareAt: String(r) } : { price: String(r), compareAt: null }
  if (s > 0) return { price: String(s), compareAt: null }
  if (r > 0) return { price: String(r), compareAt: null }
  return { price: null, compareAt: null }
}

/** Finds a group's attribute for a source name: explicit map, key, label or English label. */
export function findAttribute(fields: AttributeField[], name: string, map: Record<string, string> = {}): AttributeField | null {
  const mapped = map[name] || map[normalizeName(name)]
  if (mapped) return fields.find((field) => field.key === mapped) || null
  const n = normalizeName(name)
  return fields.find((field) => field.key === name.trim().toLowerCase() || normalizeName(field.label) === n || (field.labelEn && normalizeName(field.labelEn) === n) || field.key === attributeKey(name)) || null
}

/** The stored option a source value means ("256gb" → "256 GB"), or null. */
export function matchOption(field: AttributeField, value: string): string | null {
  if (field.kind === 'text') return value.trim()
  const n = normalizeValue(value)
  return field.options.find((option) => normalizeValue(option) === n) || null
}

/** A new attribute key that does not clash with the group's keys. */
export function newAttributeKey(label: string, taken: string[]): string {
  const base = attributeKey(label)
  let key = base
  for (let n = 2; taken.includes(key); n++) key = `${base.slice(0, 36)}_${n}`
  return key
}

/** Variant identity inside its product: attribute key → normalized value, sorted. */
export function combinationKey(attributes: Record<string, string>): string {
  return Object.keys(attributes).sort().map((key) => `${key}=${normalizeValue(attributes[key])}`).join('|')
}

/** A deterministic SKU for a variant that has none (same file → same SKU, so re-imports match). */
export function generatedSku(parent: string, attributes: Record<string, string>): string {
  const base = (latinSlug(parent, 40) || 'item').toUpperCase()
  return `${base}-${stableHash(combinationKey(attributes)).toUpperCase().slice(0, 6)}`
}

export const SKU_PATTERN = /^[A-Za-z0-9._-]{1,80}$/

/** Stock from a quantity and/or a stock status: -1 = unlimited, 0 = out of stock. */
export function stockOf(quantity: number | null | undefined, status: string | null | undefined): number | null {
  if (quantity !== null && quantity !== undefined) return Math.max(0, Math.round(quantity))
  if (status === 'out') return 0
  if (status === 'in') return -1
  return null
}
