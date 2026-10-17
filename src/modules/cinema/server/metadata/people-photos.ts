import { creditsOf, normalizePersonName, type CreditRole } from '@/modules/cinema/domain/people'
import { parsePhotoIdentities, photoIdentityKey } from '@/modules/cinema/domain/people-photos'
import type { CinemaMetadataResult } from '@/modules/cinema/domain/metadata'
import { storedPersonPictures } from '@/modules/cinema/server/people'
import { ImdbRateLimit, lookupImdbPersonPhoto } from './imdb'

type Photo = { name: string; image?: string }
type Target = { role: CreditRole; person: Photo }

async function titleIdentities(id: string, signal: AbortSignal) {
  if (!/^tt\d{7,12}$/.test(id)) return new Map<string,string>()
  // Keep person identifiers optional in the query so WDQS starts at the exact work;
  // the parser still requires a unique valid nm ID before accepting any identity.
  const query = `SELECT ?work ?person ?personLabel ?imdb ?role ("${id}" AS ?titleId) WHERE { ?work wdt:P345 "${id}" . { ?work wdt:P161 ?person . BIND("CAST" AS ?role) } UNION { ?work wdt:P57 ?person . BIND("DIRECTOR" AS ?role) } OPTIONAL { ?person wdt:P345 ?imdb } SERVICE wikibase:label { bd:serviceParam wikibase:language "en" } } LIMIT 201`
  const url = new URL('https://query.wikidata.org/sparql'); url.search = new URLSearchParams({ query, format: 'json' }).toString()
  const response = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'MoboComMetadata/1.0' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.any([signal,AbortSignal.timeout(8000)]) })
  if (response.status !== 200 || !/application\/(?:sparql-results\+)?json/.test(response.headers.get('content-type') || '') || !response.body) { await response.body?.cancel(); throw new Error('دریافت شناسهٔ عوامل انجام نشد') }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 256*1024) throw new Error('پاسخ شناسهٔ عوامل بیش از حد بزرگ است'); chunks.push(value) } }
  finally { await reader.cancel().catch(() => {}) }
  return parsePhotoIdentities(JSON.parse(Buffer.concat(chunks).toString('utf8')),id)
}

/** Exact title/role/name → Wikidata-linked person ID → that ID's public IMDb picture. */
export async function enrichPeoplePhotos(result: CinemaMetadataResult): Promise<CinemaMetadataResult> {
  const fields = result.fields, cast: Photo[] = Array.isArray(fields.cast) ? fields.cast.filter(p => p && typeof p.name === 'string').slice(0,40) : []
  const prior: Photo[] = Array.isArray(fields.directorImages) ? fields.directorImages.filter(p => p && typeof p.name === 'string') : []
  const directors = creditsOf({ director: typeof fields.director === 'string' ? fields.director : '', cast: [] }).filter(p => p.role === 'DIRECTOR').slice(0,8).map(p => prior.find(row => normalizePersonName(row.name) === normalizePersonName(p.name)) || { name: p.name })
  const targets: Target[] = [...cast.map(person => ({ role: 'CAST' as const, person })), ...directors.map(person => ({ role: 'DIRECTOR' as const, person }))].filter(({person}) => !person.image)
  if (!targets.length) return result
  if (directors.length) fields.directorImages = directors
  let copied = 0
  try {
    const stored = await storedPersonPictures(targets.map(({person}) => person.name))
    for (const {person} of targets) { const image = stored.get(normalizePersonName(person.name)); if (image) person.image = image }
  } catch { /* A missing optional picture lookup must not discard textual metadata. */ }
  const missing = targets.filter(({person}) => !person.image)
  if (missing.length && /^tt\d{7,12}$/.test(String(fields.imdbId))) {
    const stop = new AbortController(), deadline = AbortSignal.any([stop.signal,AbortSignal.timeout(12000)])
    try {
      const identities = await titleIdentities(String(fields.imdbId),deadline), grouped = new Map<string,Photo[]>()
      for (const {role,person} of missing) { const id = identities.get(photoIdentityKey(role,person.name)); if (id) grouped.set(id,[...(grouped.get(id) || []),person]) }
      const pending = [...grouped]; let cursor = 0
      await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
        while (cursor < pending.length && !deadline.aborted) {
          const [id,people] = pending[cursor++]
          try { const image = await lookupImdbPersonPhoto(id,deadline); if (image) for (const person of people) { person.image = image; copied++ } }
          catch (error) { if (error instanceof ImdbRateLimit) stop.abort(); /* No retries or further requests after a rate limit. */ }
        }
      }))
    } catch { /* Provider outages are partial picture results, not a failed text lookup. */ }
  }
  if (copied) { result.source += ' · عکس IMDb'; result.warnings.push(`${copied} عکس از جستجوی عمومی IMDb با تطبیق شناسهٔ فیلم و شخص در Wikidata دریافت شد`) }
  const left = targets.filter(({person}) => !person.image).length
  if (left) result.warnings.push(`عکس قابل‌تأیید ${left} نفر در دسترس نبود؛ اطلاعات و عکس‌های قبلی حفظ می‌شود`)
  return result
}
