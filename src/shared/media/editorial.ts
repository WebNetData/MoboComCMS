
// Decode shortcode attributes before serialization, independently of a browser or an editing engine.
const decodeEntities = (text: string) => text.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (whole, code: string) => {
  if (code[0] !== '#') return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' } as Record<string, string>)[code.toLowerCase()] || whole
  const point = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : Number(code.slice(1))
  return Number.isInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole
})

export const MEDIA_FRAME_ORIGINS = ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://www.aparat.com', 'https://player.vimeo.com', 'https://www.namasha.com', 'https://tamasha.com'] as const
export type EmbedValue = { provider: string; url: string }
export type EditorialMedia = { kind: 'video' | 'audio' | 'embed'; src: string; title: string; caption: string; poster: string; audioKind: 'music' | 'podcast' | 'voice'; ratio: '16:9' | '4:3' | '1:1' | '9:16' }

export function safeMediaSrc(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return ''
  if (raw.length > 2048 || /[\u0000-\u001f\u007f\s"'<>]/.test(raw)) return null
  if (raw.startsWith('/')) return raw.startsWith('//') || raw.includes('\\') || raw.includes('..') ? null : raw
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null } catch { return null }
}

/** Canonical, exact-host player addresses; never trust a pasted iframe or provider name. */
export function embedOf(value: unknown): EmbedValue | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  let url: URL
  try { url = new URL(value.trim()) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const host = url.hostname.replace(/^(?:www|m)\./, ''), path = url.pathname
  const id = (pattern: RegExp) => pattern.exec(path)?.[1] || ''
  if (host === 'youtu.be') { const v = id(/^\/([\w-]{6,20})\/?$/); return v ? { provider: 'youtube', url: `https://www.youtube-nocookie.com/embed/${v}` } : null }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = path === '/watch' ? url.searchParams.get('v') || '' : id(/^\/(?:shorts|embed|live)\/([\w-]+)\/?$/)
    return /^[\w-]{6,20}$/.test(v) ? { provider: 'youtube', url: `https://www.youtube-nocookie.com/embed/${v}` } : null
  }
  if (host === 'aparat.com') { const v = id(/^\/v\/([\w-]{3,40})(?:\/[^/]*)?\/?$/) || id(/^\/video\/video\/embed\/videohash\/([\w-]{3,40})\/vt\/frame\/?$/); return v ? { provider: 'aparat', url: `https://www.aparat.com/video/video/embed/videohash/${v}/vt/frame` } : null }
  if (host === 'namasha.com') { const v = id(/^\/(?:v|embed)\/([\w-]{3,40})(?:\/[^/]*)?\/?$/); return v ? { provider: 'namasha', url: `https://www.namasha.com/embed/${v}` } : null }
  if (host === 'tamasha.com') { const v = id(/^\/(?:v|embed)\/([\w-]{3,40})(?:\/[^/]*)?\/?$/); return v ? { provider: 'tamasha', url: `https://tamasha.com/embed/${v}` } : null }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') { const v = id(/^\/(?:video\/)?(\d{4,12})\/?$/); return v ? { provider: 'vimeo', url: `https://player.vimeo.com/video/${v}` } : null }
  return null
}

export const playableFile = (src: string, kind: 'video' | 'audio') => (kind === 'video' ? /\.(mp4|webm|m4v|mov)$/i : /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i).test(src.split(/[?#]/)[0]) || /^\/api\/media\/transfers\/[a-f0-9-]+$/i.test(src)
const cleanText = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : ''
export function editorialMedia(value: unknown): EditorialMedia | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const p = value as Record<string, unknown>, src = safeMediaSrc(p.src), embed = embedOf(p.src)
  if (!src || !['video', 'audio', 'embed'].includes(String(p.kind))) return null
  const kind = p.kind === 'video' && embed ? 'embed' : p.kind as EditorialMedia['kind']
  if (kind === 'embed' ? !embed : !playableFile(src, kind)) return null
  const poster = safeMediaSrc(p.poster)
  if (poster === null) return null
  return { kind, src: kind === 'embed' ? embed!.url : src, title: cleanText(p.title, 200), caption: cleanText(p.caption, 500), poster, audioKind: p.audioKind === 'podcast' || p.audioKind === 'voice' ? p.audioKind : 'music', ratio: ['4:3', '1:1', '9:16'].includes(String(p.ratio)) ? p.ratio as EditorialMedia['ratio'] : '16:9' }
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
/** Native, no-JS fallback remains playable. The shared content mount enhances only its own slot. */
export function editorialMediaHtml(value: unknown): string {
  const p = editorialMedia(value)
  if (!p) return ''
  const title = escape(p.title || (p.kind === 'audio' ? 'فایل صوتی' : 'ویدیو')), src = escape(p.src)
  const fallback = p.kind === 'embed' ? `<a class="mc-media-external" href="${src}" target="_blank" rel="noopener noreferrer">${title} — نمایش در سرویس ویدیو ↗</a>` : `<${p.kind} src="${src}" controls preload="none"${p.kind === 'video' ? ` playsinline${p.poster ? ` poster="${escape(p.poster)}"` : ''}` : ''} aria-label="${title}"></${p.kind}>`
  return `<figure class="mc-media" data-mc-media="${p.kind}" data-mc-src="${src}" data-mc-title="${escape(p.title)}" data-mc-poster="${escape(p.poster)}" data-mc-audio-kind="${p.audioKind}" data-mc-ratio="${p.ratio}"><div class="mc-media-slot" data-mc-player="">${fallback}</div>${p.caption ? `<figcaption>${escape(p.caption)}</figcaption>` : ''}</figure>`
}

export function mediaShortcode(value: unknown): string {
  const p = editorialMedia(value)
  const attr = (text: string) => escape(text).replace(/\[/g, '&#91;').replace(/\]/g, '&#93;')
  return p ? `[${p.kind === 'audio' ? 'audio' : 'video'} src="${attr(p.src)}" title="${attr(p.title)}" caption="${attr(p.caption)}" poster="${attr(p.poster)}" kind="${p.audioKind}" ratio="${p.ratio}"]` : ''
}

export function mediaShortcodes(html: string): string {
  if (!/\[(?:video|audio|podcast)\s/.test(html)) return html
  const pattern = /\[(video|audio|podcast)\s+([^\]\r\n]{1,6000})\]/g
  const swap = (whole: string, type: string, attrs: string) => {
    const pairs: Record<string, string> = {}
    for (const found of attrs.matchAll(/(src|title|caption|poster|kind|ratio)="([^"]*)"/g)) pairs[found[1]] = decodeEntities(found[2])
    const p = editorialMedia({ ...pairs, kind: type === 'video' ? 'video' : 'audio', audioKind: type === 'podcast' ? 'podcast' : pairs.kind })
    return p ? editorialMediaHtml(p) : whole
  }
  const alone = new RegExp(`<p\\b[^>]*>\\s*${pattern.source}\\s*</p>`, 'g')
  return html.split(/(<(?:pre|code)\b[\s\S]*?<\/(?:pre|code)>)/i).map((part, index) => index % 2 ? part : part.replace(alone, swap).replace(pattern, swap)).join('')
}
