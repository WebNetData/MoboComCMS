import { plainText } from '@/shared/text/plain'
import { imdbPhoto } from './imdb-page'

/** An exact person ID comes from the title's verified credits, never a name search's first hit. */
export function parseImdbPersonSearch(payload: unknown, id: string): string {
  const rows = payload && typeof payload === 'object' && 'd' in payload ? payload.d : null
  if (!/^nm\d{7,12}$/.test(id) || !Array.isArray(rows)) return ''
  const person = rows.slice(0, 100).find(row => row && typeof row === 'object' && row.id === id)
  return imdbPhoto(person?.i?.imageUrl)
}

/** Public search is a limited source, not full title metadata or verified credits. */
export function parseImdbSearch(payload: unknown, id: string): Record<string, unknown> {
  const rows = payload && typeof payload === 'object' && 'd' in payload ? payload.d : null
  if (!/^tt\d{7,12}$/.test(id) || !Array.isArray(rows)) throw new Error('عنوان دقیق در جستجوی عمومی IMDb پیدا نشد')
  const row = rows.slice(0, 100).find(value => value && typeof value === 'object' && value.id === id)
  const title = plainText(typeof row?.l === 'string' ? row.l : '', 200).replace(/[\u0000-\u001f]/g, ' ').trim()
  const kind = ['tvSeries', 'tvMiniSeries'].includes(row?.qid) ? 'SERIES'
    : ['movie', 'tvMovie', 'short', 'tvShort', 'video'].includes(row?.qid) ? 'MOVIE' : ''
  if (!title || !kind) throw new Error('عنوان دقیق فیلم یا سریال در جستجوی عمومی IMDb پیدا نشد')
  const fields: Record<string, unknown> = { imdbId: id, title, kind }
  if (Number.isInteger(row.y) && row.y >= 1880 && row.y <= 2100) fields.year = row.y
  const poster = imdbPhoto(row.i?.imageUrl)
  if (poster) fields.poster = poster
  // Omitted fields remain untouched, including when the user selects replacement.
  return fields
}
