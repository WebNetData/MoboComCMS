import { sectionLabel, type SectionNames } from '@/modules/site/domain/section-names'
/**
 * The owner's section names, process-global on the server (filled whenever the owner's names are read) and
 * page-global in the browser (SectionNamesProvider) — the same arrangement as the section address table.
 */
const store = globalThis as unknown as { __mcSectionNamesMap?: SectionNames }
export function setSectionNames(names: SectionNames) { store.__mcSectionNamesMap = names }
export function currentSectionNames(): SectionNames { return store.__mcSectionNamesMap || {} }
/** A section's shown name from the current table (built-in name when the owner set none). */
export function sectionNameNow(id: string, fa: boolean, fallback: { fa: string; en?: string }) { return sectionLabel(currentSectionNames(), id, fa, fallback) }
