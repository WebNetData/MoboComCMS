/**
 * Source columns, automatic mapping and the field policy (create / update /
 * ignore). Pure functions: the engine and the wizard share them.
 */
import type { ExistingMode, FieldDef, FieldPolicy } from '@/modules/imports/domain/types'

// ------------------------------------------------------------------ source columns

export type SourceColumn = { path: string; kind: 'value' | 'list' | 'objects' | 'object'; samples: string[]; filled: number }

const sampleOf = (value: unknown) => (typeof value === 'object' ? JSON.stringify(value) : String(value)).slice(0, 80)
const isEmpty = (value: unknown) => value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)

/**
 * Every path in the records: "title", "brand.name", "images" (a list),
 * "variants" (a list of objects) with "variants[].color" for its members.
 */
export function discoverColumns(rows: Record<string, unknown>[], limit = 500): SourceColumn[] {
  const found = new Map<string, SourceColumn>()
  const note = (path: string, kind: SourceColumn['kind'], value: unknown) => {
    const column = found.get(path) || { path, kind, samples: [], filled: 0 }
    if (!isEmpty(value)) {
      column.filled++
      const sample = sampleOf(value)
      if (column.samples.length < 3 && !column.samples.includes(sample)) column.samples.push(sample)
    }
    found.set(path, column)
  }
  const walk = (value: unknown, path: string, depth: number) => {
    if (Array.isArray(value)) {
      if (value.some((item) => item && typeof item === 'object' && !Array.isArray(item))) {
        note(path, 'objects', value.length ? `${value.length} مورد` : '')
        if (depth < 3) for (const item of value.slice(0, 20)) if (item && typeof item === 'object') for (const [key, child] of Object.entries(item)) walk(child, `${path}[].${key}`, depth + 1)
      } else note(path, 'list', value.join(', '))
    } else if (value && typeof value === 'object') {
      if (depth >= 3) { note(path, 'value', value); return }
      note(path, 'object', value)
      for (const [key, child] of Object.entries(value)) walk(child, path ? `${path}.${key}` : key, depth + 1)
    } else note(path, 'value', value)
  }
  for (const row of rows.slice(0, limit)) for (const [key, value] of Object.entries(row)) walk(value, key, 0)
  return [...found.values()]
}

/** Value at a path ("a.b", "list[].x" gives the list of x). */
export function getPath(record: unknown, path: string): unknown {
  if (!path) return undefined
  let current: unknown = record
  const parts = path.split('.')
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (current === null || current === undefined) return undefined
    if (part.endsWith('[]')) {
      const list = (current as Record<string, unknown>)[part.slice(0, -2)]
      if (!Array.isArray(list)) return undefined
      const rest = parts.slice(i + 1).join('.')
      return rest ? list.map((item) => getPath(item, rest)).filter((item) => !isEmpty(item)) : list
    }
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

// ------------------------------------------------------------------ automatic mapping

/** "Product_Name" → "productname"; Persian letters kept, Arabic ی/ک unified. */
export function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[^a-z0-9؀-ۿ]+/g, '')
}

function score(field: FieldDef, column: string): number {
  const key = normalizeKey(column.split('.').pop() || column)
  const full = normalizeKey(column)
  const names = [field.key, ...(field.synonyms || [])].map(normalizeKey)
  if (names.includes(full) || names.includes(key)) return names[0] === key || names[0] === full ? 100 : 95
  if (normalizeKey(field.label) === key) return 90
  if (key.length >= 4 && names.some((name) => name.length >= 4 && (key.includes(name) || name.includes(key)))) return 40
  return 0
}

/**
 * Suggested destination → source mapping. Each source column is used once,
 * best match first; the admin can change every suggestion.
 */
export function autoMap(fields: FieldDef[], columns: string[]): Record<string, string> {
  const pairs: { field: string; column: string; score: number }[] = []
  for (const field of fields) for (const column of columns) {
    const s = score(field, column)
    if (s) pairs.push({ field: field.key, column, score: s })
  }
  pairs.sort((a, b) => b.score - a.score)
  const mapping: Record<string, string> = {}
  const used = new Set<string>()
  for (const pair of pairs) {
    if (mapping[pair.field] || used.has(pair.column)) continue
    mapping[pair.field] = pair.column
    used.add(pair.column)
  }
  return mapping
}

// ------------------------------------------------------------------ field policy

/** Default policy: mapped fields are imported on create; updates only for fields marked update-by-default. */
export function defaultPolicy(field: FieldDef, mapped: boolean): FieldPolicy {
  return { create: mapped, update: mapped && field.updatable !== false && field.updateByDefault !== false }
}

export function normalizePolicies(fields: FieldDef[], input: unknown, mapping: Record<string, string>): Record<string, FieldPolicy> {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const out: Record<string, FieldPolicy> = {}
  for (const field of fields) {
    const given = raw[field.key] as Partial<FieldPolicy> | undefined
    const base = defaultPolicy(field, !!mapping[field.key])
    const create = given && typeof given.create === 'boolean' ? given.create : base.create
    const update = given && typeof given.update === 'boolean' ? given.update : base.update
    out[field.key] = { create: create && !!mapping[field.key], update: update && !!mapping[field.key] && field.updatable !== false }
  }
  return out
}

const blank = (value: unknown) => value === undefined || value === null || value === '' || value === '[]' || value === '{}' || (Array.isArray(value) && !value.length)

/**
 * The values an item may write, enforced for every record: a field switched
 * off is not in the result at all (create) or never changes the existing row
 * (update). `current` holds the row's present values for "fill empty".
 */
export function allowedValues(
  values: Record<string, unknown>,
  policies: Record<string, FieldPolicy>,
  mode: 'create' | 'update',
  existing: ExistingMode,
  current?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    const policy = policies[key]
    if (!policy) continue
    if (mode === 'create') { if (policy.create) out[key] = value; continue }
    if (existing === 'skip') continue
    if (existing === 'replace') { if (policy.create || policy.update) out[key] = value; continue }
    if (!policy.update) continue
    if (existing === 'fill-empty' && current && !blank(current[key])) continue
    out[key] = value
  }
  return out
}

/** Fields needed to create a row that will not be written (so creating would fail or invent a value). */
export function missingForCreate(fields: FieldDef[], policies: Record<string, FieldPolicy>): FieldDef[] {
  return fields.filter((field) => field.requiredOnCreate && !policies[field.key]?.create)
}
