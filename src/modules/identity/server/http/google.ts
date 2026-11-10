import { NextResponse, type NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { requireUser } from '@/modules/identity/server/access'
import { siteBaseUrl } from '@/modules/site/server/site-url'
import { RevisionError } from '@/modules/content/server/revisions'
import { GOOGLE_FLOW_COOKIE, GOOGLE_FLOW_TTL_MS, type GoogleIntent, type GoogleLoginError } from '@/modules/identity/domain/google-login'
import { GoogleLoginFailure, disconnectGoogle, finishGoogleSignIn, googleConnection, googleLoginAvailable, startGoogleSignIn } from '@/modules/identity/server/google-login'

// Google sign-in routes (src/modules/identity/server/google-login.ts):
//   GET    /api/login/google            → Google's account chooser (?intent=link from account settings)
//   GET    /api/login/google/callback   → back from Google: a one-time ticket, a connection, or the reason it failed
//   GET    /api/me/google               → the member's connection
//   DELETE /api/me/google               → disconnects it, when another way in remains

const COOKIE_PATH = '/api/login/google'
const PROFILE = '/dashboard/profile'

async function to(path: string) {
  const response = NextResponse.redirect(new URL(path, await siteBaseUrl()), 303)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

/** Back to where the member started, with the reason in the address; the started flow is forgotten. */
async function back(intent: GoogleIntent, code: GoogleLoginError) {
  const response = await to(intent === 'link' ? `${PROFILE}?google=${code}` : `/login?google=${code}`)
  response.cookies.set(GOOGLE_FLOW_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: COOKIE_PATH, maxAge: 0 })
  return response
}

export async function GET_start(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const intent: GoogleIntent = params.get('intent') === 'link' ? 'link' : 'login'
  if (!(await rateLimitStrict(`login:google:start:${clientIp(req.headers)}`, 30, 10 * 60_000)).ok) return back(intent, 'unreachable')
  let userId: number | undefined
  if (intent === 'link') {
    // Connecting starts only from this site's own pages, by the member who is signed in.
    const site = req.headers.get('sec-fetch-site')
    if (site && site !== 'same-origin' && site !== 'none') return back(intent, 'not-allowed')
    const user = await requireUser(req)
    if (!user) return to(`/login?next=${encodeURIComponent(PROFILE)}`)
    userId = user.id
  }
  try {
    const { url, state } = await startGoogleSignIn({ intent, next: params.get('next'), userId, locale: req.cookies.get('locale')?.value === 'en' ? 'en' : 'fa' })
    const response = NextResponse.redirect(url, 303)
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    // The state lives in this browser too: a return from Google into another browser is refused.
    response.cookies.set(GOOGLE_FLOW_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: COOKIE_PATH, maxAge: GOOGLE_FLOW_TTL_MS / 1000 })
    return response
  } catch (error) {
    if (error instanceof GoogleLoginFailure) return back(intent, error.code)
    throw error
  }
}

export async function GET_callback(req: NextRequest) {
  const params = req.nextUrl.searchParams
  if (!(await rateLimitStrict(`login:google:callback:${clientIp(req.headers)}`, 30, 10 * 60_000)).ok) return back('login', 'unreachable')
  try {
    // Who is signed in now: a connection belongs only to the member who started it (see finishGoogleSignIn).
    const current = await requireUser(req).catch(() => null)
    const outcome = await finishGoogleSignIn({ code: params.get('code'), state: params.get('state'), browserState: req.cookies.get(GOOGLE_FLOW_COOKIE)?.value, error: params.get('error'), currentUserId: current?.id ?? null })
    // The ticket rides in the fragment, which never reaches a server, a log or a referrer.
    const response = outcome.kind === 'linked'
      ? await to(`${PROFILE}?google=linked`)
      : await to(`/login/google#${new URLSearchParams({ ticket: outcome.ticket, next: outcome.next }).toString()}`)
    response.cookies.set(GOOGLE_FLOW_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: COOKIE_PATH, maxAge: 0 })
    return response
  } catch (error) {
    if (error instanceof GoogleLoginFailure) return back((error as GoogleLoginFailure & { intent?: GoogleIntent }).intent || 'login', error.code)
    console.error('[google-login]', error)
    return back('login', 'failed')
  }
}

export async function GET_me(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const [connection, available] = await Promise.all([googleConnection(user.id), googleLoginAvailable().catch(() => false)])
  const response = ok({ available, ...(connection || { linked: false, email: '', linkedAt: null, canDisconnect: false }) })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export async function DELETE_me(req: NextRequest) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  try {
    await disconnectGoogle(user.id)
  } catch (error) {
    if (error instanceof RevisionError) return err(error.message, error.status)
    throw error
  }
  return ok({ linked: false })
}
