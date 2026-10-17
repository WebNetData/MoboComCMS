import { ancestry, normalizeAssignment, type Taxonomy } from './taxonomy'

export const TERM_FACETS: Record<Taxonomy, Record<string, string>> = {
  cinema: { genres: 'ژانر', countries: 'کشور سازنده', languages: 'زبان', director: 'کارگردان' },
  games: { genres: 'ژانر', platforms: 'پلتفرم' },
  software: { category: 'دستهٔ نرم‌افزار', platforms: 'پلتفرم' },
  music: { genre: 'سبک آلبوم' },
  'music-language': {},
}
export type ProjectionTerm = { id: number; parentId: number | null; name: string; slug?: string; facet?: string }
const limits: Record<string, number> = { genres: 10, countries: 8, languages: 8, director: 8, platforms: 8, category: 1, genre: 6 }
const structuralKind = (term: ProjectionTerm) => /^(فیلم|movies?|films?)$/i.test(term.name) || /^(movies?|films?)$/i.test(term.slug || '') ? 'MOVIE'
  : /^(سریال|series|tv)$/i.test(term.name) || /^(series|tv)$/i.test(term.slug || '') ? 'SERIES' : ''

/** Same projection in the form and the owner's save transaction. No database or UI dependencies. */
export function projectTerms(taxonomy: Taxonomy, terms: ProjectionTerm[], input: unknown): Record<string, string> {
  const { ids, primary } = normalizeAssignment(input, new Set(terms.map(t => t.id)))
  const chosen = terms.filter(t => ids.includes(t.id))
  const leaves = chosen.filter(t => !chosen.some(other => other.id !== t.id && ancestry(terms, other.id).some(p => p.id === t.id)))
  const ordered = [...leaves].sort((a,b) => Number(b.id === primary) - Number(a.id === primary))
  const values: Record<string, string[]> = {}
  const add = (field: string, value: string) => { if (value.trim()) (values[field] ||= []).push(value.trim()) }
  for (const term of ordered) {
    const chain = ancestry(terms, term.id)
    const explicit = [...chain].reverse().find(t => t.facet)?.facet
    if (explicit === 'none') continue
    if (explicit && TERM_FACETS[taxonomy][explicit]) { add(explicit, term.name); continue }
    if (taxonomy === 'cinema') {
      if (!structuralKind(term)) add('genres', term.name)
    } else if (taxonomy === 'games') add('genres', term.name)
    else if (taxonomy === 'music') add('genre', term.name)
    else if (taxonomy === 'software') {
      add('category', term.name)
      if (chain.length > 1) add('platforms', chain[0].name)
    }
  }
  return Object.fromEntries(Object.entries(values).map(([field, rows]) => [field, [...new Set(rows)].slice(0, limits[field] || 8).map(v => v.replace(/[\u0000-\u001f<>]/g,' ').slice(0,80)).join(', ').slice(0,field === 'category' ? 60 : field === 'director' ? 200 : 800)]))
}

/** Clearing a selected facet clears only metadata that used to come from this tree. */
export function termProjectionChange(taxonomy: Taxonomy, terms: ProjectionTerm[], before: unknown, after: unknown) {
  const old = projectTerms(taxonomy, terms, before), next = projectTerms(taxonomy, terms, after)
  return { ...Object.fromEntries(Object.keys(old).map(key => [key, ''])), ...next }
}
