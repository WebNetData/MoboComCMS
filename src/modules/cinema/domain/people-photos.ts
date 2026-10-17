import { normalizePersonName, type CreditRole } from './people'

export const photoIdentityKey = (role: CreditRole, name: string) => role + ':' + normalizePersonName(name)
type Data = Record<string, unknown>
const object = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}
const value = (row: Data, key: string) => { const raw = object(row[key]).value; return typeof raw === 'string' ? raw : '' }

/** A name alone or search rank cannot prove which person's photo belongs to this title. */
export function parsePhotoIdentities(payload: unknown, titleId: string): Map<string, string> {
  const rows = object(object(payload).results).bindings
  if (!/^tt\d{7,12}$/.test(titleId) || !Array.isArray(rows) || rows.length >= 201) return new Map()
  const works = new Set<string>(), matches = new Map<string, Map<string, string>>()
  for (const raw of rows) {
    const row = object(raw), role = value(row, 'role'), name = value(row, 'personLabel'), imdb = value(row, 'imdb'), person = value(row, 'person'), work = value(row, 'work')
    if (value(row, 'titleId') !== titleId || !['CAST', 'DIRECTOR'].includes(role) || !/^nm\d{7,12}$/.test(imdb) || !/^https?:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(person) || !/^https?:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(work) || name.length > 120 || normalizePersonName(name).length < 2) continue
    works.add(work.replace(/^http:/, 'https:'))
    const key = photoIdentityKey(role as CreditRole, name), candidates = matches.get(key) || new Map<string, string>()
    candidates.set(person.replace(/^http:/, 'https:') + ':' + imdb, imdb); matches.set(key, candidates)
  }
  if (works.size !== 1) return new Map()
  return new Map([...matches].filter(([, candidates]) => candidates.size === 1).map(([key, candidates]) => [key, [...candidates.values()][0]]))
}
