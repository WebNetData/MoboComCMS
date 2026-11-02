import { NextRequest, NextResponse } from 'next/server'
import { routeDecision } from '@/platform/routing/aliases'
import { loadRouteAliases } from '@/modules/site/server/routes'
import { pageCacheHandle, purgeSoon } from '@/modules/performance/server/pagecache'
import { installGate } from '@/modules/installer/server/gate'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { contentSecurityPolicy, newNonce, nonceOf, usesNonce } from '@/platform/http/csp'
import { requireUser } from '@/modules/identity/server/access'
import { loadMaintenance, maintenanceBases } from '@/modules/site/server/maintenance'
import { maintenanceDecision, openDuringSiteMaintenance, runsSection, sectionOfPath } from '@/modules/site/domain/maintenance'
import { loadSectionAccess, sectionLock } from '@/modules/account/server/section-access'
import { opensDuringMaintenance } from '@/modules/account/server/maintenance-access'
import { sectionLoginPath, sectionOfApi } from '@/modules/account/domain/section-access'

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// Server-to-server callbacks authenticate with signatures/secrets (a bank also sends the
// payer's browser back with a cross-site POST); NextAuth ships its own CSRF token flow.
const ORIGIN_EXEMPT = /^\/api\/(auth\/|payment\/|telegram\/|internal\/|feeds\/|newsletter\/unsubscribe)/

/** The hosts this site answers on. */
function ownHosts(req: NextRequest): Array<string | null> {
  let configured: string | null = null
  try { configured = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : null } catch { configured = null }
  // Next may normalize nextUrl to localhost even when the browser used 127.0.0.1.
  // Compare with the actual request Host, never an untrusted forwarded host.
  return [req.headers.get('host') || req.nextUrl.host, configured]
}

/** The headers every response carries. `nonce` is the one the scripts of this response's body carry. */
function applySecurityHeaders(req: NextRequest, response: NextResponse, nonce: string | null) {
  const path = req.nextUrl.pathname
  response.headers.set('x-content-type-options', 'nosniff')
  // The reset link carries its token in the URL; never leak it to other sites.
  response.headers.set('referrer-policy', path === '/reset-password' ? 'no-referrer' : 'strict-origin-when-cross-origin')
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(self)')
  // Private areas stay out of search results even when a link to them is found elsewhere.
  if (/^\/(admin|dashboard)(\/|$)/.test(path)) response.headers.set('x-robots-tag', 'noindex, nofollow')
  // The Telegram mini app must stay embeddable in the Telegram webview.
  if (!path.startsWith('/miniapp')) response.headers.set('x-frame-options', 'SAMEORIGIN')
  response.headers.set('content-security-policy', contentSecurityPolicy({ path, nonce, production: process.env.NODE_ENV === 'production' }))

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('strict-transport-security', 'max-age=15552000; includeSubDomains')
  }
}

const NOT_ALIASED = /^\/(api|admin|_next|dl|files)(\/|$)/
// Writes by admins can change public pages; these never do.
const ADMIN_WRITE = /^\/api\/admin\//
const ADMIN_WRITE_SKIP = /^\/api\/admin\/(optimization|performance|monitoring|chat|crm|crm-notes|audit|analytics|backups|incidents|extensions\/state)(\/|$)/

export async function proxy(req: NextRequest) {
  const incoming = req.headers.get('x-request-id')?.trim() || ''
  const requestId = REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID()
  const headers = new Headers(req.headers)
  headers.set('x-request-id', requestId)
  // One nonce per response. Next reads it from the policy on the request and puts it on the scripts it writes;
  // the layout reads x-nonce for its own. A value sent by the visitor is never used.
  const nonce = usesNonce(req.nextUrl.pathname) ? newNonce() : null
  headers.delete('x-nonce')
  if (nonce) {
    headers.set('x-nonce', nonce)
    headers.set('content-security-policy', contentSecurityPolicy({ path: req.nextUrl.pathname, nonce, production: process.env.NODE_ENV === 'production' }))
  } else headers.delete('content-security-policy')

  // Before the first install every page leads to the web installer (never on a working site).
  const setup = await installGate(req).catch(() => null)
  if (setup) { setup.headers.set('x-request-id', requestId); return setup as NextResponse }

  // CSRF/Origin guard: state-changing API calls must originate from this site.
  if (
    MUTATING_METHODS.has(req.method) &&
    req.nextUrl.pathname.startsWith('/api/') &&
    !ORIGIN_EXEMPT.test(req.nextUrl.pathname)
  ) {
    const verdict = mutationOrigin({
      origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'),
      hasCookies: Boolean(req.headers.get('cookie')?.trim()), hosts: ownHosts(req),
    })
    if (verdict === 'foreign-origin') return NextResponse.json({ error: 'forbidden origin' }, { status: 403 })
    // Signed in by cookie but silent about where the request was made: no current browser does that.
    if (verdict === 'origin-required') return NextResponse.json({ error: 'origin required' }, { status: 403 })
  }

  // The whole site closed. Decided before everything below, so nothing behind it answers; the switch in the server's
  // environment is the way back in if the admin cannot be reached.
  headers.delete('x-site-maintenance')
  const closure = process.env.SITE_MAINTENANCE_BYPASS === '1' ? null : (await loadMaintenance().catch(() => null))?.site
  if (closure?.enabled && !openDuringSiteMaintenance(req.nextUrl.pathname)) {
    const account = await requireUser(req).catch(() => null)
    if (await opensDuringMaintenance(account, closure)) headers.set('x-site-maintenance', '1')
    else {
      const seconds = closure.reopensAt ? Math.max(60, Math.ceil((new Date(closure.reopensAt).getTime() - Date.now()) / 1000)) : 3600
      if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'سایت در حال تعمیر است' }, { status: 503, headers: { 'retry-after': String(seconds), 'cache-control': 'no-store' } })
      const url = req.nextUrl.clone()
      url.pathname = '/maintenance'
      url.search = '?site=1'
      const notice = NextResponse.rewrite(url, { request: { headers }, status: 503 })
      notice.headers.set('retry-after', String(seconds))
      notice.headers.set('x-robots-tag', 'noindex')
      notice.headers.set('cache-control', 'no-store')
      notice.headers.set('x-request-id', requestId)
      applySecurityHeaders(req, notice, nonce)
      return notice
    }
  }

  // A section in maintenance or limited to groups closes its API with its pages.
  const apiSection = sectionOfApi(req.nextUrl.pathname)
  if (apiSection) {
    if ((await loadMaintenance().catch(() => null))?.[apiSection]?.enabled) {
      const account = await requireUser(req).catch(() => null)
      if (!runsSection(account ? { role: account.role, roleId: account.roleId ?? null, permissions: account.permissions } : null, apiSection)) return NextResponse.json({ error: 'این بخش در حال به‌روزرسانی است' }, { status: 503, headers: { 'retry-after': '3600', 'cache-control': 'no-store' } })
    }
    const lock = await sectionLock(apiSection, () => requireUser(req).catch(() => null))
    if (lock !== 'open') return NextResponse.json({ error: lock === 'login' ? 'برای این بخش وارد حساب خود شوید' : 'این بخش برای گروه‌های خاصی باز است' }, { status: lock === 'login' ? 401 : 403, headers: { 'cache-control': 'no-store' } })
  }

  // An admin change may alter public pages: the guest page cache is emptied shortly after it.
  if (MUTATING_METHODS.has(req.method) && ADMIN_WRITE.test(req.nextUrl.pathname) && !ADMIN_WRITE_SKIP.test(req.nextUrl.pathname)) purgeSoon('admin-change')

  // Section addresses chosen by the site owner (/game for /games, /discourse for /forum …).
  let response: NextResponse | null = null
  let canonicalPath = req.nextUrl.pathname
  let redirected = false
  if ((req.method === 'GET' || req.method === 'HEAD') && !NOT_ALIASED.test(req.nextUrl.pathname)) {
    const decision = routeDecision(req.nextUrl.pathname, await loadRouteAliases().catch(() => ({})))
    if (decision?.kind === 'rewrite') canonicalPath = decision.path
    else if (decision) redirected = true

    // A section in maintenance shows its notice to everybody but the people who run it. Asked under the section's own
    // address, whatever address it is published under. Who is asking is read from the account as it is now (its role today,
    // not the one it signed in with), and only for a request that would otherwise get the notice.
    headers.delete('x-maintenance-preview')
    if (!redirected) {
      const state = await loadMaintenance().catch(() => null)
      if (state && Object.values(state).some((section) => section.enabled)) {
        const bases = maintenanceBases()
        const closed = maintenanceDecision({ path: canonicalPath, state, bases, viewer: null })
        const account = closed.action === 'notice' ? await requireUser(req).catch(() => null) : null
        const verdict = account ? maintenanceDecision({ path: canonicalPath, state, bases, viewer: { role: account.role, roleId: account.roleId ?? null, permissions: account.permissions } }) : closed
        if (verdict.action === 'notice') {
          const url = req.nextUrl.clone()
          url.pathname = '/maintenance'
          url.search = `?section=${verdict.section}`
          // 503 with Retry-After: a search engine keeps the page it knows and comes back later.
          const notice = NextResponse.rewrite(url, { request: { headers }, status: 503 })
          notice.headers.set('retry-after', '3600')
          notice.headers.set('x-robots-tag', 'noindex')
          notice.headers.set('cache-control', 'no-store')
          notice.headers.set('x-request-id', requestId)
          applySecurityHeaders(req, notice, nonce)
          return notice
        }
        // The people who run the section see it as it is, and are told nobody else does.
        if (verdict.action === 'pass' && verdict.preview) headers.set('x-maintenance-preview', verdict.preview)
      }
      // A section limited to groups, decided before the page cache: guests are asked to sign in, other members told so.
      const limits = await loadSectionAccess()
      const section = Object.keys(limits).length ? sectionOfPath(canonicalPath, maintenanceBases()) : null
      const lock = section ? await sectionLock(section, () => requireUser(req).catch(() => null)) : 'open'
      if (lock === 'login') {
        const url = req.nextUrl.clone()
        const target = new URL(sectionLoginPath(req.nextUrl.pathname, req.nextUrl.search), url)
        const signIn = NextResponse.redirect(target, 307)
        signIn.headers.set('cache-control', 'no-store')
        signIn.headers.set('x-request-id', requestId)
        applySecurityHeaders(req, signIn, nonce)
        return signIn
      }
      if (lock === 'refused') {
        const url = req.nextUrl.clone()
        url.pathname = '/section-locked'
        url.search = `?section=${section}`
        const notice = NextResponse.rewrite(url, { request: { headers }, status: 403 })
        notice.headers.set('x-robots-tag', 'noindex')
        notice.headers.set('cache-control', 'no-store')
        notice.headers.set('x-request-id', requestId)
        applySecurityHeaders(req, notice, nonce)
        return notice
      }
    }
    if (decision) {
      const url = req.nextUrl.clone()
      url.pathname = decision.path
      response = decision.kind === 'redirect' ? NextResponse.redirect(url, 308) : NextResponse.rewrite(url, { request: { headers } })
    }
  }
  // Guests get public pages from the page cache (see Optimization in the admin); everything else goes on.
  if (!redirected && req.method === 'GET' && !NOT_ALIASED.test(req.nextUrl.pathname)) {
    const cached = await pageCacheHandle({
      request: req, canonicalPath, publicPath: req.nextUrl.pathname,
      // The raw address: Next strips `?_rsc=` (client-side navigation) from nextUrl, and those requests must never be cached.
      search: new URL(req.url).search, host: req.headers.get('host') || req.nextUrl.host,
      port: req.nextUrl.port, proto: req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', ''),
      nonce,
    }).catch(() => null)
    if (cached) {
      cached.headers.set('x-request-id', requestId)
      // A stored page was given this response's nonce. An answer passed on as it was rendered keeps the nonce it was rendered with.
      applySecurityHeaders(req, cached as NextResponse, nonceOf(cached.headers.get('content-security-policy')) ?? nonce)
      return cached
    }
  }
  response ||= NextResponse.next({ request: { headers } })
  response.headers.set('x-request-id', requestId)
  applySecurityHeaders(req, response, nonce)
  return response
}

export const config = {
  // Large signed packages stream directly; their route applies the same canonical
  // install/origin policy, fresh server unlock, permissions and private headers.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/admin/server/updates/package$).*)'],
}
