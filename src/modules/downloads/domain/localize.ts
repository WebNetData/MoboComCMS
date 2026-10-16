/**
 * Content copied from another site: find the images and files it points to
 * on other hosts, so they can be copied to this server and the content
 * rewritten to the local copies. Pure functions only.
 */

export type Asset = { url: string; kind: 'image' | 'file' }

/** Link targets that are files worth copying (not web pages). */
export const FILE_EXT = /\.(zip|rar|7z|tar|gz|tgz|apk|xapk|ipa|exe|msi|dmg|iso|pdf|docx?|xlsx?|pptx?|epub|mp3|m4a|aac|flac|wav|ogg|mp4|m4v|mkv|webm|avi|mov|srt|vtt|ass|torrent)$/i

const unescapeAttr = (value: string) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()

function isExternal(raw: string, siteHost: string): boolean {
  if (raw.startsWith('data:image/')) return true
  let url: URL
  try { url = new URL(raw) } catch { return false }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  const host = url.hostname.toLowerCase()
  const site = siteHost.toLowerCase().replace(/^www\./, '')
  return !(site && (host === site || host.endsWith(`.${site}`)))
}

/** External images (<img src>, data: images) and file links (<a href="…zip">) in an HTML fragment. */
export function findAssets(html: string, siteHost: string): Asset[] {
  const found = new Map<string, Asset>()
  for (const match of html.matchAll(/<img\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const url = unescapeAttr(match[2] ?? match[3] ?? '')
    if (url && isExternal(url, siteHost)) found.set(url, { url, kind: 'image' })
  }
  for (const match of html.matchAll(/<(video|audio|source)\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const url = unescapeAttr(match[3] ?? match[4] ?? '')
    if (url && isExternal(url, siteHost) && !url.startsWith('data:')) found.set(url, { url, kind: 'file' })
  }
  for (const match of html.matchAll(/<video\b[^>]*?\sposter\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const url = unescapeAttr(match[2] ?? match[3] ?? '')
    if (url && isExternal(url, siteHost)) found.set(url, { url, kind: 'image' })
  }
  for (const match of html.matchAll(/<a\b[^>]*?\shref\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const url = unescapeAttr(match[2] ?? match[3] ?? '')
    if (!url || !isExternal(url, siteHost) || url.startsWith('data:')) continue
    let path = ''
    try { path = decodeURIComponent(new URL(url).pathname) } catch { path = url }
    if (FILE_EXT.test(path) && !found.has(url)) found.set(url, { url, kind: 'file' })
  }
  return [...found.values()].slice(0, 100)
}

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/**
 * Replaces every copied address with its local one (in src/href, as written
 * or HTML-escaped). srcset lists that still point elsewhere are dropped, so
 * browsers do not fetch the original images anyway.
 */
export function rewriteAssets(html: string, replacements: Map<string, string>): string {
  let out = html
  for (const [from, to] of replacements) {
    for (const form of new Set([from, escapeAttr(from), from.replace(/&/g, '&amp;')])) out = out.split(form).join(escapeAttr(to))
  }
  if (replacements.size) out = out.replace(/\s(srcset|data-srcset|data-src)\s*=\s*("[^"]*"|'[^']*')/gi, (full, _name, value: string) => (/https?:\/\//i.test(value) ? '' : full))
  return out
}
