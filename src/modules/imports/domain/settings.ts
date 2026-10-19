/**
 * Import settings from the wizard or a template are untrusted: every key is
 * checked against the destination's fields, sizes are capped and unknown
 * values fall back to safe defaults (never "replace" or "delete").
 */
import { normalizePolicies } from '@/modules/imports/domain/mapping'
import type { AttributeSource, ExistingMode, FieldDef, ImportSettings } from '@/modules/imports/domain/types'

const path = (value: unknown) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 300)

function mappingOf(input: unknown, fields: FieldDef[]): Record<string, string> {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const out: Record<string, string> = {}
  for (const field of fields) { const value = path(raw[field.key]); if (value) out[field.key] = value }
  return out
}

export function normalizeSettings(input: unknown, adapter: string, fields: FieldDef[], variantFields: FieldDef[]): ImportSettings {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const mapping = mappingOf(raw.mapping, fields)
  const variantMapping = mappingOf(raw.variantMapping, variantFields)
  const variantsRaw = raw.variants && typeof raw.variants === 'object' ? raw.variants as Record<string, unknown> : {}
  const mode = variantsRaw.mode === 'nested' || variantsRaw.mode === 'flat' ? variantsRaw.mode : 'none'
  const existing: ExistingMode = (['skip', 'update', 'fill-empty', 'replace'] as const).includes(raw.existing as ExistingMode) ? raw.existing as ExistingMode : 'skip'
  const attributes: AttributeSource[] = []
  const names = new Set<string>()
  for (const entry of Array.isArray(raw.attributes) ? raw.attributes.slice(0, 60) : []) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const source = path(row.source)
    const name = String(row.name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80)
    if (!source || !name || names.has(name.toLowerCase())) continue
    names.add(name.toLowerCase())
    const key = /^[a-z][a-z0-9_]{0,39}$/.test(String(row.key || '')) ? String(row.key) : undefined
    attributes.push({ source, name, key, variation: row.variation === true && mode !== 'none' })
  }
  const source = String(raw.source ?? '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'default'
  return {
    adapter,
    source,
    sheet: String(raw.sheet ?? '').slice(0, 100),
    mapping,
    variantMapping: mode === 'none' ? {} : variantMapping,
    policies: normalizePolicies(fields, raw.policies, mapping),
    variantPolicies: mode === 'none' ? {} : normalizePolicies(variantFields, raw.variantPolicies, variantMapping),
    existing,
    protectEdits: raw.protectEdits === true,
    variants: { mode, source: mode === 'nested' ? path(variantsRaw.source) : '', groupBy: mode === 'flat' ? path(variantsRaw.groupBy) : '' },
    attributes,
    specsSource: path(raw.specsSource),
    options: raw.options && typeof raw.options === 'object' && !Array.isArray(raw.options) ? raw.options as Record<string, unknown> : {},
  }
}

