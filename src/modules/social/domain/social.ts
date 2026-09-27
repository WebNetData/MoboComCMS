/**
 * Announcement rules: which content is announced where, and how a post reads.
 * The same queue carries Telegram channel posts, Instagram posts and web push
 * "new content" notifications.
 */

export const CHANNELS = ['TELEGRAM', 'INSTAGRAM', 'PUSH'] as const
export type Channel = typeof CHANNELS[number]
export const ANNOUNCE_TYPES = ['software', 'game', 'title', 'album', 'track', 'post', 'product'] as const
export type AnnounceType = typeof ANNOUNCE_TYPES[number]

export interface SocialSettings {
  types: Record<AnnounceType, boolean>
  /** Minutes to wait after publishing (gives editors time to fix typos). */
  delayMinutes: number
  utm: boolean
  telegram: { enabled: boolean; channel: string; template: string; button: string; silent: boolean }
  instagram: { enabled: boolean; accountId: string; accessToken: string; graphVersion: string; template: string; hashtags: string }
  push: { enabled: boolean; title: string; body: string }
}

export const DEFAULT_SOCIAL: SocialSettings = {
  types: { software: true, game: true, title: true, album: true, track: false, post: true, product: true },
  delayMinutes: 0,
  utm: true,
  telegram: {
    enabled: false, channel: '', button: 'مشاهده و دانلود', silent: false,
    template: '{icon} {title}\n{subtitle}\n\n{summary}\n\n🔗 {url}\n{hashtags}',
  },
  instagram: {
    enabled: false, accountId: '', accessToken: '', graphVersion: 'v23.0', hashtags: '#موبوکام',
    template: '{icon} {title}\n{subtitle}\n\n{summary}\n\nلینک در بیو و سایت موبوکام 👆\n{hashtags}',
  },
  push: { enabled: false, title: '{icon} {type} تازه: {title}', body: '{subtitle}' },
}

export const TYPE_ICON: Record<AnnounceType, string> = { software: '💾', game: '🎮', title: '🎬', album: '💿', track: '🎵', post: '📰', product: '🛍' }
export const TYPE_NAME: Record<AnnounceType, string> = { software: 'نرم‌افزار', game: 'بازی', title: 'فیلم و سریال', album: 'آلبوم', track: 'آهنگ', post: 'مقاله', product: 'محصول' }
export const isAnnounceType = (value: string): value is AnnounceType => (ANNOUNCE_TYPES as readonly string[]).includes(value)

const text = (value: unknown, max: number, fallback = '') => (typeof value === 'string' ? value.replace(/\r/g, '').slice(0, max) : fallback)
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)

/** Telegram chat id: "@channel_name" or a numeric id like -1001234567890. */
export function normalizeChannel(value: unknown): string {
  const raw = String(value || '').trim().replace(/^https?:\/\/t\.me\//i, '@')
  if (/^-?\d{5,20}$/.test(raw)) return raw
  const name = raw.replace(/^@/, '')
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(name) ? `@${name}` : ''
}

export function normalizeSocialSettings(input: Record<string, any> = {}, previous: SocialSettings = DEFAULT_SOCIAL): SocialSettings {
  const d = previous
  const types = { ...d.types }
  for (const type of ANNOUNCE_TYPES) if (typeof input.types?.[type] === 'boolean') types[type] = input.types[type]
  const tg = input.telegram || {}
  const ig = input.instagram || {}
  const push = input.push || {}
  return {
    types,
    delayMinutes: Math.max(0, Math.min(24 * 60, Math.round(Number(input.delayMinutes ?? d.delayMinutes)) || 0)),
    utm: bool(input.utm, d.utm),
    telegram: {
      enabled: bool(tg.enabled, d.telegram.enabled),
      channel: tg.channel === undefined ? d.telegram.channel : normalizeChannel(tg.channel),
      template: text(tg.template, 900, d.telegram.template) || DEFAULT_SOCIAL.telegram.template,
      button: text(tg.button, 40, d.telegram.button).trim(),
      silent: bool(tg.silent, d.telegram.silent),
    },
    instagram: {
      enabled: bool(ig.enabled, d.instagram.enabled),
      accountId: ig.accountId === undefined ? d.instagram.accountId : /^\d{5,30}$/.test(String(ig.accountId).trim()) ? String(ig.accountId).trim() : '',
      // Blank keeps the stored (encrypted) token.
      accessToken: typeof ig.accessToken === 'string' && ig.accessToken.trim() ? ig.accessToken.trim().slice(0, 600) : d.instagram.accessToken,
      graphVersion: /^v\d{1,2}\.\d$/.test(String(ig.graphVersion || '')) ? String(ig.graphVersion) : d.instagram.graphVersion,
      template: text(ig.template, 1800, d.instagram.template) || DEFAULT_SOCIAL.instagram.template,
      hashtags: text(ig.hashtags, 300, d.instagram.hashtags).trim(),
    },
    push: {
      enabled: bool(push.enabled, d.push.enabled),
      title: text(push.title, 120, d.push.title).trim() || DEFAULT_SOCIAL.push.title,
      body: text(push.body, 200, d.push.body).trim(),
    },
  }
}

export type PostVars = { type: AnnounceType; title: string; subtitle: string; summary: string; url: string; hashtags?: string }

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Hashtags from free words: "#نرم_افزار" style (spaces → underscores). */
export function hashtag(word: string): string {
  const tag = word.trim().replace(/^#/, '').replace(/[\s‌]+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '')
  return tag ? `#${tag}` : ''
}

/**
 * Fills a template. `html` escapes everything for Telegram's HTML parse mode
 * (the title is set in bold); plain mode is for Instagram captions and push.
 * Empty lines left by empty variables are collapsed.
 */
export function renderPost(template: string, vars: PostVars, options: { html?: boolean; max?: number } = {}): string {
  const esc = options.html ? escapeHtml : (value: string) => value
  const values: Record<string, string> = {
    icon: TYPE_ICON[vars.type], type: TYPE_NAME[vars.type],
    title: options.html ? `<b>${escapeHtml(vars.title)}</b>` : vars.title,
    subtitle: esc(vars.subtitle), summary: esc(vars.summary.length > 400 ? `${vars.summary.slice(0, 400).replace(/\s+\S*$/, '')}…` : vars.summary),
    url: esc(vars.url), hashtags: esc(vars.hashtags || ''),
  }
  const body = (options.html ? escapeHtml(template) : template).replace(/\{(icon|type|title|subtitle|summary|url|hashtags)\}/g, (_m, key: string) => values[key] ?? '')
  const cleaned = body.split('\n').map((line) => line.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const max = options.max ?? 4096
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned
}

/** Adds campaign parameters so analytics shows which channel brought the visit. */
export function withUtm(url: string, channel: Channel, enabled: boolean): string {
  if (!enabled) return url
  try {
    const parsed = new URL(url)
    parsed.searchParams.set('utm_source', channel.toLowerCase())
    parsed.searchParams.set('utm_medium', channel === 'PUSH' ? 'push' : 'social')
    return parsed.toString()
  } catch { return url }
}

/** Exponential retry: 5 min, 10, 20, 40, then give up. */
export const MAX_ATTEMPTS = 5
export const retryDelayMs = (attempts: number) => 5 * 60_000 * 2 ** Math.max(0, attempts - 1)
