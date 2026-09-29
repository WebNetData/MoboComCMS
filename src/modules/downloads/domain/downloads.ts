/**
 * Download protection rules.
 *
 * Two layers keep files from leaking:
 *  1. Page tokens — every download button on the site carries a short-lived,
 *     HMAC-signed token (bound to the member when signed in). A copied link
 *     stops working after the TTL and hotlinks from other sites/channels are
 *     sent back to the item page instead of the file.
 *  2. Origin signing — for download hosts that support it (nginx secure_link or
 *     a shared HMAC secret) the final file URL itself expires, so even the
 *     redirect target cannot be reshared.
 */

import { normalizeWords, type LinkMode } from '@/modules/downloads/domain/scrub'

export type SigningMethod = 'nginx' | 'hmac'

export interface SigningHost {
  /** Hostname the rule applies to (exact or "*.example.com"). */
  host: string
  method: SigningMethod
  /** Encrypted at rest; empty means "not configured". */
  secret: string
  ttlMinutes: number
  /** nginx only: the secure_link_md5 expression with {expires} {uri} {ip} {secret}. */
  expression: string
  /** Query parameter names used by the download server. */
  tokenParam: string
  expiresParam: string
}

export interface DownloadSettings {
  /** Require a valid page token (blocks hotlinking of /api/media/link). */
  enforceTokens: boolean
  tokenTtlMinutes: number
  requireLogin: boolean
  /** Downloads per rolling 24 hours; 0 = unlimited. */
  guestDaily: number
  memberDaily: number
  vipDaily: number
  hosts: SigningHost[]
  /** Serve files on other hosts from this site's domain (/dl/…), hiding the source address. */
  maskMode: 'external' | 'off'
  /** Hosts that are always linked directly (e.g. a CDN you do not want to proxy). */
  maskExclude: string[]
  /** How long a masked link keeps working. */
  maskTtlHours: number
  /** Saved file name: {title} {label} {quality} {site} {name}; empty keeps the source name minus the listed words. */
  renamePattern: string
  /** Source site names/domains removed from copied text and file names. */
  scrubWords: string[]
  /** Links unwrapped in copied rich text: none, those to a listed source, or every link to another site. */
  scrubLinks: LinkMode
  /** Copy images that still live on other sites to this server (covers, screenshots, images in text). */
  autoLocalize: boolean
  /** Clean inside downloaded files (a cleaned copy is kept on this server): MP3 tags, video metadata, archive junk. All off by default. */
  cleanAudio: boolean
  cleanVideo: boolean
  cleanArchive: boolean
  /** Larger files are passed through unchanged. */
  cleanMaxMb: number
  /** Disk kept for cleaned copies; the least recently used are removed beyond it. */
  cleanCacheGb: number
  /** Written into cleaned files (MP3 comment, video comment), e.g. "دانلود از موبوکام". */
  tagComment: string
}

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  enforceTokens: true,
  tokenTtlMinutes: 360,
  requireLogin: false,
  guestDaily: 30,
  memberDaily: 100,
  vipDaily: 0,
  hosts: [],
  maskMode: 'external',
  maskExclude: [],
  maskTtlHours: 12,
  renamePattern: '{title} {quality} - {site}',
  scrubWords: [],
  scrubLinks: 'listed',
  autoLocalize: true,
  cleanAudio: false,
  cleanVideo: false,
  cleanArchive: false,
  cleanMaxMb: 800,
  cleanCacheGb: 20,
  tagComment: '',
}

export const NGINX_DEFAULT_EXPRESSION = '{expires}{uri} {secret}'
export const REPORT_REASONS = [
  { id: 'BROKEN', label: 'لینک کار نمی‌کند / خطا می‌دهد' },
  { id: 'WRONG_FILE', label: 'فایل اشتباه یا ناقص است' },
  { id: 'PASSWORD', label: 'رمز فایل درست نیست' },
  { id: 'SLOW', label: 'سرعت دانلود خیلی کم است' },
  { id: 'OTHER', label: 'مشکل دیگر' },
] as const
export const normalizeReportReason = (value: unknown) => (REPORT_REASONS.some((reason) => reason.id === value) ? String(value) : 'OTHER')

const int = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}
const paramName = (value: unknown, fallback: string) => (/^[a-zA-Z0-9_-]{1,30}$/.test(String(value || '')) ? String(value) : fallback)

export function normalizeHost(value: unknown): string {
  const host = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '')
  return /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : ''
}

/** Validates admin input; `previous` supplies secrets the form leaves blank. */
export function normalizeDownloadSettings(input: Record<string, unknown> = {}, previous: DownloadSettings = DEFAULT_DOWNLOAD_SETTINGS): DownloadSettings {
  const d = DEFAULT_DOWNLOAD_SETTINGS
  const hosts: SigningHost[] = []
  for (const raw of Array.isArray(input.hosts) ? input.hosts.slice(0, 20) : previous.hosts) {
    const row = (raw || {}) as Record<string, unknown>
    const host = normalizeHost(row.host)
    if (!host || hosts.some((item) => item.host === host)) continue
    const method: SigningMethod = row.method === 'hmac' ? 'hmac' : 'nginx'
    const kept = previous.hosts.find((item) => item.host === host)
    const secret = typeof row.secret === 'string' && row.secret.trim() ? row.secret.trim().slice(0, 200) : kept?.secret || ''
    const expression = String(row.expression || '').trim().slice(0, 200)
    hosts.push({
      host, method, secret,
      ttlMinutes: int(row.ttlMinutes, 5, 7 * 24 * 60, 120),
      expression: method === 'nginx' && expression.includes('{secret}') ? expression : NGINX_DEFAULT_EXPRESSION,
      tokenParam: paramName(row.tokenParam, method === 'nginx' ? 'md5' : 'token'),
      expiresParam: paramName(row.expiresParam, 'expires'),
    })
  }
  const bool = (key: keyof DownloadSettings) => (input[key] === undefined ? previous[key] as boolean : input[key] === true)
  const num = (key: 'tokenTtlMinutes' | 'guestDaily' | 'memberDaily' | 'vipDaily', min: number, max: number) => (input[key] === undefined ? previous[key] : int(input[key], min, max, d[key]))
  return {
    enforceTokens: bool('enforceTokens'),
    requireLogin: bool('requireLogin'),
    tokenTtlMinutes: num('tokenTtlMinutes', 10, 7 * 24 * 60),
    guestDaily: num('guestDaily', 0, 10_000),
    memberDaily: num('memberDaily', 0, 10_000),
    vipDaily: num('vipDaily', 0, 10_000),
    hosts,
    maskMode: input.maskMode === undefined ? previous.maskMode ?? d.maskMode : input.maskMode === 'off' ? 'off' : 'external',
    maskExclude: input.maskExclude === undefined ? previous.maskExclude ?? [] : [...new Set((Array.isArray(input.maskExclude) ? input.maskExclude : String(input.maskExclude).split(/[\s,،]+/)).map(normalizeHost).filter(Boolean))].slice(0, 50),
    maskTtlHours: input.maskTtlHours === undefined ? previous.maskTtlHours ?? d.maskTtlHours : int(input.maskTtlHours, 1, 24 * 14, d.maskTtlHours),
    renamePattern: input.renamePattern === undefined ? previous.renamePattern ?? d.renamePattern : String(input.renamePattern).replace(/[\u0000-\u001f/\\?#%"<>|*:]/g, ' ').trim().slice(0, 120),
    scrubWords: input.scrubWords === undefined ? previous.scrubWords ?? [] : normalizeWords(input.scrubWords),
    scrubLinks: input.scrubLinks === undefined ? previous.scrubLinks ?? d.scrubLinks : input.scrubLinks === 'all' || input.scrubLinks === 'off' ? input.scrubLinks : 'listed',
    autoLocalize: input.autoLocalize === undefined ? previous.autoLocalize ?? d.autoLocalize : input.autoLocalize === true,
    cleanAudio: input.cleanAudio === undefined ? previous.cleanAudio ?? false : input.cleanAudio === true,
    cleanVideo: input.cleanVideo === undefined ? previous.cleanVideo ?? false : input.cleanVideo === true,
    cleanArchive: input.cleanArchive === undefined ? previous.cleanArchive ?? false : input.cleanArchive === true,
    cleanMaxMb: input.cleanMaxMb === undefined ? previous.cleanMaxMb ?? d.cleanMaxMb : int(input.cleanMaxMb, 1, 20_000, d.cleanMaxMb),
    cleanCacheGb: input.cleanCacheGb === undefined ? previous.cleanCacheGb ?? d.cleanCacheGb : int(input.cleanCacheGb, 1, 2_000, d.cleanCacheGb),
    tagComment: input.tagComment === undefined ? previous.tagComment ?? '' : String(input.tagComment).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 150),
  }
}

/** Daily quota for a viewer; 0 = unlimited. */
export function dailyLimit(settings: DownloadSettings, viewer: { userId: number | null; member: boolean }): number {
  if (viewer.member) return settings.vipDaily
  return viewer.userId ? settings.memberDaily : settings.guestDaily
}

export function hostMatches(rule: string, hostname: string): boolean {
  const host = hostname.toLowerCase()
  return rule.startsWith('*.') ? host.endsWith(rule.slice(1)) || host === rule.slice(2) : host === rule
}

/** The nginx secure_link_md5 string for a request (before hashing). */
export function nginxExpression(expression: string, values: { expires: number; uri: string; ip: string; secret: string }): string {
  return expression
    .replace(/\{expires\}/g, String(values.expires))
    .replace(/\{uri\}/g, values.uri)
    .replace(/\{ip\}/g, values.ip)
    .replace(/\{secret\}/g, values.secret)
}

/** Page token payload: what the HMAC covers. */
export const tokenPayload = (linkKey: string, expires: number, userId: number | null) => `dl|${linkKey}|${expires}|${userId || 0}`

/** "<expires base36>.<signature>" → parts, or null when malformed. */
export function splitToken(token: unknown): { expires: number; signature: string } | null {
  const match = /^([0-9a-z]{1,10})\.([A-Za-z0-9_-]{16,64})$/.exec(String(token || ''))
  if (!match) return null
  const expires = parseInt(match[1], 36)
  return Number.isSafeInteger(expires) ? { expires, signature: match[2] } : null
}
