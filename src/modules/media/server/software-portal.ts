import { softwareSidebar, softwareStats, softwareSuggestions } from '@/modules/media/server/queries'
import { termTree } from '@/modules/taxonomy/server/taxonomy'
import { flatten } from '@/modules/taxonomy/domain/taxonomy'
import { getMegaConfig } from '@/modules/navigation/server/megamenu'
import { getSoftwareSettings } from '@/modules/software/server/admin'

/**
 * Data every software-portal page shares: the stats strip, highlighted
 * category tiles, the category tree, sidebar lists and the section promo.
 */
export async function softwarePortalChrome() {
  const { suggestionIds } = await getSoftwareSettings()
  const [stats, sidebar, terms, suggestions, menu] = await Promise.all([softwareStats(), softwareSidebar(), termTree('software'), softwareSuggestions(10, suggestionIds), getMegaConfig().catch(() => null)])
  const flat = flatten(terms)
  // Tiles: categories the editor coloured first, else the busiest sub-categories (one per name).
  const coloured = flat.filter((term) => term.color && term.inMenu)
  const pool = coloured.length ? coloured : flat.filter((term) => term.depth > 1 || !term.children.length).sort((a, b) => b.count - a.count)
  const seen = new Set<string>()
  const tiles = pool.filter((term) => (seen.has(term.name) ? false : (seen.add(term.name), true))).slice(0, 5)
    .map((term) => ({ key: String(term.id), name: term.name, path: term.path, count: term.count, color: term.color }))
  const promo = menu?.sections.software.promo.enabled ? menu.sections.software.promo : null
  return { stats: { ...stats, categories: flat.length }, tiles, terms, sidebar, suggestions, promo }
}
