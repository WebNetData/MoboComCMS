/**
 * Rows → items. A plain file gives one item per row; a nested file keeps a
 * list of variants inside each record; a flat file groups the rows that
 * share a parent key (parent SKU…) into one item with one variant per row.
 */
import { getPath } from '@/modules/imports/domain/mapping'
import { isBlank, toText } from '@/modules/imports/domain/values'
import { LIMITS, type ImportSettings, type SourceItem } from '@/modules/imports/domain/types'

/** A variant-relative path: "variants[].color" → "color" when the variants live under "variants". */
export function relativePath(path: string, variantsSource: string): string {
  const prefix = `${variantsSource}[].`
  return variantsSource && path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function firstFilled(rows: Record<string, unknown>[], path: string): unknown {
  for (const row of rows) { const value = getPath(row, path); if (!isBlank(value)) return value }
  return undefined
}

/** Specifications given as one object ({"RAM": "8GB"}) or a list ([{"name": "RAM", "value": "8GB"}]). */
export function specsFrom(value: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as Record<string, unknown>
      const name = toText(row.name ?? row.key ?? row.label ?? row.title ?? row.attribute, 80)
      const val = toText(row.value ?? row.values ?? row.option, 500)
      if (name && val) out[name] = val
    }
  } else if (value && typeof value === 'object') {
    for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
      const val = toText(raw, 500)
      if (name.trim() && val) out[name.trim().slice(0, 80)] = val
    }
  } else if (typeof value === 'string' && value.trim().startsWith('{')) {
    try { return specsFrom(JSON.parse(value)) } catch { /* not JSON */ }
  }
  return out
}

function build(index: number, rows: Record<string, unknown>[], rowNumbers: number[], settings: ImportSettings, variants: Record<string, unknown>[]): SourceItem {
  const values: Record<string, unknown> = {}
  for (const [field, path] of Object.entries(settings.mapping)) if (path) values[field] = firstFilled(rows, path)
  const specs: Record<string, string> = settings.specsSource ? specsFrom(firstFilled(rows, settings.specsSource)) : {}
  for (const attr of settings.attributes.filter((a) => !a.variation)) {
    const value = toText(firstFilled(rows, attr.source), 500)
    if (value) specs[attr.name] = value
  }
  const variationAttrs = settings.attributes.filter((a) => a.variation)
  const variantValues: Record<string, unknown>[] = []
  const variantAttributes: Record<string, string>[] = []
  for (const variant of variants) {
    const v: Record<string, unknown> = {}
    for (const [field, path] of Object.entries(settings.variantMapping)) if (path) v[field] = getPath(variant, relativePath(path, settings.variants.source))
    variantValues.push(v)
    const attrs: Record<string, string> = {}
    for (const attr of variationAttrs) {
      const value = toText(getPath(variant, relativePath(attr.source, settings.variants.source)), 200)
      if (value) attrs[attr.name] = value
    }
    variantAttributes.push(attrs)
  }
  return { index, rows: rowNumbers, values, variants: variantValues, variantAttributes, specs, raw: rows[0] }
}

/** Items of a parsed file under these settings, in file order. */
export function buildItems(rows: Record<string, unknown>[], settings: ImportSettings): SourceItem[] {
  const mode = settings.variants.mode
  if (mode === 'flat' && settings.variants.groupBy) {
    const groups = new Map<string, number[]>()
    const order: string[] = []
    rows.forEach((row, i) => {
      const raw = toText(getPath(row, settings.variants.groupBy), 200)
      const key = raw ? `k:${raw}` : `r:${i}` // a row without a group key stands alone
      if (!groups.has(key)) { groups.set(key, []); order.push(key) }
      groups.get(key)!.push(i)
    })
    return order.map((key, index) => {
      const members = groups.get(key)!
      const memberRows = members.map((i) => rows[i])
      const hasVariantData = settings.attributes.some((a) => a.variation) || Object.values(settings.variantMapping).some(Boolean)
      return build(index, memberRows, members.map((i) => i + 1), settings, hasVariantData ? memberRows.slice(0, LIMITS.variantsPerItem + 1) : [])
    })
  }
  return rows.map((row, index) => {
    const nested = mode === 'nested' && settings.variants.source ? getPath(row, settings.variants.source) : undefined
    const variants = Array.isArray(nested) ? nested.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)).slice(0, LIMITS.variantsPerItem + 1) : []
    return build(index, [row], [index + 1], settings, variants)
  })
}

/** Variant rows that repeat an attribute combination (same values for every variation attribute). */
export function duplicateCombinations(combinations: Record<string, string>[], normalize: (value: string) => string): number[] {
  const seen = new Set<string>()
  const duplicates: number[] = []
  combinations.forEach((attrs, i) => {
    const key = Object.keys(attrs).sort().map((name) => `${name}=${normalize(attrs[name])}`).join('|')
    if (!key) return
    if (seen.has(key)) duplicates.push(i)
    seen.add(key)
  })
  return duplicates
}
