/**
 * Source-trace scrubbing for copied content: the names of the sites the files,
 * images and text came from are removed from saved text, links to them are
 * unwrapped, and downloaded files get this site's own name instead of the
 * source file name. Pure functions only; server/scrub.ts applies them.
 */

export type LinkMode = 'off' | 'listed' | 'all'

export interface ScrubOptions {
  /** Source site names and domains to remove ("Musicfa", "musicfa.ir"). */
  words: readonly string[]
  /** Which links in rich text lose their <a>: none, links to a listed source, or every link to another site. */
  links: LinkMode
  /** This site's host; its own links are always kept. */
  siteHost: string
}

/** Admin input (text area or array) → a clean, de-duplicated word list. */
export function normalizeWords(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? '').split(/[\n,،]+/)
  const out: string[] = []
  for (const item of raw) {
    const word = item.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').slice(0, 60)
    if (word.length >= 3 && !out.some((kept) => kept.toLowerCase() === word.toLowerCase())) out.push(word)
  }
  return out.slice(0, 100)
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One word as a pattern: letters of a Latin word may be separated by nothing, "-" or "_" in either case. */
function wordPattern(word: string): string {
  return escape(word).replace(/\\\./g, '[.\\s_-]?')
}

function wordsRegex(words: readonly string[]): RegExp | null {
  if (!words.length) return null
  // A domain also matches its distinctive name alone ("film2media.ir" → "Film2Media").
  const bare = words.filter((word) => word.includes('.')).map((word) => word.split('.')[0]).filter((name) => name.length >= 6)
  const sorted = [...new Set([...words, ...bare])].sort((a, b) => b.length - a.length).map(wordPattern)
  return new RegExp(sorted.join('|'), 'giu')
}

/** Whether a host belongs to a listed source ("dl.musicfa.ir" matches "musicfa.ir" and "musicfa"). */
export function hostListed(hostname: string, words: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '')
  return words.some((raw) => {
    const word = raw.toLowerCase()
    if (word.includes('.')) return host === word || host.endsWith(`.${word}`)
    return /^[a-z0-9-]+$/.test(word) && host.split('.').some((label) => label === word)
  })
}

// "دانلود از سایت X" / "منبع: X" / "کانال X" — the lead-in goes with the name.
const LEAD_IN = '(?:(?:به\\s+)?(?:نقل\\s+)?(?:از|منبع|منبع\\s*:|کپی\\s+از|دانلود\\s+از|اختصاصی|ارائه\\s+شده\\s+(?:در|توسط))\\s*)?(?:(?:سایت|وب\\s?سایت|وب‌سایت|کانال|پیج|تیم|گروه)\\s+)?'

/** Removes source names (and URLs on listed hosts) from plain text; tidies the gaps left behind. */
export function scrubText(text: string, words: readonly string[]): string {
  const names = wordsRegex(words)
  if (!names || !text) return text
  let out = text.replace(/\bhttps?:\/\/[^\s<>"')\]]+/gi, (url) => {
    try { return hostListed(new URL(url).hostname, words) ? '' : url } catch { return url }
  })
  out = out.replace(new RegExp(`${LEAD_IN}(?:@|www\\.)?(?:${names.source})(?:\\.(?:com|ir|net|org|co|info|me|xyz|top|site|online))?`, 'giu'), '')
  if (out === text) return text
  // Keep the whitespace at the edges: in rich text it separates this run from the next tag.
  const lead = /^\s*/.exec(text)?.[0] || ''
  const trail = /\s*$/.exec(text)?.[0] || ''
  const tidy = out
    .replace(/[([{«]\s*[-–|:]?\s*[)\]}»]/g, '')
    .replace(/([([{«])\s+/g, '$1').replace(/\s+([)\]}»])/g, '$1')
    .replace(/[ \t]*[-–|:،,]\s*(?=$|\n)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  return tidy ? `${lead}${tidy}${trail}` : ''
}

const hostOf = (href: string, base: string) => { try { return new URL(href, base).hostname.toLowerCase() } catch { return '' } }
const externalHost = (host: string, siteHost: string) => {
  const site = siteHost.toLowerCase().replace(/^www\./, '')
  return !!host && !(site && (host === site || host.endsWith(`.${site}`)))
}
const attr = (tag: string, name: string) => {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return match ? (match[2] ?? match[3] ?? match[4] ?? '').replace(/&amp;/g, '&') : ''
}

/**
 * Rich text (or plain text — it has no tags) cleaned of its sources:
 * links to them lose their <a> (the words stay), images still served from a
 * listed source are dropped, and names are removed from text and alt/title.
 */
export function scrubHtml(html: string, options: ScrubOptions): string {
  if (!html) return html
  const base = `https://${options.siteHost || 'localhost'}/`
  const unwrap = (href: string) => {
    if (options.links === 'off' || !/^(https?:)?\/\//i.test(href.trim())) return false
    const host = hostOf(href, base)
    if (!externalHost(host, options.siteHost)) return false
    return options.links === 'all' || hostListed(host, options.words)
  }
  // Anchors: drop the tag pair, keep what is inside.
  let out = html.replace(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi, (whole, inner: string) => (unwrap(attr(whole, 'href')) ? inner : whole))
  // Images and embeds still pointing at a listed source.
  out = out.replace(/<(img|source|iframe)\b[^>]*>(?:\s*<\/iframe>)?/gi, (tag) => {
    const src = attr(tag, 'src')
    return src && /^(https?:)?\/\//i.test(src) && hostListed(hostOf(src, base), options.words) ? '' : tag
  })
  if (!options.words.length) return out
  // Text between tags, and the human-readable attributes.
  out = out.split(/(<[^>]*>)/).map((part) => {
    if (!part.startsWith('<')) return scrubText(part, options.words)
    return part.replace(/(\s(?:alt|title)\s*=\s*)("([^"]*)"|'([^']*)')/gi, (_m, lead: string, _q, dq?: string, sq?: string) => {
      const value = scrubText(dq ?? sq ?? '', options.words).replace(/"/g, '&quot;')
      return `${lead}"${value}"`
    })
  }).join('')
  // Blocks emptied by the removal.
  return out.replace(/<(p|li|h[1-6]|span|strong|b|em|figcaption)\b[^>]*>\s*(?:&nbsp;|<br\s*\/?>|\s)*<\/\1>/gi, '')
}

/** Whether an HTML fragment still has listed-source traces (for the preview count). */
export function hasTraces(text: string, words: readonly string[]): boolean {
  const names = wordsRegex(words)
  return !!names && !!text && names.test(text)
}

// ------------------------------------------------------------------ file names

const STREAM_PARTS = /^(m3u8|ts|m4s|mpd|key)$/i
const unsafe = /[\u0000-\u001f\u007f/\\?#%"<>|*:]/g

export interface NameInput {
  /** "{title} - {label} [{site}]"; empty keeps the source name with the listed words removed. */
  pattern: string
  original: string
  title?: string
  label?: string
  quality?: string
  site?: string
  words: readonly string[]
}

/** The name a visitor saves a file under. Streaming playlists keep theirs (their segments are relative to it). */
export function downloadFileName(input: NameInput): string {
  const dot = input.original.lastIndexOf('.')
  const ext = dot > 0 ? input.original.slice(dot + 1) : ''
  const validExt = /^[a-z0-9]{1,5}$/i.test(ext)
  if (validExt && STREAM_PARTS.test(ext)) return input.original
  const stem = validExt ? input.original.slice(0, dot) : input.original
  let base: string
  if (input.pattern.trim()) {
    const values: Record<string, string> = { title: input.title || '', label: input.label || '', quality: input.quality || '', site: input.site || '', name: stem }
    base = input.pattern.replace(/\{(title|label|quality|site|name)\}/g, (_m, key: string) => values[key])
    base = scrubText(base, input.words)
  } else {
    base = scrubText(stem.replace(/[._]+/g, (sep) => (sep === '.' ? '.' : ' ')), input.words)
  }
  base = base.replace(unsafe, ' ')
    .replace(/[([{]\s*[)\]}]/g, '')
    .replace(/\s*[-–|]\s*(?=[-–|]|$)/g, '')
    .replace(/^[\s\-–|.]+|[\s\-–|.]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 150)
    .trim()
  if (!base) base = scrubText(stem, input.words).replace(unsafe, ' ').trim() || 'file'
  return validExt ? `${base}.${ext}` : base
}
