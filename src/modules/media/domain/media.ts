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

export const LINK_KINDS = ['DOWNLOAD', 'STREAM', 'SUBTITLE', 'AUDIO'] as const
/** A file that goes with the video instead of being it: a subtitle, or a separate audio track (a dub to add to another release). */
export const TRACK_KINDS = ['SUBTITLE', 'AUDIO'] as const
export const isTrack = (kind: string) => (TRACK_KINDS as readonly string[]).includes(kind)
/** Languages a track can be filed under; the order is the order they are offered and shown in. */
export const TRACK_LANGUAGES: Record<string, { fa: string; en: string }> = {
  fa: { fa: 'فارسی', en: 'Persian' }, en: { fa: 'انگلیسی', en: 'English' }, ar: { fa: 'عربی', en: 'Arabic' }, tr: { fa: 'ترکی', en: 'Turkish' },
  ku: { fa: 'کردی', en: 'Kurdish' }, fr: { fa: 'فرانسوی', en: 'French' }, de: { fa: 'آلمانی', en: 'German' }, es: { fa: 'اسپانیایی', en: 'Spanish' },
  it: { fa: 'ایتالیایی', en: 'Italian' }, ru: { fa: 'روسی', en: 'Russian' }, hi: { fa: 'هندی', en: 'Hindi' }, ko: { fa: 'کره‌ای', en: 'Korean' },
  ja: { fa: 'ژاپنی', en: 'Japanese' }, zh: { fa: 'چینی', en: 'Chinese' },
}
export const trackLanguage = (code: string, fa: boolean) => (TRACK_LANGUAGES[code] ? (fa ? TRACK_LANGUAGES[code].fa : TRACK_LANGUAGES[code].en) : '')
export const LINK_AUDIO = ['', 'ORIGINAL', 'DUBBED'] as const
export const LINK_OWNERS = ['title', 'episode', 'game', 'gameupdate', 'software', 'softwarerelease'] as const
export type LinkOwner = typeof LINK_OWNERS[number]

export type LinkInput = { label: string; kind: string; quality: string; size: string; platform: string; architecture: string; checksum: string; audio: string; subtitle: boolean; language: string; url: string; access: string; sortOrder: number; disabled?: boolean }

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
    const checksum = String(r.checksum || '').trim().toLowerCase()
    if (checksum && !/^[a-f0-9]{64}$/.test(checksum)) throw new Error('SHA-256 فایل باید ۶۴ نویسهٔ هگزادسیمال باشد')
    const kind = (LINK_KINDS as readonly string[]).includes(String(r.kind)) ? String(r.kind) : 'DOWNLOAD'
    const track = isTrack(kind)
    return [{
      label: String(r.label || '').trim().slice(0, 120),
      kind,
      quality: String(r.quality || '').trim().slice(0, 40),
      size: String(r.size || '').trim().slice(0, 40),
      platform: String(r.platform || '').trim().slice(0, 60),
      architecture: String(r.architecture || '').trim().slice(0, 40),
      checksum,
      // A track is not a release of the video: it has a language, not a dub/original side or a "has subtitles" mark.
      // A well-formed code of the shared audio list (dub, original, a dubbing studio…); the save keeps known ones only.
      audio: track ? '' : /^[A-Z0-9_]{1,40}$/.test(String(r.audio ?? '')) ? String(r.audio) : '',
      subtitle: !track && (r.subtitle === true || r.subtitle === 'true'),
      language: track && String(r.language || '') in TRACK_LANGUAGES ? String(r.language) : '',
      url: url.slice(0, 2000),
      access: r.access === 'MEMBERS' ? 'MEMBERS' : 'PUBLIC',
      sortOrder: Number.isSafeInteger(Number(r.sortOrder)) ? Number(r.sortOrder) : index,
      // Absent = keep the stored flag (set by broken-link or copyright handling).
      ...(r.disabled === undefined ? {} : { disabled: r.disabled === true || r.disabled === 'true' }),
    }]
  })
}

/** Groups the releases for display: by audio (original/dubbed) then quality. Separate tracks are not releases and are left out. */
export function groupLinks<T extends { audio: string; quality: string; kind?: string }>(links: T[], order: readonly string[] = ['DUBBED', 'ORIGINAL', '']): { audio: string; items: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const link of links) if (!isTrack(link.kind || '')) groups.set(link.audio, [...(groups.get(link.audio) || []), link])
  // An audio side the order does not name comes after the named ones, before links with no audio side.
  const rank = (audio: string) => { const at = order.indexOf(audio); return at >= 0 ? at : order.includes('') ? order.indexOf('') - 0.5 : order.length }
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([audio, items]) => ({ audio, items }))
}

/** The separate tracks of an item, each kind in the order of the language list (unfiled ones last), keeping the editor's order within a language. */
export function trackLinks<T extends { kind: string; language?: string }>(links: T[]): { subtitles: T[]; audio: T[] } {
  const codes = Object.keys(TRACK_LANGUAGES)
  const place = (link: T) => { const at = codes.indexOf(link.language || ''); return at < 0 ? codes.length : at }
  const of = (kind: string) => links.filter((link) => link.kind === kind).map((link, index) => ({ link, index })).sort((a, b) => place(a.link) - place(b.link) || a.index - b.index).map((row) => row.link)
  return { subtitles: of('SUBTITLE'), audio: of('AUDIO') }
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

/** How a film / episode link can be watched in the browser. */
export type PlaybackKind = 'hls' | 'video' | 'maybe' | 'embed' | 'none'

const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|mov)$/i
const MAYBE_EXT = /\.(mkv)$/i
const OTHER_EXT = /\.(avi|wmv|flv|rmvb|ts|zip|rar|7z|iso|exe|apk|dmg|srt|ass)$/i

/**
 * Picks the player for a link: HLS (.m3u8) through hls.js, MP4/WebM natively,
 * MKV "maybe" (plays only with browser codecs: H.264/VP9 + AAC/Opus, not
 * HEVC/AC3/DTS), known video sites as an embed. `none` = download only
 * (archives, AVI, plain http on an https site, …).
 */
export function playbackKind(rawUrl: string, kind: string, toEmbed: (raw: string) => string = (raw) => raw): PlaybackKind {
  // A subtitle or a separate audio file is fetched, never played as the video.
  if (isTrack(kind)) return 'none'
  let url: URL
  const raw = String(rawUrl || '').trim(), local = /^\/files\/[^\s<>\\]+$/.test(raw)
  let path: string
  try { url = new URL(raw, local ? 'https://local.invalid' : undefined); path = decodeURIComponent(url.pathname).toLowerCase() } catch { return 'none' }
  const embed = toEmbed(url.toString())
  try {
    const host = new URL(embed).hostname
    if (/(^|\.)(youtube-nocookie\.com|youtube\.com|aparat\.com|vimeo\.com)$/.test(host)) return 'embed'
  } catch { /* not an embed */ }
  if (!local && url.protocol !== 'https:') return 'none'
  const hint = `${path} ${url.search.toLowerCase()}`
  if (/\.m3u8($|[?\s])/.test(hint) || path.endsWith('.m3u8')) return 'hls'
  if (VIDEO_EXT.test(path)) return 'video'
  if (MAYBE_EXT.test(path)) return 'maybe'
  if (OTHER_EXT.test(path)) return 'none'
  // A stream link without a known extension (player gateways): try it natively.
  return kind === 'STREAM' ? 'maybe' : 'none'
}

export const canPlayOnline = (kind: PlaybackKind) => kind !== 'none'

// ------------------------------------------------------------------ software

export const SOFTWARE_PLATFORMS = ['Windows', 'macOS', 'Linux', 'Android', 'iOS'] as const
export const SOFTWARE_LICENSES = ['FREE', 'FREEMIUM', 'TRIAL', 'PAID', 'OPEN_SOURCE'] as const
export type SoftwareLicense = typeof SOFTWARE_LICENSES[number]

/** A well-formed licence code (any of the owner's list, checked on save); anything else is the free licence. */
export function normalizeLicense(value: unknown): string {
  const code = String(value ?? '').trim().toUpperCase()
  return /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'FREE'
}

export function licenseLabel(value: string, fa: boolean): string {
  const labels: Record<string, [string, string]> = { FREE: ['رایگان', 'Free'], FREEMIUM: ['رایگان با امکانات پولی', 'Freemium'], TRIAL: ['نسخهٔ آزمایشی', 'Trial'], PAID: ['پولی', 'Paid'], OPEN_SOURCE: ['متن‌باز', 'Open source'] }
  return (labels[value] || labels.FREE)[fa ? 0 : 1]
}

// ------------------------------------------------------------------ subtitles in the player

/** WebVTT, converted SubRip, and styled ASS/SSA with a plain-caption fallback. */
export function subtitleFormat(rawUrl: string): 'vtt' | 'srt' | 'ass' | '' {
  let path = ''
  try { path = decodeURIComponent(new URL(rawUrl, 'https://local.invalid').pathname).toLowerCase() } catch { return '' }
  return path.endsWith('.vtt') ? 'vtt' : path.endsWith('.srt') ? 'srt' : /\.(ass|ssa)$/.test(path) ? 'ass' : ''
}

export function playableAudioFile(rawUrl: string): boolean {
  try { return /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus|mp4|webm)$/i.test(decodeURIComponent(new URL(rawUrl, 'https://local.invalid').pathname)) } catch { return false }
}

/** Accessible plain-caption fallback; the styled player receives the original bounded ASS separately. */
export function assToWebVtt(input: string): string {
  let events = false, columns: string[] = [], count = 0
  const cues: string[] = []
  const time = (value: string) => /^\d{1,2}:\d{2}:\d{2}\.\d{1,3}$/.test(value.trim()) ? value.trim().replace(/^(\d):/, '0$1:').replace(/\.(\d{1,2})$/, (_, ms: string) => '.' + ms.padEnd(3, '0')) : ''
  for (const line of input.split(/\r?\n/)) {
    if (/^\[/.test(line)) events = /^\[Events\]\s*$/i.test(line)
    if (!events) continue
    if (/^Format:/i.test(line)) columns = line.slice(line.indexOf(':') + 1).split(',').map(value => value.trim().toLowerCase())
    if (!/^Dialogue:/i.test(line) || !columns.length || columns.at(-1) !== 'text') continue
    const parts = line.slice(line.indexOf(':') + 1).split(','), text = parts.splice(columns.length - 1).join(',')
    const start = time(parts[columns.indexOf('start')] || ''), end = time(parts[columns.indexOf('end')] || '')
    const safe = text.replace(/\{[^}]*\}/g, '').replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()
    if (start && end && safe && ++count <= 20000) cues.push(`${start} --> ${end}\n${safe}`)
  }
  return cues.length ? 'WEBVTT\n\n' + cues.join('\n\n') + '\n' : ''
}

export const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024

/** The text of a subtitle file. Persian subtitles are often not UTF-8: bytes that are not valid UTF-8 are read as Windows-1256. */
export function decodeSubtitle(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return new TextDecoder('windows-1256').decode(bytes) }
}
const CUE_TIME = /^(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s+-->\s+(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/

/**
 * A subtitle file as WebVTT for the browser. SubRip differs in its header, its decimal comma and its cue
 * numbers; both may carry markup, of which only italics, bold and underline are kept. A file without a
 * single timed cue is not a subtitle and gives ''.
 */
export function toWebVtt(text: string, format: 'vtt' | 'srt'): string {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let cues = 0
  let inHeader = format === 'vtt'
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (inHeader) {
      // The header block of a WebVTT file (WEBVTT, NOTE, STYLE, REGION) is written again by us, not passed on.
      if (!CUE_TIME.test(line) && !CUE_TIME.test(lines[index + 1] || '')) continue
      inHeader = false
    }
    if (CUE_TIME.test(line)) {
      cues++
      out.push(line.replace(/(\d),(\d{1,3})/g, '$1.$2').replace(/^(\d{1,2}:\d{2}\.\d{1,3})/, '00:$1').replace(/(-->\s+)(\d{1,2}:\d{2}\.\d{1,3})(\s|$)/, '$100:$2$3'))
      continue
    }
    // A cue number stands alone just before its timing line; WebVTT does not need it.
    if (/^\d+$/.test(line.trim()) && CUE_TIME.test(lines[index + 1] || '')) continue
    out.push(line.replace(/<(?!\/?[ibu]>)[^>]*>/gi, '').replace(/\{\\[^}]*\}/g, ''))
  }
  return cues ? `WEBVTT\n\n${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n` : ''
}
