/**
 * The Content-Security-Policy of a response.
 *
 * Scripts run by nonce: every HTML response names one random value, Next puts it on the scripts it
 * writes, and the browser runs only those and what they load in turn ('strict-dynamic'). A piece of
 * markup that reaches a page some other way (a comment, a profile field, an imported description)
 * carries no nonce and does not run, whatever it contains; inline event handlers never run.
 *
 * `'unsafe-inline'`, `'self'` and the host names stay in `script-src` for browsers that do not know
 * nonces or 'strict-dynamic': a browser that knows them ignores those words, so they loosen nothing
 * there. Styles keep `'unsafe-inline'`: React writes `style` attributes, and a style cannot run code.
 */

// Kept equal to the pure editor codec's player origins by an executed contract test.
const VIDEO_FRAME_HOSTS = 'https://www.youtube-nocookie.com https://www.youtube.com https://www.aparat.com https://player.vimeo.com https://www.namasha.com https://tamasha.com'
// Google Translate website widget (google-translate plugin), public pages only.
const TRANSLATE_SCRIPT = ' https://translate.google.com https://translate.googleapis.com https://translate-pa.googleapis.com https://www.gstatic.com'
const TRANSLATE_CONNECT = ' https://translate.googleapis.com https://translate-pa.googleapis.com'

/**
 * 16 random bytes in URL-safe base64 without padding: 22 characters that HTML, JSON and a header all
 * write the same way, so the page cache can find one in a stored page and put another in its place.
 */
export function newNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const NONCE = /^[A-Za-z0-9_-]{22}$/
export const isNonce = (value: unknown): value is string => typeof value === 'string' && NONCE.test(value)

/** The nonce a policy names in its script-src, if any. */
export function nonceOf(policy: string | null | undefined): string | null {
  const scripts = String(policy || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('script-src '))
  const found = scripts?.match(/'nonce-([^']+)'/)?.[1]
  return isNonce(found) ? found : null
}

/**
 * Which pages run scripts by nonce. The forwarder's countdown page shows the ad-network code the
 * admin pasted; that code writes inline scripts of its own, so that one page keeps the older policy.
 */
export const usesNonce = (path: string) => !(path === '/forwarder' || path.startsWith('/forwarder/'))

export function contentSecurityPolicy(input: { path: string; nonce: string | null; production: boolean }): string {
  const { path, production } = input
  // The Telegram mini app must stay embeddable in the Telegram webview.
  const miniApp = path.startsWith('/miniapp')
  const turnstile = path === '/login' || path === '/register' || path === '/forgot-password'
  const translate = !miniApp && !path.startsWith('/admin') && !path.startsWith('/api')
  const companyMap = path.startsWith('/p/') || path === '/admin/studio'
  // The forwarder's countdown page shows the admin's ad-network code (sandboxed frames inherit this policy).
  const ads = !usesNonce(path)
  const nonce = !ads && isNonce(input.nonce) ? input.nonce : null
  const scriptHosts = `${miniApp || path === '/login' ? ' https://telegram.org' : ''}${turnstile ? ' https://challenges.cloudflare.com' : ''}${translate ? TRANSLATE_SCRIPT : ''}${ads ? ' https:' : ''}`
  return [
    "default-src 'self'",
    `script-src 'self'${nonce ? ` 'nonce-${nonce}' 'strict-dynamic'` : ''} 'unsafe-inline'${production ? '' : " 'unsafe-eval'"}${scriptHosts}`,
    // Inline handlers (onclick=…) are markup, not scripts with a nonce: they never run on a nonce page.
    ...(nonce ? ["script-src-attr 'none'"] : []),
    `style-src 'self' 'unsafe-inline'${translate ? ' https://www.gstatic.com' : ''}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Music player and trailers stream from media hosts (after the protected /api/media redirect).
    "media-src 'self' https: blob:",
    `connect-src 'self'${path.startsWith('/watch/') || ads ? ' https:' : ''}${turnstile ? ' https://challenges.cloudflare.com' : ''}${path === '/login' ? ' https://oauth.telegram.org https://telegram.org' : ''}${translate ? TRANSLATE_CONNECT : ''}`,
    // Page-builder video blocks embed these players; login/register add their own providers.
    `frame-src 'self' ${ads ? 'https:' : VIDEO_FRAME_HOSTS}${companyMap ? ' https://www.openstreetmap.org' : ''}${turnstile ? ' https://challenges.cloudflare.com' : ''}${path === '/login' ? ' https://oauth.telegram.org https://telegram.org' : ''}${translate ? ' https://translate.google.com' : ''}`,
    miniApp ? "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org" : "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // The Mellat start page posts the payment reference to the bank.
    `form-action 'self'${path === '/api/payment/mellat/start' ? ' https://bpm.shaparak.ir' : ''}`,
  ].join('; ')
}
