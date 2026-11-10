import { createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server'
import type { RestoreCommit } from '@/modules/content/server/revisions'
import type { Snapshot } from '@/modules/content/domain/revisions'
import { setSectionNames } from '@/shared/site/section-names'
import { normalizeSectionNames, sectionLabel, type SectionNameEntry, type SectionNames } from '@/modules/site/domain/section-names'

// One owner for every section's display name, with the usual revision history, If-Match and audit.
const KEY = 'site.section-names.v1'
const history = () => createSectionSettingsHistory(KEY, 'settings-section-names', (raw) => ({ names: normalizeSectionNames((raw as { names?: unknown } | null)?.names) }), (settings) => ({ sections: Object.keys(settings.names) }), { action: 'sections.names.update', targetId: KEY })

const g = globalThis as typeof globalThis & { __mcSectionNames?: { at: number; names: SectionNames } }
/** Every custom name; a few seconds of memory so one page asks once. */
export async function getSectionNames(): Promise<SectionNames> {
  const cached = g.__mcSectionNames
  if (cached && Date.now() - cached.at < 5000) return cached.names
  const names = await history().read().then((s) => s.names).catch(() => cached?.names || {})
  g.__mcSectionNames = { at: Date.now(), names }
  setSectionNames(names)
  return names
}

export async function sectionDisplayName(id: string, fa: boolean, fallback: { fa: string; en?: string }) {
  return sectionLabel(await getSectionNames(), id, fa, fallback)
}

/** Sets (or, with empty names, removes) one section's custom name. */
export async function saveSectionName(id: string, entry: Partial<SectionNameEntry>, context: SectionSettingsContext) {
  const saved = await history().save((current: { names: SectionNames }) => {
    const names = { ...current.names }
    names[id] = { fa: entry.fa ?? names[id]?.fa ?? '', en: entry.en ?? names[id]?.en ?? '' }
    return { names: normalizeSectionNames(names) }
  }, context)
  g.__mcSectionNames = undefined
  return saved.names
}

export const sectionNamesState = () => history().current()
export async function restoreSectionNames(id: number, snapshot: Snapshot, commit: RestoreCommit) {
  const result = await history().restore(id, snapshot, commit)
  g.__mcSectionNames = undefined
  return result
}
