/**
 * Watching a film's file in a player app instead of the browser (owner 2026-11-12: «تماشای آنلاین در KMPlayer»). Such
 * apps play what browsers cannot (E-AC3/AC3/DTS sound, HEVC) and show the subtitles inside an MKV themselves. The
 * address handed over is the one the site's own player gets: it works by possession (a signed or masked link, valid
 * for its time), so the app needs no cookie. Nothing here fetches anything; it only writes the app's launch address.
 *
 * - Android: an `intent:` address for the app's package, falling back to its Play Store page when it is not installed
 *   (Chrome's documented intent syntax). VLC also gets the site's subtitle (`subtitles_location`, best effort).
 * - iOS: VLC's documented `vlc-x-callback://x-callback-url/stream?url=…&sub=…`.
 * - Elsewhere (Windows, macOS, Linux): the address to paste into the app's "Open URL" (Ctrl+U in KMPlayer and PotPlayer).
 */

export const EXTERNAL_PLAYERS = [
  { id: 'kmplayer', label: 'KMPlayer', android: 'com.kmplayer' },
  { id: 'mxplayer', label: 'MX Player', android: 'com.mxtech.videoplayer.ad' },
  { id: 'vlc', label: 'VLC', android: 'org.videolan.vlc', ios: true },
] as const
export type ExternalPlayerId = typeof EXTERNAL_PLAYERS[number]['id']
export const DEFAULT_EXTERNAL_PLAYERS: ExternalPlayerId[] = ['kmplayer', 'mxplayer', 'vlc']

/** The owner's choice of apps from a stored value: known ids only, once each, in the list's own order. */
export function externalPlayerIds(value: unknown): ExternalPlayerId[] {
  if (!Array.isArray(value)) return [...DEFAULT_EXTERNAL_PLAYERS]
  const chosen = new Set(value.map(String))
  return EXTERNAL_PLAYERS.map(player => player.id).filter(id => chosen.has(id))
}

export type DevicePlatform = 'android' | 'ios' | 'other'
/** From the browser's user agent; an iPad that says it is a Mac is told apart by its touch screen. */
export function devicePlatform(userAgent: string, touchPoints = 0): DevicePlatform {
  if (/android/i.test(userAgent)) return 'android'
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && touchPoints > 1)) return 'ios'
  return 'other'
}

/** An address the app can open: absolute, http(s), without a fragment. '' for anything else. */
export function playableAddress(src: string, origin: string): string {
  try {
    const url = new URL(src, origin)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    url.hash = ''
    return url.toString()
  } catch { return '' }
}

const extra = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/** Chrome's intent address for one app: the file as the intent's data, a video type, the app's package and its store page. */
export function androidIntent(address: string, packageName: string, options: { title?: string; subtitle?: string } = {}): string {
  const url = new URL(address)
  const parts = [
    `scheme=${url.protocol.replace(':', '')}`, 'action=android.intent.action.VIEW', 'type=video/*', `package=${packageName}`,
    ...(options.title ? [`S.title=${extra(options.title.slice(0, 200))}`] : []),
    ...(options.subtitle ? [`S.subtitles_location=${extra(options.subtitle)}`] : []),
    `S.browser_fallback_url=${extra(`https://play.google.com/store/apps/details?id=${packageName}`)}`,
  ]
  return `intent://${url.host}${url.pathname}${url.search}#Intent;${parts.join(';')};end`
}

/** VLC for iOS: stream the address, with the site's subtitle when there is one. */
export function vlcIos(address: string, subtitle = ''): string {
  return `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(address)}${subtitle ? `&sub=${encodeURIComponent(subtitle)}` : ''}`
}

export type ExternalLink = { id: ExternalPlayerId; label: string; href: string }
/** The launch addresses for this device, for the apps the owner chose; none where a device has no such way. */
export function externalPlayerLinks(input: { src: string; origin: string; platform: DevicePlatform; players: ExternalPlayerId[]; title?: string; subtitle?: string }): ExternalLink[] {
  const address = playableAddress(input.src, input.origin)
  if (!address || input.platform === 'other') return []
  const subtitle = input.subtitle ? playableAddress(input.subtitle, input.origin) : ''
  return EXTERNAL_PLAYERS.filter(player => input.players.includes(player.id)).flatMap((player): ExternalLink[] => {
    if (input.platform === 'android') return [{ id: player.id, label: player.label, href: androidIntent(address, player.android, { title: input.title, subtitle: player.id === 'vlc' ? subtitle : '' }) }]
    if ('ios' in player && player.ios) return [{ id: player.id, label: player.label, href: vlcIos(address, subtitle) }]
    return []
  })
}
