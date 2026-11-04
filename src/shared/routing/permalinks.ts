import { RESERVED_SEGMENTS } from '@/shared/routing/reserved'

/** Typed URL presentation over the existing internal routes; never an authorization registry. */
export const PERMALINK_TYPES = [
  { key: 'page', name: 'صفحه‌ها', base: '/p', template: '/p/{slug}', sample: 'our-story' },
  { key: 'post', name: 'مطالب مجله', base: '/blog', template: '/blog/{slug}', sample: 'welcome' },
  { key: 'track', name: 'آهنگ‌ها', base: '/music/track', template: '/music/track/{slug}', sample: 'banoo-jan', artist: true },
  { key: 'album', name: 'آلبوم‌ها', base: '/music/album', template: '/music/album/{slug}', sample: 'new-album', artist: true },
  { key: 'artist', name: 'خوانندگان', base: '/music/artist', template: '/music/artist/{slug}', sample: 'komeil-nasri' },
  { key: 'playlist', name: 'پلی‌لیست‌ها', base: '/music/playlist', template: '/music/playlist/{slug}', sample: 'favorites' },
  { key: 'title', name: 'فیلم و سریال', base: '/cinema', template: '/cinema/{slug}', sample: 'inception' },
  { key: 'game', name: 'بازی‌ها', base: '/games', template: '/games/{slug}', sample: 'elden-ring' },
  { key: 'software', name: 'نرم‌افزارها', base: '/software', template: '/software/{slug}', sample: 'firefox' },
  { key: 'product', name: 'محصولات فروشگاه', base: '/products', template: '/products/{slug}', sample: 'digital-file' },
  { key: 'prompt', name: 'الگوهای پرامپت', base: '/prompts/templates', template: '/prompts/templates/{slug}', sample: 'portrait' },
  { key: 'celebrity', name: 'هنرمندان', base: '/celebrities', template: '/celebrities/{slug}', sample: 'artist-name' },
  { key: 'business', name: 'کسب‌وکارها', base: '/businesses', template: '/businesses/{slug}', sample: 'mobocom' },
] as const
export type PermalinkType = typeof PERMALINK_TYPES[number]['key']
export type PermalinkConfig = { templates: Record<PermalinkType, string>; history: Partial<Record<PermalinkType, string[]>>; aliasHistory: Record<string, string[]> }
const globalStore = globalThis as unknown as { __mcPermalinks?: PermalinkConfig }
export const defaultPermalinks = (): PermalinkConfig => ({ templates: Object.fromEntries(PERMALINK_TYPES.map(t => [t.key, t.template])) as Record<PermalinkType, string>, history: {}, aliasHistory: {} })
export const getPermalinks = () => globalStore.__mcPermalinks || defaultPermalinks()
export const setPermalinks = (config: PermalinkConfig) => { globalStore.__mcPermalinks = config }

export function applySectionAlias(path: string, aliases: Record<string, string>): string {
  for (const [base, target] of Object.entries(aliases)) if (path === base || path.startsWith(base + '/') || path.startsWith(base + '?') || path.startsWith(base + '#')) return target + path.slice(base.length)
  return path
}
export function reservedPageSlug(slug: string, aliases: Record<string, string> = {}, history: Record<string, string[]> = {}) {
  return slug.includes('.') || RESERVED_SEGMENTS.has(slug.toLowerCase()) || PERMALINK_TYPES.some(t => t.base.split('/')[1] === slug.toLowerCase()) || [...Object.values(aliases), ...Object.values(history).flat()].some(p => p.slice(1) === slug.toLowerCase())
}
const segment = (value: string) => value && !/[\/\\?#\x00-\x20\x7f]/.test(value) && value !== '.' && value !== '..'
const parts = (pattern: string) => pattern.split('/').slice(1)
const variable = (part: string) => part === '{slug}' || part === '{artist}'
/** Static siblings win over dynamic item routes; keep in step with src/app (covered by a test). */
export const STATIC_CONTENT_SEGMENTS: Partial<Record<PermalinkType, readonly string[]>> = {
  title: ['browse', 'calendar', 'category', 'history', 'people'], game: ['browse', 'calendar', 'category', 'franchise', 'franchises', 'top'],
  software: ['browse', 'category', 'releases'], business: ['activity'],
}
/** Native listings/tools remain owned by their current pages, even under a section alias. */
export const PROTECTED_CONTENT_PREFIXES = [
  ...Object.entries(STATIC_CONTENT_SEGMENTS).flatMap(([key, segments]) => segments.map(segment => `${PERMALINK_TYPES.find(type => type.key === key)!.base}/${segment}`)),
  ...['albums', 'artists', 'browse', 'category', 'history', 'language', 'my-playlists', 'playlists'].map(segment => `/music/${segment}`),
  '/prompts/history', '/prompts/library',
]
function overlaps(a: string, b: string) { const x = parts(a), y = parts(b); return x.length === y.length && x.every((v, i) => variable(v) || variable(y[i]) || v === y[i]) }

export function normalizePermalinks(input: unknown): PermalinkConfig {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Partial<PermalinkConfig> : {}
  const config = defaultPermalinks()
  if (raw.templates && typeof raw.templates === 'object' && !Array.isArray(raw.templates)) for (const t of PERMALINK_TYPES) if (typeof raw.templates[t.key] === 'string') config.templates[t.key] = raw.templates[t.key]
  if (raw.history && typeof raw.history === 'object') for (const t of PERMALINK_TYPES) if (Array.isArray(raw.history[t.key])) config.history[t.key] = [...new Set(raw.history[t.key]!.filter(p => typeof p === 'string'))]
  if (raw.aliasHistory && typeof raw.aliasHistory === 'object' && !Array.isArray(raw.aliasHistory)) for (const [base, values] of Object.entries(raw.aliasHistory)) if (Array.isArray(values)) config.aliasHistory[base] = [...new Set(values.filter(p => typeof p === 'string'))]
  return config
}

export function validatePermalinks(config: PermalinkConfig, aliases: Record<string, string> = {}): string | null {
  const patterns: { key: string; path: string }[] = []
  for (const type of PERMALINK_TYPES) {
    for (const pattern of [config.templates[type.key], ...(config.history[type.key] || []), type.template]) {
      const tokens = parts(pattern)
      if (pattern.length > 180 || !pattern.startsWith('/') || pattern.endsWith('/') || tokens.length > 6 || !tokens.length || tokens.filter(p => p === '{slug}').length !== 1 || tokens.filter(p => p === '{artist}').length > 1 || tokens.some(p => !variable(p) && !/^[a-z0-9][a-z0-9-]{0,59}$/.test(p))) return `الگوی ${type.name} معتبر نیست؛ {slug} باید دقیقاً یک بخش مسیر باشد.`
      if (tokens.includes('{artist}') && !('artist' in type)) return `متغیر {artist} فقط برای آهنگ و آلبوم مجاز است.`
      if (variable(tokens[0]) && !(type.key === 'page' && tokens.length === 1 && tokens[0] === '{slug}')) return 'مسیر مستقیم /{slug} فقط برای صفحه‌ها مجاز است.'
      if (!variable(tokens[0]) && RESERVED_SEGMENTS.has(tokens[0]) && tokens[0] !== type.base.split('/')[1]) return `مسیر /${tokens[0]} رزرو شده است.`
      if (PERMALINK_TYPES.some(t => t.base.split('/')[1] === tokens[0] && t.base.split('/')[1] !== type.base.split('/')[1])) return `مسیر /${tokens[0]} متعلق به بخش دیگری است.`
      if (Object.entries(aliases).some(([base, alias]) => alias.slice(1) === tokens[0] && base.split('/')[1] !== type.base.split('/')[1])) return 'پیشوند انتخابی متعلق به آدرس بخش دیگری است.'
      const published = applySectionAlias(pattern, aliases)
      if (PROTECTED_CONTENT_PREFIXES.some(prefix => { const reserved = applySectionAlias(prefix, aliases); return published === reserved || published.startsWith(reserved + '/') })) return 'این مسیر متعلق به فهرست، ابزار یا زیرصفحهٔ موجود است و نمی‌تواند الگوی محتوا باشد.'
      patterns.push({ key: type.key, path: applySectionAlias(pattern, aliases) })
    }
    if ((config.history[type.key]?.length || 0) > 100) return 'تاریخچهٔ مسیرها پر شده است؛ آدرس قدیمی خودکار حذف نمی‌شود.'
  }
  for (let i = 0; i < patterns.length; i++) for (let j = i + 1; j < patterns.length; j++) if (patterns[i].key !== patterns[j].key && overlaps(patterns[i].path, patterns[j].path)) return 'الگوهای دو نوع محتوا یا تاریخچهٔ آن‌ها با یکدیگر تداخل دارند.'
  return null
}

export function permalinkPath(kind: PermalinkType, slug: string, values: { artist?: string } = {}, config = getPermalinks(), aliases: Record<string, string> = {}): string {
  const type = PERMALINK_TYPES.find(t => t.key === kind)!
  const old = `${type.base}/${encodeURIComponent(slug)}`
  const pattern = config.templates[kind]
  if (!segment(slug) || (pattern.includes('{artist}') && !segment(values.artist || '')) || (pattern === '/{slug}' && reservedPageSlug(slug, aliases, config.aliasHistory))) return applySectionAlias(old, aliases)
  return applySectionAlias(pattern.replace('{slug}', encodeURIComponent(slug)).replace('{artist}', encodeURIComponent(values.artist || '')), aliases)
}

/** Returns routing coordinates only. The canonical page/API still decides access. */
export function matchPermalink(path: string, config = getPermalinks(), aliases: Record<string, string> = {}): { kind: PermalinkType; slug: string; artist?: string; internal: string } | null {
  const pathname = path.split(/[?#]/, 1)[0]
  for (const type of PERMALINK_TYPES) for (const pattern of [applySectionAlias(config.templates[type.key], aliases), ...(config.history[type.key] || []), applySectionAlias(type.template, aliases), type.template]) {
    const expected = parts(pattern), actual = parts(pathname)
    if (expected.length !== actual.length) continue
    const values: Record<string, string> = {}
    let valid = true
    for (let i = 0; i < actual.length; i++) {
      let value: string
      try { value = decodeURIComponent(actual[i]) } catch { valid = false; break }
      if (!segment(value) || (!variable(expected[i]) && expected[i] !== value)) { valid = false; break }
      if (variable(expected[i])) values[expected[i].slice(1, -1)] = value
    }
    if (!valid || STATIC_CONTENT_SEGMENTS[type.key]?.includes(values.slug) || (pattern === '/{slug}' && reservedPageSlug(values.slug, aliases, config.aliasHistory))) continue
    return { kind: type.key, slug: values.slug, ...(values.artist ? { artist: values.artist } : {}), internal: `${type.base}/${encodeURIComponent(values.slug)}` }
  }
  return null
}

export function presentContentPath(path: string, config = getPermalinks(), aliases: Record<string, string> = {}) {
  const cut = path.search(/[?#]/), pathname = cut < 0 ? path : path.slice(0, cut), suffix = cut < 0 ? '' : path.slice(cut)
  for (const type of PERMALINK_TYPES) {
    if (!pathname.startsWith(type.base + '/')) continue
    const slug = pathname.slice(type.base.length + 1)
    if (!slug || slug.includes('/') || STATIC_CONTENT_SEGMENTS[type.key]?.includes(slug)) continue
    try { return permalinkPath(type.key, decodeURIComponent(slug), {}, config, aliases) + suffix } catch { return path }
  }
  return applySectionAlias(path, aliases)
}
