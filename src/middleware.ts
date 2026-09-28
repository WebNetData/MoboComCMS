import { NextRequest, NextResponse } from 'next/server'
import { routeDecision } from '@/platform/routing/aliases'
import { loadRouteAliases } from '@/modules/site/server/routes'

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// Server-to-server callbacks authenticate with signatures/secrets and send no
// Origin header; NextAuth ships its own CSRF token flow.
const ORIGIN_EXEMPT = /^\/api\/(auth\/|payment\/|telegram\/|internal\/)/

function sameSiteOrigin(req: NextRequest, origin: string): boolean {
  try {
    const host = new URL(origin).host
    // Next may normalize nextUrl to localhost even when the browser used 127.0.0.1.
    // Compare with the actual request Host, never an untrusted forwarded host.
    if (host === (req.headers.get('host') || req.nextUrl.host)) return true
    const configured = process.env.NEXTAUTH_URL
    return Boolean(configured && host === new URL(configured).host)
  } catch {
    return false
  }
}

const VIDEO_FRAME_HOSTS = 'https://www.youtube-nocookie.com https://www.youtube.com https://www.aparat.com https://player.vimeo.com'
// Google Translate website widget (google-translate plugin), public pages only.
const TRANSLATE_SCRIPT = ' https://translate.google.com https://translate.googleapis.com https://translate-pa.googleapis.com https://www.gstatic.com'
const TRANSLATE_CONNECT = ' https://translate.googleapis.com https://translate-pa.googleapis.com'

function applySecurityHeaders(req: NextRequest, response: NextResponse) {
  const path = req.nextUrl.pathname
  // The Telegram mini app must stay embeddable in the Telegram webview.
  const miniApp = path.startsWith('/miniapp')
  const turnstile = path === '/login' || path === '/register' || path === '/forgot-password'
  const translate = !miniApp && !path.startsWith('/admin') && !path.startsWith('/api')

  response.headers.set('x-content-type-options', 'nosniff')
  // The reset link carries its token in the URL; never leak it to other sites.
  response.headers.set('referrer-policy', path === '/reset-password' ? 'no-referrer' : 'strict-origin-when-cross-origin')
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(self)')
  if (!miniApp) response.headers.set('x-frame-options', 'SAMEORIGIN')

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}${miniApp || path === '/login' ? ' https://telegram.org' : ''}${turnstile ? ' https://challenges.cloudflare.com' : ''}${translate ? TRANSLATE_SCRIPT : ''}`,
    `style-src 'self' 'unsafe-inline'${translate ? ' https://www.gstatic.com' : ''}`,
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    // Music player and trailers stream from media hosts (after the protected /api/media redirect).
    "media-src 'self' https: blob:",
    `connect-src 'self'${turnstile ? ' https://challenges.cloudflare.com' : ''}${path === '/login' ? ' https://oauth.telegram.org https://telegram.org' : ''}${translate ? TRANSLATE_CONNECT : ''}`,
    // Page-builder video blocks embed these players; login/register add their own providers.
    `frame-src 'self' ${VIDEO_FRAME_HOSTS}${turnstile ? ' https://challenges.cloudflare.com' : ''}${path === '/login' ? ' https://oauth.telegram.org https://telegram.org' : ''}${translate ? ' https://translate.google.com' : ''}`,
    miniApp ? "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org" : "frame-ancestors 'self'",
    "base-uri 'self'",
    // The Mellat start page posts the payment reference to the bank.
    `form-action 'self'${path === '/api/payment/mellat/start' ? ' https://bpm.shaparak.ir' : ''}`,
  ].join('; ')
  response.headers.set('content-security-policy', csp)

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('strict-transport-security', 'max-age=15552000; includeSubDomains')
  }
}

const NOT_ALIASED = /^\/(api|admin|_next)(\/|$)/

export async function middleware(req: NextRequest) {
  const incoming = req.headers.get('x-request-id')?.trim() || ''
  const requestId = REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID()
  const headers = new Headers(req.headers)
  headers.set('x-request-id', requestId)

  // CSRF/Origin guard: state-changing API calls must originate from this site.
  if (
    MUTATING_METHODS.has(req.method) &&
    req.nextUrl.pathname.startsWith('/api/') &&
    !ORIGIN_EXEMPT.test(req.nextUrl.pathname)
  ) {
    const origin = req.headers.get('origin')
    if (origin && !sameSiteOrigin(req, origin)) {
      return NextResponse.json({ error: 'forbidden origin' }, { status: 403 })
    }
  }

  // Section addresses chosen by the site owner (/game for /games, /discourse for /forum …).
  let response: NextResponse | null = null
  if ((req.method === 'GET' || req.method === 'HEAD') && !NOT_ALIASED.test(req.nextUrl.pathname)) {
    const decision = routeDecision(req.nextUrl.pathname, await loadRouteAliases().catch(() => ({})))
    if (decision) {
      const url = req.nextUrl.clone()
      url.pathname = decision.path
      response = decision.kind === 'redirect' ? NextResponse.redirect(url, 308) : NextResponse.rewrite(url, { request: { headers } })
    }
  }
  response ||= NextResponse.next({ request: { headers } })
  response.headers.set('x-request-id', requestId)
  applySecurityHeaders(req, response)
  return response
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
}
