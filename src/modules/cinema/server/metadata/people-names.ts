import { applyPersianNames, latinPeople, looseNameKey, namesPrompt, parseNamesReply, parsePersianLabels, parseTitlePeople, titlePeopleQuery, type NamedPerson } from '@/modules/cinema/domain/people-names'
import { normalizePersonName, splitPeopleLine, validImdbPerson } from '@/modules/cinema/domain/people'
import { db } from '@/platform/database/prisma'
import { enqueue } from '@/modules/operations/server/enqueue'
import { metadataCredentials } from './config'
import type { CinemaMetadataResult } from '@/modules/cinema/domain/metadata'
import { wikidataSelect } from './wikidata'

type Row = Record<string, unknown>
const MAX_AI_NAMES = 60

/**
 * Persian names for people named in Latin letters. First Wikidata: the title's own people (by role and exact English
 * name), then each IMDb person the import names: the Persian label of that very person. Then, for the names it lacks
 * and when asked, one request to the site's AI under the film form's purpose.
 */
export async function persianNamesFor(people: NamedPerson[], titleImdb: string, options: { ai: boolean }) {
  const notes: string[] = []
  const deadline = AbortSignal.timeout(15000)
  // The title's own people on Wikidata (directors, producers, cast): IMDb person and Persian label by role and name.
  let onTitle = new Map<string, { imdbId: string; fa: string }>()
  const titleQuery = titlePeopleQuery(titleImdb)
  if (titleQuery) {
    try { onTitle = parseTitlePeople(await wikidataSelect(titleQuery, deadline, 512 * 1024)) }
    catch { notes.push('عوامل این عنوان از ویکی‌داده دریافت نشد') }
  }
  // A Wikidata row of another IMDb person than the import names is not this person.
  const fromTitle = (person: NamedPerson) => { const row = onTitle.get(`${person.role}:${looseNameKey(person.name)}`); return row && (!person.imdbId || !row.imdbId || row.imdbId === person.imdbId) ? row : undefined }
  const idOf = (person: NamedPerson) => person.imdbId || fromTitle(person)?.imdbId || ''
  const wanted = [...new Set(people.filter(person => !fromTitle(person)?.fa).map(idOf).filter(Boolean))].slice(0, 150)
  let labels = new Map<string, string>()
  if (wanted.length) {
    // The IDs were validated (nm + digits) before they enter the query.
    const query = `SELECT ?imdb ?fa WHERE { VALUES ?imdb { ${wanted.map(id => `"${id}"`).join(' ')} } ?person wdt:P345 ?imdb . ?person rdfs:label ?fa . FILTER(LANG(?fa) = "fa") } LIMIT 400`
    try { labels = parsePersianLabels(await wikidataSelect(query, deadline), wanted) }
    catch { notes.push('نام فارسی عوامل از ویکی‌داده دریافت نشد') }
  }
  const byWikidata = (person: NamedPerson) => fromTitle(person)?.fa || labels.get(idOf(person)) || ''
  let byAi = new Map<string, string>()
  const left = [...new Set(people.filter(person => !byWikidata(person)).map(person => person.name))].slice(0, MAX_AI_NAMES)
  if (options.ai && left.length) {
    try {
      const { generate } = await import('@/modules/ai/server/client')
      byAi = parseNamesReply((await generate(namesPrompt(left), undefined, 'cinema', AbortSignal.timeout(25000))).text, left)
    } catch { notes.push('نام فارسی بقیهٔ عوامل با هوش مصنوعی ساخته نشد؛ اتصال هوش مصنوعی «فرم فیلم و سریال» را بررسی کنید') }
  }
  return { idOf, persianOf: (person: NamedPerson) => byWikidata(person) || byAi.get(person.name) || '', source: (person: NamedPerson) => byWikidata(person) ? 'wikidata' : byAi.has(person.name) ? 'ai' : '', notes }
}

/** A title's people shown with their Persian names, their Latin names and IMDb persons kept (see applyPersianNames). */
export async function namePeople(input: Row, options: { ai: boolean }): Promise<{ fields: Row; warnings: string[]; named: number }> {
  const people = latinPeople(input)
  if (!people.length) return { fields: input, warnings: [], named: 0 }
  const names = await persianNamesFor(people, String(input.imdbId || ''), options)
  // The IMDb persons found on Wikidata go with their rows, so the save knows who each one is. A stored title has no
  // director rows (they only travel with an import): its director line gives them.
  const fields: Row = { ...input }
  if (!Array.isArray(fields.directorImages) && typeof fields.director === 'string' && fields.director) fields.directorImages = splitPeopleLine(fields.director).map(name => ({ name }))
  const withId = (role: 'CAST' | 'DIRECTOR') => (row: Row) => {
    if (!row || typeof row.name !== 'string' || validImdbPerson(row.imdbId)) return row
    const id = names.idOf({ role, name: row.name, imdbId: '' })
    return id ? { ...row, imdbId: id } : row
  }
  if (Array.isArray(fields.cast)) fields.cast = (fields.cast as Row[]).map(withId('CAST'))
  if (Array.isArray(fields.directorImages)) fields.directorImages = (fields.directorImages as Row[]).map(withId('DIRECTOR'))
  const applied = applyPersianNames(fields, person => names.persianOf({ ...person, imdbId: person.imdbId || names.idOf(person) }))
  const counted = (kind: string) => new Set(people.filter(person => names.source({ ...person, imdbId: person.imdbId || names.idOf(person) }) === kind).map(person => normalizePersonName(person.name))).size
  const warnings = [...names.notes]
  const wiki = counted('wikidata'), ai = counted('ai')
  if (wiki) warnings.push(`نام فارسی ${wiki.toLocaleString('fa-IR')} نفر از ویکی‌داده (با شناسهٔ IMDb همان شخص) آمد`)
  if (ai) warnings.push(`نام فارسی ${ai.toLocaleString('fa-IR')} نفر را هوش مصنوعی نوشت؛ پیش از انتشار بازبینی کنید`)
  if (applied.missing.length) warnings.push(`نام فارسی ${applied.missing.length.toLocaleString('fa-IR')} نفر پیدا نشد (${applied.missing.slice(0, 4).join('، ')}${applied.missing.length > 4 ? '، …' : ''})؛ نام انگلیسی آن‌ها در هر دو فیلد ماند`)
  return { fields: applied.fields, warnings, named: wiki + ai }
}

/** The import's people with their two names; the import's own warnings come first. */
export async function enrichPeopleNames(result: CinemaMetadataResult, options: { ai: boolean }): Promise<CinemaMetadataResult> {
  const named = await namePeople(result.fields, options)
  return { ...result, fields: named.fields, warnings: [...result.warnings, ...named.warnings] }
}

const BATCH = 10
type Job = { checkpoint: () => Promise<void>; continueWith: (kind: string, payload: Record<string, unknown>, options?: { dedupeKey?: string }) => Promise<unknown> }

/**
 * cinema.people-names — the titles imported before people had two names: each title with an IMDb identifier whose
 * people are shown in Latin letters is named again and saved through the title's own save (history, lists and
 * credits as for an Admin edit), as the admin who started it. A title nothing was found for is left as it was.
 */
export async function runPeopleNamesBackfill(payload: Record<string, unknown>, job: Job) {
  const cursor = Math.max(0, Number(payload.cursor) || 0), run = String(payload.run || ''), actorId = Number(payload.actorId)
  if (!/^[a-z0-9]{1,24}$/.test(run) || !Number.isSafeInteger(actorId) || actorId <= 0) throw new Error('Invalid people names request')
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { id: true, email: true } })
  if (!actor) throw new Error('Invalid people names request')
  const credentials = await metadataCredentials()
  if (!credentials.persianNames) return { skipped: 'off' }
  const titles = await db.cinemaTitle.findMany({ where: { id: { gt: cursor }, imdbId: { not: '' } }, orderBy: { id: 'asc' }, take: BATCH, select: { id: true, imdbId: true, director: true, producer: true, cast: true } })
  const { saveMediaItem } = await import('@/modules/media/server/admin')
  let changed = 0
  for (const title of titles) {
    await job.checkpoint()
    let cast: unknown = []
    try { cast = JSON.parse(title.cast || '[]') } catch { cast = [] }
    const named = await namePeople({ imdbId: title.imdbId, director: title.director, producer: title.producer, cast }, { ai: credentials.persianNamesAi })
    if (!named.named) continue
    const f = named.fields
    await saveMediaItem('cinema-titles', { director: f.director ?? title.director, producer: f.producer ?? title.producer, cast: f.cast, directorImages: f.directorImages, peopleNames: f.peopleNames }, title.id, actor)
    changed++
  }
  const next = titles.at(-1)?.id
  if (titles.length === BATCH && next) await job.continueWith('cinema.people-names', { cursor: next, run, actorId }, { dedupeKey: `cinema-people-names:${run}:${next}` })
  return { changed, cursor: next ?? cursor, done: titles.length < BATCH }
}

/** Starts the pass from Admin; one at a time. */
export async function startPeopleNamesBackfill(actorId: number) {
  const running = await db.backgroundJob.findFirst({ where: { kind: 'cinema.people-names', status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true } })
  if (running) return { id: running.id, started: false }
  const run = Date.now().toString(36)
  const job = await enqueue('cinema.people-names', { cursor: 0, run, actorId }, { dedupeKey: `cinema-people-names:${run}:0` })
  return { id: job.id, started: true }
}
