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
export function foundLabel(input: { language: string; title?: string; forced?: boolean; hearing?: boolean }): string {
  const language = trackLanguage(input.language, true)
  const title = String(input.title || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60)
  const parts = [language || title || 'زیرنویس']
  if (language && title && !subtitleLanguage(title)) parts.push(title)
  if (input.forced) parts.push('فقط گفت‌وگوهای خارجی')
  if (input.hearing) parts.push('ویژهٔ ناشنوایان')
  return parts.join(' · ')
}

/** Found subtitles in the order of the language list (unknown last), keeping the order they were found in. */
export function sortFound<T extends { language: string; id: number }>(rows: T[]): T[] {
  const codes = Object.keys(TRACK_LANGUAGES)
  const place = (code: string) => { const at = codes.indexOf(code); return at < 0 ? codes.length : at }
  return [...rows].sort((a, b) => place(a.language) - place(b.language) || a.id - b.id)
}

/** What the last look at a video file found, kept on the link so one address is looked at once. */
export type SubtitleScan = { key: string; status: 'done' | 'failed'; found: number; notes: string[]; at: string }
export function readScan(raw: string): SubtitleScan | null {
  try {
    const value = JSON.parse(raw || 'null') as Partial<SubtitleScan> | null
    return value && typeof value.key === 'string' && (value.status === 'done' || value.status === 'failed') ? { key: value.key, status: value.status, found: Number(value.found) || 0, notes: Array.isArray(value.notes) ? value.notes.map(String).slice(0, 6) : [], at: String(value.at || '') } : null
  } catch { return null }
}
