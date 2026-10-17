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
export type CinemaMetadataConfig = { enabled: boolean; provider: 'imdb'|'tmdb'; copyImages: boolean; tmdbConfigured: boolean; omdbConfigured: boolean; canSaveSecrets: boolean }
export type CinemaMetadataResult = { fields: Record<string, unknown>; source: string; warnings: string[] }
