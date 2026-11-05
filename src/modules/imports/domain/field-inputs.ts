import type { FieldDef, Message } from '@/modules/imports/domain/types'
import { isBlank, toText } from '@/modules/imports/domain/text'

export type ExistingValue = { existing: string[]; labels?: Record<string, string> }
export type FieldInput =
  | { mode: 'fixed'; value: unknown }
  | { mode: 'map'; entries: { from: string; value: unknown }[]; unmatched: 'keep' | 'error' }
export type FieldInputs = Record<string, FieldInput>
export const isExistingValue = (value: unknown): value is ExistingValue => !!value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as ExistingValue).existing)

/** Only known, nonimplicit fields; bounded JSON values, never object-key lookups from file data. */
export function normalizeFieldInputs(raw: unknown, fields: FieldDef[]): FieldInputs {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const out: FieldInputs = {}
  const safe = (value: unknown) => { const json = JSON.stringify(value); return json && json.length <= 60000 ? JSON.parse(json) as unknown : '' }
  for (const field of fields.filter(field => !field.implicit)) {
    const input = Object.hasOwn(source, field.key) ? source[field.key] : null
    if (!input || typeof input !== 'object') continue
    const row = input as Record<string, unknown>
    if (row.mode === 'fixed') out[field.key] = { mode: 'fixed', value: safe(row.value) }
    if (row.mode === 'map' && Array.isArray(row.entries)) out[field.key] = { mode: 'map', unmatched: row.unmatched === 'keep' ? 'keep' : 'error', entries: row.entries.slice(0, 500).filter(entry => entry && typeof entry === 'object' && typeof entry.from === 'string').map(entry => ({ from: entry.from.slice(0, 1000), value: safe(entry.value) })) }
  }
  return out
}

export function inputMapping(mapping: Record<string, string>, inputs?: FieldInputs): Record<string, string> {
  const out = { ...mapping }
  for (const [key, input] of Object.entries(inputs || {})) if (input.mode === 'fixed' && !isBlank(input.value) || input.mode === 'map' && mapping[key]) out[key] = mapping[key] || '@fixed'
  return out
}

/** Preview and workers build exactly the same values; unmatched values can fail rather than create relations. */
export function applyFieldInputs(values: Record<string, unknown>, inputs?: FieldInputs, policies?: Record<string, { create: boolean; update: boolean }>): Message[] {
  const messages: Message[] = []
  for (const [key, input] of Object.entries(inputs || {})) {
    if (policies?.[key] && !policies[key].create && !policies[key].update) { delete values[key]; continue }
    if (input.mode === 'fixed') values[key] = input.value
    else {
      const from = toText(values[key], 1000)
      if (!from) continue
      const entry = input.entries.find(entry => entry.from === from)
      if (entry) values[key] = entry.value
      else if (input.unmatched === 'error') { delete values[key]; messages.push({ level: 'error', text: key + ': برای «' + from.slice(0, 100) + '» مقداری انتخاب نشده است' }) }
    }
  }
  return messages
}
