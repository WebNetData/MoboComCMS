/**
 * Link forwarder and shortener: /forwarder/<slug> (a saved short link) or
 * /forwarder/url=<address> (any outside address) shows a countdown page with
 * the destination and ad slots, then opens the target. Pure functions only.
 */

export class ForwarderError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export type ForwarderSettings = {
  enabled: boolean
  /** Seconds before the redirect (0 = immediate). */
  countdown: number
  /** Accept /forwarder/url=… for addresses that are not saved short links. */
  allowRawUrls: boolean
  /** Redirect by itself when the countdown ends (otherwise the visitor clicks). */
  autoRedirect: boolean
  title: string
  message: string
  /** Ad slots: an image banner and/or an ad network code (rendered in a sandboxed frame). */
  bannerImage: string
  bannerLink: string
  adTop: string
  adBottom: string
  /** Hosts never forwarded to (phishing, competitors…). */
  blockedHosts: string[]
}

export const DEFAULT_FORWARDER: ForwarderSettings = {
  enabled: true, countdown: 5, allowRawUrls: true, autoRedirect: true,
  title: 'در حال انتقال…', message: 'تا چند ثانیهٔ دیگر به مقصد منتقل می‌شوید. مسئولیت محتوای سایت مقصد با ما نیست.',
  bannerImage: '', bannerLink: '', adTop: '', adBottom: '', blockedHosts: [],
}

const text = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const code = (value: unknown) => String(value ?? '').replace(/\u0000/g, '').slice(0, 8000)

function safeImage(value: unknown) {
  const raw = String(value ?? '').trim()
  if (/^\/(?!\/)[^\s<>"'`\\]{1,299}$/.test(raw)) return raw
  try { const url = new URL(raw); return url.protocol === 'https:' ? url.toString().slice(0, 500) : '' } catch { return '' }
}

export function normalizeForwarderSettings(input: unknown): ForwarderSettings {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const seconds = Math.round(Number(raw.countdown))
  const bool = (key: 'enabled' | 'allowRawUrls' | 'autoRedirect') => typeof raw[key] === 'boolean' ? raw[key] as boolean : DEFAULT_FORWARDER[key]
  const banner = raw.bannerLink ? normalizeTarget(raw.bannerLink) : null
  return {
    enabled: bool('enabled'),
    countdown: Number.isFinite(seconds) ? Math.max(0, Math.min(60, seconds)) : DEFAULT_FORWARDER.countdown,
    allowRawUrls: bool('allowRawUrls'),
    autoRedirect: bool('autoRedirect'),
    title: raw.title === undefined ? DEFAULT_FORWARDER.title : text(raw.title, 80),
    message: raw.message === undefined ? DEFAULT_FORWARDER.message : text(raw.message, 400),
    bannerImage: safeImage(raw.bannerImage),
    bannerLink: banner && banner.ok ? banner.url : '',
    adTop: code(raw.adTop),
    adBottom: code(raw.adBottom),
    blockedHosts: Array.isArray(raw.blockedHosts) ? [...new Set(raw.blockedHosts.map((host) => String(host).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter((host) => /^[a-z0-9.-]{3,253}$/.test(host)))].slice(0, 200) : [],
  }
}

/**
 * An outside address to forward to: a scheme is added when missing ("google.com"),
 * only http(s) with a real host name is accepted, no credentials, no local hosts.
 */
export function normalizeTarget(input: unknown): { ok: true; url: string; host: string } | { ok: false; reason: string } {
  let raw = String(input ?? '').trim()
  try { if (/%[0-9a-f]{2}/i.test(raw) && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = decodeURIComponent(raw) } catch { /* keep raw */ }
  // Proxies and browsers may collapse "https://" inside a path to "https:/".
  raw = raw.replace(/^(https?):\/*/i, '$1://')
  if (!raw) return { ok: false, reason: 'نشانی مقصد خالی است' }
  if (raw.length > 2000) return { ok: false, reason: 'نشانی مقصد بیش از حد طولانی است' }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[^:/]+:\d+/.test(raw)) return { ok: false, reason: 'فقط نشانی‌های http و https مجاز است' }
    raw = `https://${raw.replace(/^\/+/, '')}`
  }
  let url: URL
  try { url = new URL(raw) } catch { return { ok: false, reason: 'نشانی مقصد معتبر نیست' } }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'فقط نشانی‌های http و https مجاز است' }
  if (url.username || url.password) return { ok: false, reason: 'نشانی دارای نام کاربری/رمز مجاز نیست' }
  const host = url.hostname.toLowerCase()
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.startsWith('[')) {
    return { ok: false, reason: 'این مقصد مجاز نیست' }
  }
  return { ok: true, url: url.toString(), host }
}

export const isBlocked = (host: string, blocked: string[]) => blocked.some((item) => host === item || host.endsWith(`.${item}`))

// ------------------------------------------------------------------ slugs

const RESERVED = new Set(['url', 'admin', 'api', 'new', 'edit', 'go', 'r'])
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789' // no 0/o/1/l confusion

export function normalizeSlug(input: unknown): string {
  return String(input ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9؀-ۿ_-]/g, '').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}

export function slugProblem(slug: string): string {
  if (slug.length < 2) return 'نامک باید دست‌کم ۲ نویسه باشد'
  if (RESERVED.has(slug) || slug.startsWith('url=')) return 'این نامک رزرو شده است'
  return ''
}

/** Random, easy-to-type slug (6 characters ≈ 1 billion combinations). */
export function randomSlug(random: (max: number) => number, length = 6): string {
  let slug = ''
  for (let i = 0; i < length; i++) slug += ALPHABET[random(ALPHABET.length)]
  return slug
}

/** What the /forwarder/<segment> path asks for. */
export function parseForwarderPath(segment: string): { kind: 'raw'; target: string } | { kind: 'slug'; slug: string } {
  let decoded = segment
  try { decoded = decodeURIComponent(segment) } catch { /* keep */ }
  if (/^url=/i.test(decoded)) return { kind: 'raw', target: decoded.slice(4) }
  return { kind: 'slug', slug: normalizeSlug(decoded) }
}

/** Ad code shown inside a sandboxed frame: scripts run, but not with the site's origin. */
export function adDocument(codeHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0;padding:0;background:transparent;display:flex;justify-content:center;align-items:center;min-height:100%;font-family:Tahoma,sans-serif}img{max-width:100%;height:auto}</style></head><body>${codeHtml}</body></html>`
}
