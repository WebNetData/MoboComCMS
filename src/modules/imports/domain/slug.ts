import { latinSlug } from '@/modules/imports/domain/values'

/** A permalink is an address, not a slug: never flatten its host/query into the local URL. */
export function importedSlug(value: unknown, remove: string[] = []): string {
  let text = String(value ?? '').trim()
  const branding = [...remove]
  if (/^(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?$/i.test(text)) return ''
  if (/^(?:https?:)?\/\//i.test(text) || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(text)) {
    try { const url = new URL(text.startsWith('//') ? 'https:' + text : /^https?:/i.test(text) ? text : 'https://' + text); branding.push(url.hostname.replace(/^www\./, ''), url.hostname.replace(/^www\./, '').split('.')[0]); text = url.pathname } catch { return '' }
  }
  text = text.split(/[?#]/)[0].split('/').filter(Boolean).at(-1) || ''
  try { text = decodeURIComponent(text) } catch { /* keep safe undecoded text */ }
  text = text.replace(/\.(?:html?|php|aspx?)$/i, '')
  let slug = latinSlug(text, 500)
  for (const brand of branding) {
    const part = latinSlug(brand, 100)
    if (!part) continue
    // Remove complete branding phrases, never substrings such as 'art' in 'cart'.
    slug = ('-' + slug + '-').split('-' + part + '-').join('-').replace(/^-+|-+$/g, '')
  }
  return slug.slice(0, 100).replace(/-+$/g, '')
}
