import { readMediaInfo, type MediaInfo } from './media-info'
import { TRACK_LANGUAGES, subtitleFormat, trackLanguage } from './media'

/**
 * Subtitles that come with a video file instead of being added as their own link: a file of the same
 * name next to it (Film.1080p.mkv + Film.1080p.fa.srt) or a text track inside an MKV/MP4. Pure rules;
 * the server side reads folders, download-server listings and ffprobe output through them.
 */

export type FoundOrigin = 'SIDECAR' | 'EMBEDDED'
export type FoundFormat = 'vtt' | 'srt' | 'ass'
/** At most this many of each kind are kept for one video file. */
export const MAX_FOUND_PER_ORIGIN = 8

/** Words for each language as they appear in stream tags (ISO 639-1/2) and in release file names. */
const LANGUAGE_WORDS: Record<string, string[]> = {
  fa: ['fa', 'fas', 'per', 'pes', 'farsi', 'persian', 'parsi'],
  en: ['en', 'eng', 'english'],
  ar: ['ar', 'ara', 'arabic'],
  tr: ['tr', 'tur', 'turkish'],
  ku: ['ku', 'kur', 'ckb', 'kmr', 'kurdish', 'sorani', 'kurmanji'],
  fr: ['fr', 'fre', 'fra', 'french'],
  de: ['de', 'ger', 'deu', 'german'],
  es: ['es', 'spa', 'spanish'],
  it: ['it', 'ita', 'italian'],
  ru: ['ru', 'rus', 'russian'],
  hi: ['hin', 'hindi'],
  ko: ['ko', 'kor', 'korean'],
  ja: ['ja', 'jpn', 'japanese'],
  zh: ['zh', 'chi', 'zho', 'chinese', 'chs', 'cht'],
}
const WORD_LANGUAGE = new Map(Object.entries(LANGUAGE_WORDS).flatMap(([code, words]) => words.map(word => [word, code] as const)))
/** Words a release puts after the name that say what kind of subtitle it is, not which film. */
const TAG_WORDS = new Set(['forced', 'sdh', 'hi', 'cc', 'sub', 'subs', 'subtitle', 'subtitles', 'softsub', 'zirnevis', 'default', 'full'])

/** A language tag or word as one of the site's track languages; '' when it is none of them ("und", unknown). */
export function subtitleLanguage(tag: string): string {
  const word = tag.trim().toLowerCase().split(/[-_]/)[0]
  const code = WORD_LANGUAGE.get(word) || ''
  return code && TRACK_LANGUAGES[code] ? code : ''
}

const SEPARATOR = /[.\-_ ]+/
const words = (value: string) => value.toLowerCase().split(SEPARATOR).filter(Boolean)
const episodeOf = (value: string) => /(?:^|[^a-z0-9])(s\d{1,3}e\d{1,4}|e\d{2,4})(?:[^a-z0-9]|$)/i.exec(value)?.[1].toLowerCase() || ''
const withoutExtension = (name: string) => name.replace(/\.[^.]*$/, '')

/**
 * Whether a subtitle file name belongs to a video file name, and what its trailing words say. Matches the
 * same name with or without language/kind words after it, and a shorter name the video's name continues
 * (one subtitle for every quality of a release). An episode's subtitle must name the same episode.
 */
export function sidecarMatch(videoName: string, fileName: string): { language: string; forced: boolean; hearing: boolean } | null {
  if (!subtitleFormat(`/${encodeURIComponent(fileName)}`)) return null
  const video = withoutExtension(videoName).toLowerCase(), subtitle = withoutExtension(fileName).toLowerCase()
  if (!video || !subtitle) return null
  const parts = subtitle.split(/([.\-_ ]+)/)
  // Peel language and kind words off the end; what is left is the release name the subtitle claims.
  let language = '', forced = false, hearing = false, end = parts.length
  while (end > 2) {
    const word = parts[end - 1]
    const code = subtitleLanguage(word)
    if (code && !language) language = code
    else if (word === 'forced') forced = true
    else if (word === 'sdh' || word === 'hi' || word === 'cc') hearing = true
    else if (!TAG_WORDS.has(word) && !code) break
    end -= 2
  }
  const core = parts.slice(0, end).join('')
  const continues = (name: string) => video === name || (video.startsWith(name) && SEPARATOR.test(video.charAt(name.length)))
  // The full name with its words kept may also be the release name ("Film.Persian.Dubbed").
  const matched = continues(subtitle) ? subtitle : continues(core) ? core : ''
  if (!matched) return null
  // "Show.srt" beside every episode, or "Film" beside "Film.2", says too little to be sure.
  if (matched !== video && words(matched).length < 2) return null
  if (episodeOf(video) !== episodeOf(matched)) return null
  return { language, forced, hearing }
}

/** File names a download server's directory index (nginx, Apache, LiteSpeed autoindex) links to, in that same folder. */
export function listingFileNames(html: string, folderUrl: string): string[] {
  const folder = new URL(folderUrl)
  const names = new Set<string>()
  for (const match of html.slice(0, 1024 * 1024).matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    let target: URL
    try { target = new URL(match[1].replace(/&amp;/g, '&'), folder) } catch { continue }
    target.search = ''; target.hash = ''
    if (target.origin !== folder.origin || !target.pathname.startsWith(folder.pathname)) continue
    const rest = target.pathname.slice(folder.pathname.length)
    if (!rest || rest.includes('/')) continue
    try { names.add(decodeURIComponent(rest)) } catch { /* not a name */ }
  }
  return [...names].slice(0, 5000)
}

/** Names to try directly when the download server shows no directory index. */
export function sidecarGuesses(videoName: string): string[] {
  const base = withoutExtension(videoName)
  return base ? [`${base}.srt`, `${base}.fa.srt`, `${base}.per.srt`, `${base}.ass`, `${base}.vtt`] : []
}

/** Which embedded subtitle codecs are text the site can show, and as what; picture subtitles (PGS, VobSub) are not. */
export function embeddedFormat(codec: string): FoundFormat | 'image' | '' {
  const name = codec.toLowerCase()
  if (name === 'ass' || name === 'ssa') return 'ass'
  if (['subrip', 'srt', 'webvtt', 'mov_text', 'text'].includes(name)) return 'vtt'
  if (['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub', 'dvb_teletext'].includes(name)) return 'image'
  return ''
}

/** The name the player shows: the language, then what kind of subtitle it is; the stream's own title only when it says more. */
/** ISO 639-2 bibliographic codes (as Matroska writes them) that are not also language subtags. */
const BIBLIOGRAPHIC: Record<string, string> = { alb: 'sq', arm: 'hy', baq: 'eu', bur: 'my', chi: 'zh', cze: 'cs', dut: 'nl', fre: 'fr', geo: 'ka', ger: 'de', gre: 'el', ice: 'is', mac: 'mk', mao: 'mi', may: 'ms', per: 'fa', rum: 'ro', slo: 'sk', tib: 'bo', wel: 'cy' }
let names: Intl.DisplayNames | null | undefined
/**
 * Any language tag (ISO 639-1/2/3 or BCP 47, as a track or file names it) as a short code, so a subtitle in a language
 * outside the site's list is still known: 'swe' → 'sv', 'pt-BR' → 'pt-BR'. '' for und/zxx/mis/mul or nonsense.
 */
export function languageCode(tag: string): string {
  const known = subtitleLanguage(tag)
  if (known) return known
  const raw = String(tag || '').trim().replace(/_/g, '-')
  const [first, ...rest] = raw.toLowerCase().split('-')
  if (!/^[a-z]{2,3}$/.test(first) || ['und', 'zxx', 'mis', 'mul', 'qaa'].includes(first)) return ''
  try { return Intl.getCanonicalLocales([BIBLIOGRAPHIC[first] || first, ...rest].join('-'))[0] || '' } catch { return '' }
}
/** A language's name in Persian for any code languageCode gives; '' when the browser or server does not know it. */
export function languageName(tag: string): string {
  const code = languageCode(tag)
  if (!code) return ''
  if (TRACK_LANGUAGES[code]) return TRACK_LANGUAGES[code].fa
  if (names === undefined) { try { names = new Intl.DisplayNames(['fa'], { type: 'language', fallback: 'none' }) } catch { names = null } }
  try { return names?.of(code) || '' } catch { return '' }
}

/** `tag`: the track's own language tag, named even when it is not one of the site's languages. */
export function foundLabel(input: { language: string; tag?: string; title?: string; forced?: boolean; hearing?: boolean }): string {
  const language = trackLanguage(input.language, true) || (input.tag ? languageName(input.tag) : '')
  const title = String(input.title || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60)
  const parts = [language || title || 'زیرنویس']
  if (language && title && !subtitleLanguage(title)) parts.push(title)
  if (input.forced) parts.push('فقط گفت‌وگوهای خارجی')
  if (input.hearing) parts.push('ویژهٔ ناشنوایان')
  return parts.join(' · ')
}

/** Cues in a subtitle's text: its SubRip/WebVTT timing lines, or its ASS Dialogue lines. */
export function cueCount(content: string, format: FoundFormat) {
  return format === 'ass' ? (content.match(/^Dialogue:/gm) || []).length : (content.match(/-->/g) || []).length
}

/**
 * Whether each track a file marks forced really holds only the foreign-language parts: another track of the same file
 * has at least twice its cues. Many releases mark their full Persian subtitle forced so that players show it by default
 * (owner 2026-11-12, The.Odyssey.2026.720p.Farsi.Subbed.mkv); that one is not labelled «only foreign dialogue».
 */
export function trulyForced(tracks: { forced: boolean; cues: number }[]) {
  const most = Math.max(0, ...tracks.map(track => track.cues))
  return tracks.map(track => track.forced && track.cues * 2 <= most)
}

/** Found subtitles in the order of the language list (unknown last), keeping the order they were found in. */
export function sortFound<T extends { language: string; id: number }>(rows: T[]): T[] {
  const codes = Object.keys(TRACK_LANGUAGES)
  const place = (code: string) => { const at = codes.indexOf(code); return at < 0 ? codes.length : at }
  return [...rows].sort((a, b) => place(a.language) - place(b.language) || a.id - b.id)
}

/**
 * What the last look at a video file found, kept on the link so one address is looked at once. `reading` is a file being
 * copied over several background jobs (`read` = bytes so far of the whole) before its tracks are taken out.
 */
export type SubtitleScan = { key: string; status: 'done' | 'failed' | 'reading'; found: number; notes: string[]; at: string; read?: { bytes: number; total: number }; media?: MediaInfo }
const whole = (value: unknown) => { const n = Number(value); return Number.isSafeInteger(n) && n >= 0 ? n : 0 }
export function readScan(raw: string): SubtitleScan | null {
  try {
    const value = JSON.parse(raw || 'null') as Partial<SubtitleScan> | null
    if (!value || typeof value.key !== 'string' || !(value.status === 'done' || value.status === 'failed' || value.status === 'reading')) return null
    const read = value.status === 'reading' && value.read && typeof value.read === 'object' ? { bytes: whole(value.read.bytes), total: whole(value.read.total) } : undefined
    const media = readMediaInfo(value.media)
    return { key: value.key, status: value.status, found: Number(value.found) || 0, notes: Array.isArray(value.notes) ? value.notes.map(String).slice(0, 6) : [], at: String(value.at || ''), ...(read ? { read } : {}), ...(media ? { media } : {}) }
  } catch { return null }
}

/** A copy that has not moved for this long is taken as stopped (a lost job), and the file is looked at again. */
export const READING_STALE_MS = 30 * 60_000
/** Whether this address needs no new look: finished, or being copied and still moving. */
export function scanSettled(scan: SubtitleScan | null, key: string, now = Date.now()) {
  if (!scan || scan.key !== key) return false
  if (scan.status !== 'reading') return true
  const at = Date.parse(scan.at)
  return Number.isFinite(at) && now - at < READING_STALE_MS
}
