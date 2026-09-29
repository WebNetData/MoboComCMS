/**
 * Masked file links: a file on another host is served from this site's own
 * domain (/dl/<token>/<name>), so visitors never see the source address.
 * The token is an authenticated, expiring encryption of the real URL (see
 * server/mask.ts); these helpers are pure.
 */

export type MaskMode = 'external' | 'off'

/** Whether a URL is on this site's own domain (the site host or one of its sub-domains). */
export function isOwnHost(hostname: string, siteHost: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  const site = siteHost.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '')
  if (!site) return false
  return host === site || host.endsWith(`.${site}`)
}

export function hostExcluded(hostname: string, exclude: readonly string[]): boolean {
  const host = hostname.toLowerCase()
  return exclude.some((rule) => (rule.startsWith('*.') ? host.endsWith(rule.slice(1)) || host === rule.slice(2) : host === rule))
}

/** Masked when it is an http(s) file on another host that is not excluded. */
export function shouldMask(rawUrl: string, options: { mode: MaskMode; siteHost: string; exclude: readonly string[] }): boolean {
  if (options.mode === 'off') return false
  let url: URL
  try { url = new URL(rawUrl) } catch { return false }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  return !isOwnHost(url.hostname, options.siteHost) && !hostExcluded(url.hostname, options.exclude)
}

/** A safe display/save name from the URL path ("Farhad%20-%20Vay.mp3" → "Farhad - Vay.mp3"). */
export function fileNameOf(rawUrl: string, fallback = 'file'): string {
  let last = ''
  try { last = new URL(rawUrl).pathname.split('/').filter(Boolean).pop() || '' } catch { last = '' }
  try { last = decodeURIComponent(last) } catch { /* keep encoded */ }
  const clean = last.replace(/[\u0000-\u001f\u007f/\\?#%"<>|*:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
  return clean && clean !== '.' && clean !== '..' ? clean : fallback
}

/** Path segment for the name (keeps readable characters, encodes the rest). */
export const encodeName = (name: string) => encodeURIComponent(name).replace(/%20/g, '+').replace(/'/g, '%27')
export function decodeNamePath(segments: string[]): string {
  return segments.map((part) => { try { return decodeURIComponent(part.replace(/\+/g, '%20')) } catch { return part } }).join('/')
}

/**
 * The file a request for `name` means: the token's own file, or — for HLS
 * playlists whose segments are relative ("720p/seg-1.ts") — a sibling inside
 * the same folder on the same host. null when the name escapes that folder.
 */
export function resolveSibling(original: string, originalName: string, requested: string): string | null {
  if (!requested || requested === originalName) return original
  if (requested.split('/').some((part) => part === '..' || part === '.' || part === '')) return null
  let base: URL
  try { base = new URL(original) } catch { return null }
  const dir = base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1)
  const next = new URL(requested.split('/').map((part) => encodeURIComponent(part)).join('/'), `${base.origin}${dir}`)
  if (next.origin !== base.origin || !next.pathname.startsWith(dir)) return null
  // Signed origins (nginx secure_link etc.) usually accept the same query on siblings.
  next.search = base.search
  return next.toString()
}

const TYPES: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', avi: 'video/x-msvideo',
  m3u8: 'application/vnd.apple.mpegurl', ts: 'video/mp2t', m4s: 'video/iso.segment', vtt: 'text/vtt', srt: 'application/x-subrip',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed', apk: 'application/vnd.android.package-archive',
  exe: 'application/vnd.microsoft.portable-executable', msi: 'application/x-msi', dmg: 'application/x-apple-diskimage', iso: 'application/x-iso9660-image',
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
}

/** Content type by extension (the origin's header is often generic). */
export function contentTypeFor(name: string, upstream: string | null): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const known = TYPES[ext]
  const origin = (upstream || '').split(';')[0].trim().toLowerCase()
  if (known && (!origin || origin === 'application/octet-stream' || origin === 'binary/octet-stream' || origin.startsWith('text/html'))) return known
  // Never let an origin make this site serve HTML or script.
  if (!origin || /html|javascript|xml|svg/.test(origin)) return known || 'application/octet-stream'
  return origin
}

/** RFC 6266 attachment/inline header with a UTF-8 name. */
export function dispositionFor(name: string, download: boolean): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}
