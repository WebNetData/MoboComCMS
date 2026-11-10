/**
 * The names the site owner gives each section (مجله instead of «وبلاگ», «سرگرمی» instead of «گیم» …), by module id.
 * Pure: shared by the server owner, the admin and the client provider. An empty name means the built-in one.
 */
import type { SectionNames } from '@/shared/site/section-names'
// The types and the label rule live in the shared layer so the page-global name table can use them without a module import.
export { sectionLabel, type SectionNameEntry, type SectionNames } from '@/shared/site/section-names'

const ID = /^[a-z][a-z0-9-]{1,40}$/
const clean = (value: unknown) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '')

export function normalizeSectionNames(input: unknown): SectionNames {
  const out: SectionNames = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out
  for (const [id, raw] of Object.entries(input as Record<string, unknown>).slice(0, 200)) {
    if (!ID.test(id) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const entry = { fa: clean((raw as Record<string, unknown>).fa), en: clean((raw as Record<string, unknown>).en) }
    // An emptied name stays as an empty entry (= the built-in name): the settings history merges objects and would keep a removed key.
    out[id] = entry
  }
  return out
}
