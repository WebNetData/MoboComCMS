/** Pure helpers for the music, film & series and games modules. */

export const MEDIA_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/

export function slugOf(value: unknown, fallback = ''): string {
  const raw = String(value || fallback).trim().toLowerCase()
  const slug = raw.replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120)
  if (!MEDIA_SLUG.test(slug)) throw new Error('نشانی (slug) فقط حروف انگلیسی کوچک، عدد و خط تیره / Slug: lowercase latin letters, digits and dashes')
  return slug
}

/** "Drama, Crime ،جنایی" → ["Drama", "Crime", "جنایی"] */
export function splitList(value: string | null | undefined, max = 20): string[] {
  return String(value || '').split(/[,،|]/).map((part) => part.trim()).filter(Boolean).slice(0, max)
}

export function joinList(value: unknown, max = 20): string {
  const list = Array.isArray(value) ? value.map(String) : splitList(String(value || ''), max)
  return list.map((part) => part.trim().slice(0, 60)).filter(Boolean).slice(0, max).join(', ')
}

export function parseJsonList<T = Record<string, string>>(raw: string | null | undefined): T[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch { return [] }
}

export function parseJsonObject<T extends Record<string, unknown>>(raw: string | null | undefined, fallback: T): T {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...fallback, ...parsed } : fallback
  } catch { return fallback }
}

/** Array of plain string records, capped and trimmed (cast, pros/cons, screenshots…). */
export function cleanRecords(input: unknown, keys: string[], max = 40, maxLen = 400): Record<string, string>[] {
  const list = typeof input === 'string' ? parseJsonList(input) : Array.isArray(input) ? input : []
  return list.slice(0, max).flatMap((entry) => {
    if (typeof entry === 'string') return entry.trim() ? [{ [keys[0]]: entry.trim().slice(0, maxLen) }] : []
    if (!entry || typeof entry !== 'object') return []
    const out: Record<string, string> = {}
    for (const key of keys) {
      const value = (entry as Record<string, unknown>)[key]
      if (value !== undefined && value !== null && String(value).trim()) out[key] = String(value).trim().slice(0, maxLen)
    }
    return Object.keys(out).length ? [out] : []
  })
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function formatRuntime(minutes: number, fa: boolean): string {
  const m = Math.max(0, Math.round(minutes || 0))
  if (!m) return ''
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (fa) return h ? `${h} ساعت${rest ? ` و ${rest} دقیقه` : ''}` : `${rest} دقیقه`
  return h ? `${h}h ${rest ? `${rest}m` : ''}`.trim() : `${rest}m`
}

export const LINK_KINDS = ['DOWNLOAD', 'STREAM'] as const
export const LINK_AUDIO = ['', 'ORIGINAL', 'DUBBED'] as const
export const LINK_OWNERS = ['title', 'episode', 'game', 'software'] as const
export type LinkOwner = typeof LINK_OWNERS[number]

export type LinkInput = { label: string; kind: string; quality: string; size: string; audio: string; subtitle: boolean; url: string; access: string; sortOrder: number; disabled?: boolean }

/** Validates download/stream links. Only http(s) URLs are accepted. */
export function cleanLinks(input: unknown, max = 60): LinkInput[] {
  const list = Array.isArray(input) ? input : typeof input === 'string' ? parseJsonList(input) : []
  return list.slice(0, max).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return []
    const r = raw as Record<string, unknown>
    const url = String(r.url || '').trim()
    if (!url) return []
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new Error(`لینک نامعتبر / Invalid link: ${url.slice(0, 60)}`) }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('فقط لینک http/https مجاز است / Only http(s) links are allowed')
    return [{
      label: String(r.label || '').trim().slice(0, 120),
      kind: r.kind === 'STREAM' ? 'STREAM' : 'DOWNLOAD',
      quality: String(r.quality || '').trim().slice(0, 40),
      size: String(r.size || '').trim().slice(0, 40),
      audio: r.audio === 'DUBBED' ? 'DUBBED' : r.audio === 'ORIGINAL' ? 'ORIGINAL' : '',
      subtitle: r.subtitle === true || r.subtitle === 'true',
      url: url.slice(0, 2000),
      access: r.access === 'MEMBERS' ? 'MEMBERS' : 'PUBLIC',
      sortOrder: Number.isSafeInteger(Number(r.sortOrder)) ? Number(r.sortOrder) : index,
      // Absent = keep the stored flag (set by broken-link or copyright handling).
      ...(r.disabled === undefined ? {} : { disabled: r.disabled === true || r.disabled === 'true' }),
    }]
  })
}

/** Groups links for display: by audio (original/dubbed) then quality. */
export function groupLinks<T extends { audio: string; quality: string }>(links: T[]): { audio: string; items: T[] }[] {
  const order = ['DUBBED', 'ORIGINAL', '']
  const groups = new Map<string, T[]>()
  for (const link of links) groups.set(link.audio, [...(groups.get(link.audio) || []), link])
  return [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([audio, items]) => ({ audio, items }))
}

export const GAME_PLATFORMS = ['PC', 'PS5', 'PS4', 'Xbox Series', 'Xbox One', 'Switch', 'Android', 'iOS', 'Mac', 'Linux'] as const

export type Requirements = { min: Record<string, string>; rec: Record<string, string> }
export const REQUIREMENT_KEYS = ['os', 'cpu', 'gpu', 'ram', 'storage', 'directx'] as const

export function cleanRequirements(input: unknown): Requirements {
  const source = typeof input === 'string' ? parseJsonObject<Record<string, unknown>>(input, {}) : input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const side = (value: unknown) => {
    const v = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    return Object.fromEntries(REQUIREMENT_KEYS.map((key) => [key, String(v[key] || '').trim().slice(0, 160)]).filter(([, value]) => value))
  }
  return { min: side(source.min), rec: side(source.rec) }
}

/** Critic score colour band (Metacritic style). */
export function scoreBand(score: number | null | undefined): 'great' | 'good' | 'mixed' | 'bad' | 'none' {
  if (score == null) return 'none'
  if (score >= 85) return 'great'
  if (score >= 70) return 'good'
  if (score >= 50) return 'mixed'
  return 'bad'
}

/** Trailer URL → iframe player (YouTube, Aparat, Vimeo) or a direct video file. */
export function trailerSource(url: string, toEmbed: (raw: string) => string): { embed?: string; src?: string } {
  const value = String(url || '').trim()
  if (!value) return {}
  const embed = toEmbed(value)
  try {
    const host = new URL(embed).hostname
    if (/(^|\.)(youtube-nocookie\.com|youtube\.com|aparat\.com|vimeo\.com)$/.test(host)) return { embed }
  } catch { /* relative path */ }
  return /^(https:\/\/|\/(?!\/))/.test(value) ? { src: value } : {}
}

// ------------------------------------------------------------------ software

export const SOFTWARE_PLATFORMS = ['Windows', 'macOS', 'Linux', 'Android', 'iOS'] as const
export const SOFTWARE_LICENSES = ['FREE', 'FREEMIUM', 'TRIAL', 'PAID', 'OPEN_SOURCE'] as const
export type SoftwareLicense = typeof SOFTWARE_LICENSES[number]

export function normalizeLicense(value: unknown): SoftwareLicense {
  return (SOFTWARE_LICENSES as readonly string[]).includes(String(value)) ? value as SoftwareLicense : 'FREE'
}

export function licenseLabel(value: string, fa: boolean): string {
  const labels: Record<string, [string, string]> = { FREE: ['رایگان', 'Free'], FREEMIUM: ['رایگان با امکانات پولی', 'Freemium'], TRIAL: ['نسخهٔ آزمایشی', 'Trial'], PAID: ['پولی', 'Paid'], OPEN_SOURCE: ['متن‌باز', 'Open source'] }
  return (labels[value] || labels.FREE)[fa ? 0 : 1]
}
