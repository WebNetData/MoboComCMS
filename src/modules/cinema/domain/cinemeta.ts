import { plainText } from '@/shared/text/plain'
import { imdbPhoto } from './imdb-page'
import { normalizePersonName } from './people'
import type { CinemaMetadataResult } from './metadata'

type Data = Record<string, unknown>
const object = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}
const clean = (value: unknown, max=200) => plainText(typeof value === 'string' ? value : '', max).replace(/[\u0000-\u001f]/g, ' ').trim()

export function cinemetaImage(raw: unknown, id: string): string {
  if (typeof raw !== 'string') return ''
  const direct = imdbPhoto(raw)
  if (direct) return direct
  try {
    const url = new URL(raw)
    return /^tt\d{7,12}$/.test(id) && url.protocol === 'https:' && url.hostname === 'images.metahub.space' && !url.username && !url.password && !url.port && !url.search && !url.hash && new RegExp(`^/(poster|background)/(small|medium|large)/${id}/img$`).test(url.pathname) ? url.toString() : ''
  } catch { return '' }
}

function names(value: unknown, limit: number): string[] {
  const seen = new Set<string>(), result: string[] = []
  for (const raw of Array.isArray(value) ? value.slice(0, 100) : []) {
    const name = clean(raw, 120), key = normalizePersonName(name)
    if (key.length < 2 || seen.has(key)) continue
    seen.add(key); result.push(name)
    if (result.length === limit) break
  }
  return result
}

/** Documented public metadata only; streams, episode catalogs and links are never imported. */
export function parseCinemeta(payload: unknown, id: string): CinemaMetadataResult {
  const meta = object(object(payload).meta), title = clean(meta.name)
  if (!/^tt\d{7,12}$/.test(id) || meta.id !== id || meta.imdb_id !== undefined && meta.imdb_id !== id || !['movie', 'series'].includes(String(meta.type)) || !title) throw new Error('اطلاعات Cinemeta معتبر نیست یا با شناسهٔ IMDb مطابقت ندارد')
  const fields: Data = { imdbId: id, kind: meta.type === 'series' ? 'SERIES' : 'MOVIE', title }
  const summary = clean(meta.description, 6000)
  if (summary) fields.summary = summary
  const rating = typeof meta.imdbRating === 'number' || typeof meta.imdbRating === 'string' && /^\d+(?:\.\d+)?$/.test(meta.imdbRating) ? Number(meta.imdbRating) : NaN
  if (Number.isFinite(rating) && rating > 0 && rating <= 10) fields.imdbRating = rating
  const links = (Array.isArray(meta.links) ? meta.links.slice(0, 200) : []).map(object)
  const cast = names(Array.isArray(meta.cast) ? meta.cast : links.filter(row => row.category === 'actor').map(row => row.name), 40)
  const directors = names(Array.isArray(meta.director) ? meta.director : links.filter(row => row.category === 'director').map(row => row.name), 8)
  if (cast.length) fields.cast = cast.map(name => ({ name }))
  if (directors.length) fields.director = directors.join(', ')
  const genres = names(meta.genres, 10)
  if (genres.length) fields.genres = genres.join(', ')
  for (const [key, raw] of [['countries', meta.country], ['languages', meta.language]] as const) { const value = clean(raw, 400); if (value) fields[key] = value }
  const years = clean(meta.releaseInfo, 30).match(/^(\d{4})(?:\s*[-–]\s*(\d{4})?)?$/)
  if (years && Number(years[1]) >= 1880 && Number(years[1]) <= 2100) fields.year = Number(years[1])
  if (meta.type === 'series' && years?.[2] && Number(years[2]) >= Number(years[1]) && Number(years[2]) <= 2100) { fields.endYear = Number(years[2]); fields.seriesStatus = 'ENDED' }
  const runtime = clean(meta.runtime, 30).match(/^(\d{1,3})\s*(?:min|m)$/i)
  if (runtime && Number(runtime[1]) > 0) fields.runtime = Number(runtime[1])
  for (const [key, raw] of [['poster', meta.poster], ['backdrop', meta.background]] as const) { const image = cinemetaImage(raw, id); if (image) fields[key] = image }
  const missing = [['summary', 'خلاصه'], ['imdbRating', 'امتیاز'], ['cast', 'بازیگران'], ['director', 'کارگردان']].filter(([key]) => !(key in fields)).map(([, label]) => label)
  const warnings = ['جزئیات از منبع عمومی Cinemeta با شناسهٔ IMDb دریافت شد؛ پیش از انتشار بازبینی کنید', 'عکس و نقش قبلیِ افراد هم‌نام حفظ می‌شود؛ دریافت عکس‌های تازه تابع تنظیمات عکس عوامل است']
  if (missing.length) warnings.push(`${missing.join('، ')} برای این عنوان در منبع موجود نبود؛ اطلاعات قبلی این فیلدها حفظ می‌شود`)
  return { fields, source: 'Cinemeta · شناسه IMDb', warnings }
}
