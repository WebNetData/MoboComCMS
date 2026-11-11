import { hasPersianLetters, isLatinName, normalizePersonName, splitPeopleLine, validImdbPerson, type CreditRole, type PersonIdentity } from './people'

/**
 * The people of an imported title get their Persian name while their Latin name (as IMDb gives it) is kept beside it.
 * Pure rules; the server asks Wikidata (by IMDb person) and, for names it lacks, the site's AI.
 */

/** A Persian name as it may be shown: Persian letters with spaces, ZWNJ, hyphen, dot or apostrophe; nothing else. */
export function persianName(value: unknown): string {
  const text = String(value ?? '').normalize('NFC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()
  return text.length >= 2 && text.length <= 80 && hasPersianLetters(text) && /^[؀-ۿ‌ .'-]+$/.test(text) ? text : ''
}

type Bindings = { results?: { bindings?: Record<string, { value?: unknown }>[] } }
/** Wikidata's answer: each asked IMDb person's Persian label. A person with two different labels is left out. */
export function parsePersianLabels(payload: unknown, wanted: string[]): Map<string, string> {
  const ask = new Set(wanted.filter(id => validImdbPerson(id)))
  const seen = new Map<string, Set<string>>()
  const rows = (payload as Bindings)?.results?.bindings
  for (const row of Array.isArray(rows) ? rows.slice(0, 400) : []) {
    const id = String(row?.imdb?.value ?? ''), label = persianName(row?.fa?.value)
    if (!ask.has(id) || !label) continue
    seen.set(id, (seen.get(id) || new Set()).add(label))
  }
  return new Map([...seen].filter(([, labels]) => labels.size === 1).map(([id, labels]) => [id, [...labels][0]]))
}

/** How one title's sources name the same person: "Bong Joon-ho" and "Bong Joon Ho" alike (hyphens, dots, apostrophes as spaces). */
export const looseNameKey = (value: string) => normalizePersonName(value).replace(/[-.']/g, ' ').replace(/\s+/g, ' ').trim()

/** A title's people on Wikidata, by role and English name: their IMDb person and Persian label. */
export function titlePeopleQuery(titleImdb: string) {
  if (!/^tt\d{7,12}$/.test(titleImdb)) return ''
  // The label service answers fast where a filtered label join times out; many people's Latin name is now their
  // language-neutral ("mul") label rather than an English one, so both are asked for.
  return `SELECT ?role ?pLabel ?imdb ?fa WHERE { ?work wdt:P345 "${titleImdb}" . { ?work wdt:P57 ?p . BIND("DIRECTOR" AS ?role) } UNION { ?work wdt:P162 ?p . BIND("PRODUCER" AS ?role) } UNION { ?work wdt:P161 ?p . BIND("CAST" AS ?role) } OPTIONAL { ?p wdt:P345 ?imdb } OPTIONAL { ?p rdfs:label ?fa . FILTER(LANG(?fa) = "fa") } SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" } } LIMIT 800`
}

/**
 * The answer as role + English name → IMDb person and Persian label. A big cast is fine (a missing row only means a
 * name not found); two different people under one role and name are both left out, never guessed between.
 */
export function parseTitlePeople(payload: unknown): Map<string, { imdbId: string; fa: string }> {
  const rows = (payload as Bindings)?.results?.bindings
  const seen = new Map<string, Map<string, { imdbId: string; fa: string }>>()
  for (const row of Array.isArray(rows) ? rows.slice(0, 800) : []) {
    // A person with no Latin label comes back as their item number (Q…): that is no name to match.
    const role = String(row?.role?.value ?? ''), en = String(row?.pLabel?.value ?? '').trim()
    if (/^Q\d+$/.test(en)) continue
    if (!['DIRECTOR', 'PRODUCER', 'CAST'].includes(role) || !isLatinName(en) || en.length > 120) continue
    const imdbId = validImdbPerson(row?.imdb?.value), fa = persianName(row?.fa?.value), key = `${role}:${looseNameKey(en)}`
    const people = seen.get(key) || new Map(), who = imdbId || `?${fa}`
    const prior = people.get(who)
    // One person may come back once per label; keep the Persian label when any row carries it.
    people.set(who, { imdbId, fa: prior?.fa || fa })
    seen.set(key, people)
  }
  return new Map([...seen].filter(([, people]) => people.size === 1).map(([key, people]) => [key, [...people.values()][0]]))
}

/** One request for the names Wikidata lacks: how Persian film media write them, as JSON, nothing invented. */
export function namesPrompt(names: string[]) {
  return {
    system: 'You transliterate film people names into Persian script exactly as Persian film media and Persian Wikipedia write them. Answer with JSON only.',
    user: `Write each name in Persian script. Keep the order of given name and family name. Do not translate meanings, do not add titles. If unsure of a name, leave it out.\nAnswer as {"names":[{"en":"<name exactly as given>","fa":"<Persian>"}]}\nNames:\n${names.map(name => `- ${name}`).join('\n')}`,
    maxTokens: 60 + names.length * 40,
    json: true,
  }
}

/** The reply's names, only for names that were asked and only when the answer is a Persian name. */
export function parseNamesReply(text: string, names: string[]): Map<string, string> {
  const asked = new Set(names), out = new Map<string, string>()
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return out
  let data: unknown
  try { data = JSON.parse(text.slice(start, end + 1)) } catch { return out }
  const rows = (data as { names?: unknown })?.names
  for (const row of Array.isArray(rows) ? rows.slice(0, 200) : []) {
    const en = typeof row?.en === 'string' ? row.en.trim() : '', fa = persianName(row?.fa)
    if (asked.has(en) && fa) out.set(en, fa)
  }
  return out
}

type Row = Record<string, unknown>
export type NamedPerson = { role: CreditRole; name: string; imdbId: string }

/** The people of an import whose shown name is Latin: the ones that need a Persian name. */
export function latinPeople(fields: Row): NamedPerson[] {
  const out: NamedPerson[] = [], seen = new Set<string>()
  const add = (role: CreditRole, name: unknown, imdbId: unknown) => {
    const text = String(name ?? '').trim(), key = `${role}:${normalizePersonName(text)}`
    if (!isLatinName(text) || seen.has(key) || out.length >= 80) return
    seen.add(key); out.push({ role, name: text, imdbId: validImdbPerson(imdbId) })
  }
  const directors = Array.isArray(fields.directorImages) ? fields.directorImages as Row[] : []
  for (const name of splitPeopleLine(fields.director)) add('DIRECTOR', name, directors.find(row => normalizePersonName(String(row?.name ?? '')) === normalizePersonName(name))?.imdbId)
  for (const name of splitPeopleLine(fields.producer)) add('PRODUCER', name, '')
  for (const row of Array.isArray(fields.cast) ? fields.cast as Row[] : []) add('CAST', row?.name, row?.imdbId)
  return out
}

/**
 * The import's fields with Persian names shown and Latin names kept: each cast row and director photo row carries
 * `nameEn` (and its IMDb person), the director and producer lines are written in Persian, and `peopleNames` tells the
 * save which person each shown name is. A person without a Persian name keeps the Latin one in both.
 */
export function applyPersianNames(fields: Row, persianOf: (person: NamedPerson) => string): { fields: Row; named: number; missing: string[] } {
  const next: Row = { ...fields }, people: PersonIdentity[] = [], missing = new Set<string>()
  let named = 0
  const shown = (person: NamedPerson) => {
    const fa = persianOf(person)
    if (fa) named++; else missing.add(person.name)
    people.push({ role: person.role, name: fa || person.name, nameEn: person.name, imdbId: person.imdbId })
    return fa || person.name
  }
  const directorRows = Array.isArray(fields.directorImages) ? (fields.directorImages as Row[]).map(row => ({ ...row })) : []
  const line = (value: unknown, role: CreditRole) => splitPeopleLine(value).map(name => {
    if (!isLatinName(name)) return name
    const row = role === 'DIRECTOR' ? directorRows.find(item => normalizePersonName(String(item.name ?? '')) === normalizePersonName(name)) : undefined
    const fa = shown({ role, name, imdbId: validImdbPerson(row?.imdbId) })
    if (row) { row.nameEn = name; row.name = fa }
    return fa
  }).join('، ')
  if (typeof fields.director === 'string' && fields.director) next.director = line(fields.director, 'DIRECTOR')
  if (typeof fields.producer === 'string' && fields.producer) next.producer = line(fields.producer, 'PRODUCER')
  if (directorRows.length) next.directorImages = directorRows
  if (Array.isArray(fields.cast)) next.cast = (fields.cast as Row[]).map(row => {
    if (!row || !isLatinName(row.name)) return row
    const name = String(row.name).trim()
    return { ...row, name: shown({ role: 'CAST', name, imdbId: validImdbPerson(row.imdbId) }), nameEn: name }
  })
  if (people.length) next.peopleNames = people
  return { fields: next, named, missing: [...missing] }
}
