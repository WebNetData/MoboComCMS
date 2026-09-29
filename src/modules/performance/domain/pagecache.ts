/**
 * Guest page cache — pure rules. A page is cached only for visitors without a
 * session or a cart, only as a full HTML document, and only on the public
 * sections listed in the settings. Everything else goes straight to the app.
 */

export type CacheMode = 'off' | 'balanced' | 'aggressive' | 'custom'

export interface PageCacheConfig {
  mode: CacheMode
  /** Seconds a page is served without asking the app. */
  ttl: number
  /** Seconds after `ttl` a page is still served (and refreshed in the background). */
  staleWhileRevalidate: number
  /** Seconds a page may be served when the app fails to render a fresh one. */
  staleIfError: number
  /** Public path prefixes that may be cached. */
  include: string[]
  /** Path prefixes never cached (win over `include`). */
  exclude: string[]
  /** Per-prefix TTL overrides, e.g. the home page changes more often than the blog. */
  overrides: { prefix: string; ttl: number }[]
  /** Query parameters that are part of the page (everything else is ignored in the key). */
  keepParams: string[]
  /** Send `Cache-Control: public, s-maxage` so a CDN in front may cache guest pages too. */
  edgeHeaders: boolean
  /** Add X-Cache headers (HIT / MISS / STALE). */
  debugHeaders: boolean
  /** Memory the cache may use, per app instance (MB). */
  maxMemoryMb: number
  /** Refresh the most visited pages in the background after a purge and on a schedule. */
  warm: boolean
  warmIntervalMinutes: number
  warmLimit: number
}

export const PRESETS: Record<Exclude<CacheMode, 'off' | 'custom'>, Pick<PageCacheConfig, 'ttl' | 'staleWhileRevalidate' | 'staleIfError'>> = {
  balanced: { ttl: 60, staleWhileRevalidate: 300, staleIfError: 3600 },
  aggressive: { ttl: 300, staleWhileRevalidate: 1800, staleIfError: 21_600 },
}

export const DEFAULT_INCLUDE = ['/', '/blog', '/journal', '/products', '/shop', '/software', '/games', '/cinema', '/music', '/plans', '/forum', '/p/', '/ext/']
export const DEFAULT_EXCLUDE = ['/api', '/admin', '/dashboard', '/seller', '/checkout', '/cart', '/login', '/register', '/forgot-password', '/reset-password', '/account', '/invoice', '/payment', '/miniapp', '/dl', '/files', '/watch', '/search', '/track', '/forwarder', '/builder-preview', '/install', '/_next']

export const DEFAULT_PAGECACHE: PageCacheConfig = {
  mode: 'off', ...PRESETS.balanced, include: DEFAULT_INCLUDE, exclude: DEFAULT_EXCLUDE, overrides: [{ prefix: '/', ttl: 30 }],
  keepParams: ['page', 'sort', 'category', 'brand', 'tag', 'q_page'], edgeHeaders: false, debugHeaders: true, maxMemoryMb: 128, warm: true, warmIntervalMinutes: 10, warmLimit: 30,
}

const int = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

const cleanPrefix = (value: unknown) => {
  const text = String(value ?? '').trim().replace(/[?#].*$/, '').replace(/\s+/g, '')
  if (!text.startsWith('/') || text.length > 120 || /[<>"'\\]/.test(text)) return ''
  return text
}
const prefixes = (input: unknown, fallback: string[]) => {
  const list = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,،\n]+/) : null
  return list ? [...new Set(list.map(cleanPrefix).filter(Boolean))].slice(0, 60) : fallback
}

export function normalizePageCache(input: Record<string, unknown> | undefined, previous: PageCacheConfig = DEFAULT_PAGECACHE): PageCacheConfig {
  const b = input || {}
  const mode: CacheMode = ['off', 'balanced', 'aggressive', 'custom'].includes(String(b.mode)) ? b.mode as CacheMode : previous.mode
  const preset = mode === 'balanced' || mode === 'aggressive' ? PRESETS[mode] : null
  const overridesInput = b.overrides === undefined ? previous.overrides : b.overrides
  const overrides = Array.isArray(overridesInput)
    ? overridesInput.flatMap((row) => {
      const prefix = cleanPrefix((row as { prefix?: unknown })?.prefix)
      return prefix ? [{ prefix, ttl: int((row as { ttl?: unknown }).ttl, 1, 86_400, 60) }] : []
    }).slice(0, 40)
    : previous.overrides
  return {
    mode,
    ttl: preset ? preset.ttl : int(b.ttl, 1, 86_400, previous.ttl),
    staleWhileRevalidate: preset ? preset.staleWhileRevalidate : int(b.staleWhileRevalidate, 0, 604_800, previous.staleWhileRevalidate),
    staleIfError: preset ? preset.staleIfError : int(b.staleIfError, 0, 2_592_000, previous.staleIfError),
    include: b.include === undefined ? previous.include : prefixes(b.include, previous.include),
    exclude: b.exclude === undefined ? previous.exclude : prefixes(b.exclude, previous.exclude),
    overrides,
    keepParams: b.keepParams === undefined ? previous.keepParams : (Array.isArray(b.keepParams) ? b.keepParams : String(b.keepParams).split(/[\s,،]+/)).map((p) => String(p).trim()).filter((p) => /^[A-Za-z0-9_-]{1,40}$/.test(p)).slice(0, 20),
    edgeHeaders: b.edgeHeaders === undefined ? previous.edgeHeaders : !!b.edgeHeaders,
    debugHeaders: b.debugHeaders === undefined ? previous.debugHeaders : !!b.debugHeaders,
    maxMemoryMb: b.maxMemoryMb === undefined ? previous.maxMemoryMb : int(b.maxMemoryMb, 16, 4096, 128),
    warm: b.warm === undefined ? previous.warm : !!b.warm,
    warmIntervalMinutes: b.warmIntervalMinutes === undefined ? previous.warmIntervalMinutes : int(b.warmIntervalMinutes, 1, 1440, 10),
    warmLimit: b.warmLimit === undefined ? previous.warmLimit : int(b.warmLimit, 1, 200, 30),
  }
}

/** Cookies that make a page personal (session, cart, previews); such visitors are never served from the cache. */
const PERSONAL_COOKIE = /(^|;\s*)(next-auth\.session-token|__Secure-next-auth\.session-token|next-auth\.session-token\.\d+|__Secure-next-auth\.session-token\.\d+|mc_cart|mc_preview|mc_srv)=/
/** Tracking parameters that never change the page. */
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|yclid|msclkid|mc_[a-z]+|_rsc|ref|igshid)$/i

export interface RequestInfo {
  method: string
  pathname: string
  search: string
  host: string
  cookie: string
  accept: string
  /** Any header that marks a client-side navigation or prefetch (RSC); the `_rsc` query is checked too. */
  rsc: boolean
  /** Set on the app's own refill requests. */
  fill: boolean
}

const under = (path: string, prefix: string) => (prefix === '/' ? path === '/' : path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))

export type Decision =
  | { cache: false; reason: string }
  | { cache: true; key: string; path: string; ttl: number; lang: string; theme: string; canonicalSearch: string }

/** Whether this request may be served from (and stored in) the guest page cache, and under which key. */
export function decide(config: PageCacheConfig, req: RequestInfo): Decision {
  if (config.mode === 'off') return { cache: false, reason: 'off' }
  if (req.method !== 'GET') return { cache: false, reason: 'method' }
  if (req.fill) return { cache: false, reason: 'fill' }
  if (req.rsc) return { cache: false, reason: 'rsc' }
  // Only real page loads: browsers and crawlers ask for text/html. The app's own client-side
  // navigations and prefetches ask for */* with `?_rsc=` and expect a data payload, never HTML.
  if (!/text\/html/.test(req.accept || '')) return { cache: false, reason: 'accept' }
  if (/(^|[?&])_rsc=/.test(req.search)) return { cache: false, reason: 'rsc' }
  if (PERSONAL_COOKIE.test(req.cookie || '')) return { cache: false, reason: 'personal' }
  const path = req.pathname.length > 1 ? req.pathname.replace(/\/+$/, '') : req.pathname
  if (config.exclude.some((prefix) => under(path, prefix))) return { cache: false, reason: 'excluded' }
  if (!config.include.some((prefix) => under(path, prefix))) return { cache: false, reason: 'not-listed' }
  // Only the parameters that are part of the page take part in the key.
  const params = new URLSearchParams(req.search)
  const kept: [string, string][] = []
  for (const [name, value] of params) {
    if (TRACKING.test(name)) continue
    if (!config.keepParams.includes(name)) return { cache: false, reason: 'query' }
    kept.push([name, value.slice(0, 80)])
  }
  kept.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  if (kept.length > 6) return { cache: false, reason: 'query' }
  const canonicalSearch = kept.length ? `?${kept.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}` : ''
  const cookie = (name: string) => new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(req.cookie || '')?.[1] || ''
  const lang = /^[a-z]{2}(-[A-Za-z]{2})?$/.test(cookie('lang')) ? cookie('lang') : ''
  const theme = cookie('theme') === 'dark' ? 'dark' : cookie('theme') === 'light' ? 'light' : ''
  const override = [...config.overrides].sort((a, b) => b.prefix.length - a.prefix.length).find((row) => under(path, row.prefix))
  return { cache: true, key: `${req.host}|${lang}|${theme}|${path}${canonicalSearch}`, path, ttl: override?.ttl ?? config.ttl, lang, theme, canonicalSearch }
}

export type Freshness = 'fresh' | 'stale' | 'error-only' | 'expired'

/** How an entry of `ageSeconds` may be used. */
export function freshness(config: PageCacheConfig, ttl: number, ageSeconds: number): Freshness {
  if (ageSeconds < ttl) return 'fresh'
  if (ageSeconds < ttl + config.staleWhileRevalidate) return 'stale'
  if (ageSeconds < ttl + config.staleWhileRevalidate + config.staleIfError) return 'error-only'
  return 'expired'
}

/** `Cache-Control` sent with a cached guest page. Browsers always revalidate; a CDN may keep it when allowed. */
export function cacheControl(config: PageCacheConfig, ttl: number): string {
  return config.edgeHeaders
    ? `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${config.staleWhileRevalidate}, stale-if-error=${config.staleIfError}`
    : 'private, no-cache'
}

/**
 * Which record a page view belongs to, so a cached page still counts its
 * visits: "/blog/my-post" → { model: 'post', slug: 'my-post' }.
 */
export function viewTarget(path: string): { model: 'post' | 'product' | 'software' | 'game' | 'title' | 'album'; slug: string } | null {
  const parts = path.split('/').filter(Boolean)
  const one = (model: 'post' | 'product' | 'software' | 'game' | 'title' | 'album', head: string) => (parts.length === 2 && parts[0] === head ? { model, slug: decodeURIComponent(parts[1]) } : null)
  try {
    return one('post', 'blog') || one('product', 'products') || one('software', 'software') || one('game', 'games') || one('title', 'cinema')
      || (parts.length === 3 && parts[0] === 'music' && parts[1] === 'album' ? { model: 'album', slug: decodeURIComponent(parts[2]) } : null)
  } catch { return null }
}

/** Sitemap-style list of paths worth keeping warm: the sections' entry pages. */
export function warmPaths(config: PageCacheConfig): string[] {
  return config.include.filter((prefix) => prefix !== '/p/' && prefix !== '/ext/').map((prefix) => (prefix.endsWith('/') && prefix !== '/' ? prefix.slice(0, -1) : prefix))
}

export function mbToBytes(mb: number) { return Math.round(mb * 1024 * 1024) }
