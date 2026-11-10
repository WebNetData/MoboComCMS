export type SectionNameEntry = { fa: string; en: string }
export type SectionNames = Record<string, SectionNameEntry>

/** The section's shown name: the owner's name for this language, then the other language's custom name in English only, then the built-in one. */
export function sectionLabel(names: SectionNames, id: string, fa: boolean, fallback: { fa: string; en?: string }): string {
  const entry = names[id]
  if (fa) return entry?.fa || fallback.fa
  return entry?.en || fallback.en || entry?.fa || fallback.fa
}

/**
 * The owner's section names, process-global on the server (filled whenever the owner's names are read) and
 * page-global in the browser (SectionNamesProvider) — the same arrangement as the section address table.
 */
const store = globalThis as unknown as { __mcSectionNamesMap?: SectionNames }
export function setSectionNames(names: SectionNames) { store.__mcSectionNamesMap = names }
export function currentSectionNames(): SectionNames { return store.__mcSectionNamesMap || {} }
/** A section's shown name from the current table (built-in name when the owner set none). */
export function sectionNameNow(id: string, fa: boolean, fallback: { fa: string; en?: string }) { return sectionLabel(currentSectionNames(), id, fa, fallback) }
