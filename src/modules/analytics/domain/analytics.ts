/** Pure rules for cookie-free analytics: which paths count, bots, devices and traffic sources. */

const SKIP = /^\/(admin|api|_next|studio|builder-preview|reseller|invoice|payment|checkout|login|register|dashboard|shared-cart|quote)(\/|$)/

/** Public page path to count, or '' to ignore (private areas, assets, junk). */
export function normalizeTrackedPath(value: unknown): string {
  let path = String(value ?? '').trim()
  if (!path.startsWith('/') || path.startsWith('//')) return ''
  path = path.split(/[?#]/)[0].replace(/\/{2,}/g, '/')
  if (path.length > 1) path = path.replace(/\/$/, '')
  try { path = decodeURI(path) } catch { return '' }
  if (SKIP.test(path) || /\.[a-z0-9]{2,5}$/i.test(path) || path.length > 200 || /[\u0000-\u001f<>]/.test(path)) return ''
  return path
}

const BOT = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|facebookexternalhit|embedly|curl|wget|python|axios|node-fetch|go-http|java\//i

export type Agent = { bot: boolean; device: 'mobile' | 'tablet' | 'desktop'; browser: string; os: string }

export function classifyUserAgent(ua: string): Agent {
  const bot = !ua || BOT.test(ua)
  const tablet = /ipad|tablet|(android(?!.*mobile))/i.test(ua)
  const mobile = !tablet && /mobile|iphone|ipod|android|windows phone/i.test(ua)
  const browser = /edg\//i.test(ua) ? 'Edge' : /opr\/|opera/i.test(ua) ? 'Opera' : /samsungbrowser/i.test(ua) ? 'Samsung Internet'
    : /firefox|fxios/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'دیگر'
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad|ipod/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows'
    : /mac os x|macintosh/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'دیگر'
  return { bot, device: tablet ? 'tablet' : mobile ? 'mobile' : 'desktop', browser, os }
}

const SOURCES: [RegExp, string][] = [
  [/(^|\.)google\./, 'Google'], [/(^|\.)bing\.com$/, 'Bing'], [/(^|\.)yandex\./, 'Yandex'], [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)(t\.me|telegram\.org|web\.telegram\.org)$/, 'Telegram'], [/(^|\.)instagram\.com$/, 'Instagram'], [/(^|\.)(x|twitter|t)\.co(m)?$/, 'X / Twitter'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'], [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'LinkedIn'], [/(^|\.)(facebook\.com|fb\.me)$/, 'Facebook'],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, 'ChatGPT'], [/(^|\.)(claude\.ai|perplexity\.ai)$/, 'AI assistants'], [/(^|\.)eitaa\.com$/, 'Eitaa'], [/(^|\.)(ble\.ir|bale\.ai)$/, 'Bale'],
]

/** Traffic source label for a referrer URL; the site's own host counts as direct. */
export function sourceOf(referrer: unknown, ownHost: string): string {
  let host = ''
  try { host = new URL(String(referrer || '')).hostname.toLowerCase().replace(/^www\./, '') } catch { return 'مستقیم' }
  if (!host || host === ownHost.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '')) return 'مستقیم'
  return SOURCES.find(([pattern]) => pattern.test(host))?.[1] || host
}

const CAMPAIGNS: Record<string, string> = { telegram: 'Telegram', instagram: 'Instagram', push: 'اعلان مرورگر', sms: 'پیامک', email: 'ایمیل' }

/** Label for a utm_source value (our own announcements tag their links). */
export function campaignSource(utm: unknown): string {
  const value = String(utm || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40)
  return value ? CAMPAIGNS[value] || value : ''
}

/** Percentage change, or null without a baseline. */
export const change = (current: number, previous: number) => (previous > 0 ? Math.round(((current - previous) / previous) * 100) : null)
