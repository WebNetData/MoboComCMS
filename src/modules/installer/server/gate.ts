import { NextResponse, type NextRequest } from 'next/server'
import { installMode } from './state'

// What stays reachable while the site is being installed: the installer, its assets and the health check.
const OPEN = /^\/(install|installer|api\/install|api\/health|_next|fonts|icons|images|favicon\.ico|robots\.txt)(\/|$|\.)/

/**
 * A site that is not installed yet sends visitors to /install. A working site is never affected:
 * `installMode` answers "installed" from memory, and "unknown" (database outage) is treated like installed.
 */
export async function installGate(req: NextRequest): Promise<Response | null> {
  const path = req.nextUrl.pathname
  if (OPEN.test(`${path}/`) || OPEN.test(path)) return null
  const mode = await installMode()
  if (mode === 'installed' || mode === 'unknown') return null
  if (path.startsWith('/api/')) return NextResponse.json({ error: 'The site is not installed yet', install: '/install' }, { status: 503, headers: { 'Retry-After': '30', 'Cache-Control': 'no-store' } })
  // Same pattern as the section-address redirects in the middleware: Next resolves the clone against the host the visitor used.
  const url = req.nextUrl.clone()
  url.pathname = '/install'
  url.search = ''
  return NextResponse.redirect(url, 307)
}
