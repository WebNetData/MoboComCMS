// The page translated by the Google Translate widget (plugin `google-translate`), read from its own `googtrans`
// cookie (`/fa/<target>`). Pure: the root layout reads it on the server, the plugin in the browser.

/** Languages written right to left among those the widget offers (and their relatives). */
const RTL_TARGETS = new Set(['fa', 'ar', 'he', 'iw', 'ur', 'ps', 'sd', 'ckb', 'ug', 'yi', 'dv'])
const TARGET = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/

/** The language the page is translated into, or '' while it reads in its own language. */
export function translationTarget(cookie: string | undefined | null): string {
  let value = String(cookie || '')
  try { value = decodeURIComponent(value) } catch { return '' }
  const target = /^\/[^/]+\/([^/]+)$/.exec(value)?.[1] || ''
  return TARGET.test(target) && target !== 'fa' ? target : ''
}

export const isRtlLanguage = (code: string) => RTL_TARGETS.has(code.split('-')[0].toLowerCase())

/** The page's direction while translated: a left-to-right language turns the whole site left to right. */
export function translatedDirection(cookie: string | undefined | null): 'ltr' | 'rtl' | null {
  const target = translationTarget(cookie)
  return target ? (isRtlLanguage(target) ? 'rtl' : 'ltr') : null
}
