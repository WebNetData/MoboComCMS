import { normalizePersonName } from './people'

/** Accept an identifier or the canonical title URL, never an arbitrary fetch target. */
export function imdbIdentifier(raw: unknown): string {
  const value = String(raw ?? '').trim()
  if (/^tt\d{7,12}$/i.test(value)) return value.toLowerCase()
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || !/^(www\.|m\.)?imdb\.com$/i.test(url.hostname) || url.username || url.password || url.port) return ''
    return url.pathname.match(/^\/title\/(tt\d{7,12})(?:\/|$)/i)?.[1].toLowerCase() || ''
  } catch { return '' }
}
/** Apply supplied fields only; name-only credits cannot erase known photos or roles. */
export function applyCinemaMetadata(current: Record<string, unknown>, values: Record<string, unknown>, replace: boolean, isNew: boolean) {
  const next = { ...current }
  for (const [key, value] of Object.entries(values)) {
    if (key === 'cast' && !replace && Array.isArray(value) && Array.isArray(current.cast) && current.cast.length) {
      const incoming = new Map(value.filter(row => row && typeof row.name === 'string').map(row => [normalizePersonName(row.name),row]))
      next.cast = current.cast.map(row => { if (!row || typeof row.name !== 'string') return row; const match = incoming.get(normalizePersonName(row.name)); return match ? { ...row, role: row.role || match.role || '', image: row.image || match.image || '' } : row })
      continue
    }
    if (!(key === 'imdbId' || key === 'kind' && isNew || replace || !next[key] || Array.isArray(next[key]) && !next[key].length)) continue
    if (key === 'cast' && Array.isArray(value)) {
      const old = new Map((Array.isArray(current.cast) ? current.cast : []).filter(row => row && typeof row.name === 'string').map(row => [normalizePersonName(row.name), row]))
      next.cast = value.filter(row => row && typeof row.name === 'string').slice(0, 40).map(row => {
        const prior = old.get(normalizePersonName(row.name))
        return { ...row, role: row.role || prior?.role || '', image: row.image || prior?.image || '' }
      })
    } else next[key] = value
  }
  return next
}
export type CinemaMetadataConfig = { enabled: boolean; provider: 'imdb'|'tmdb'; copyImages: boolean; cinemetaFallback: boolean; peoplePhotos: boolean; tmdbConfigured: boolean; omdbConfigured: boolean; canSaveSecrets: boolean }
export type CinemaMetadataResult = { fields: Record<string, unknown>; source: string; warnings: string[] }
