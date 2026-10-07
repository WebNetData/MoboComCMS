import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { err } from '@/platform/http/response'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { InstallError } from '@/modules/installer/domain/installer'
import { installMode, isSetupMode } from './state'
import { buildProvider } from '@/platform/database/migrate'
import { applySchema, environmentChecks, installSite, moduleCatalog, saveDatabase, testDatabase } from './setup'

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }

/** The address the visitor used (a suggestion for the site URL; the person can change it). */
function originOf(req: NextRequest) {
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.nextUrl.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || req.headers.get('host') || req.nextUrl.host
  return `${proto === 'https' ? 'https' : 'http'}://${host}`
}

function tokenOk(req: NextRequest) {
  const expected = process.env.INSTALL_TOKEN?.trim()
  if (!expected) return true
  const given = req.headers.get('x-install-token') || ''
  const a = Buffer.from(given), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Every installer call starts here: it exists only while the site is not installed. */
async function gate(req: NextRequest) {
  const mode = await installMode()
  if (mode === 'installed') return { response: err('not found', 404) }
  // A working site that cannot reach its database says nothing to strangers.
  if (mode === 'unknown') return { response: err('پایگاه داده پاسخ نمی‌دهد. تنظیم DATABASE_URL و اجرای سرویس پایگاه داده را بررسی کنید.', 503) }
  if (!(await rateLimitStrict(`install:${clientIp(req.headers)}`, 90, 60_000)).ok) return { response: err('درخواست‌ها زیاد است؛ کمی صبر کنید', 429) }
  if (!tokenOk(req)) return { response: Response.json({ error: 'کد نصب لازم است', tokenRequired: true }, { status: 401, headers: NO_STORE }) }
  return { mode }
}

/** GET /api/install → what the wizard needs: state, system checks, and (once tables exist) the modules to choose from. */
export async function GET(req: NextRequest) {
  const g = await gate(req)
  if ('response' in g) return g.response
  const https = originOf(req).startsWith('https:')
  return Response.json({
    mode: g.mode, setup: isSetupMode(), provider: buildProvider(), origin: originOf(req), tokenRequired: Boolean(process.env.INSTALL_TOKEN?.trim()),
    checks: environmentChecks({ https }, g.mode),
    modules: g.mode === 'needs-admin' ? moduleCatalog() : undefined,
  }, { headers: NO_STORE })
}

/** POST { op: 'database.test' | 'database.save' | 'schema' | 'site', ... } */
export async function POST(req: NextRequest) {
  const g = await gate(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return err('درخواست نامعتبر است')
  try {
    switch (body.op) {
      case 'database.test': {
        if (g.mode !== 'needs-database') return err('پایگاه داده از قبل تنظیم شده است', 409)
        await testDatabase(body)
        return Response.json({ ok: true }, { headers: NO_STORE })
      }
      case 'database.save': {
        if (g.mode !== 'needs-database') return err('پایگاه داده از قبل تنظیم شده است', 409)
        return Response.json({ ok: true, ...(await saveDatabase(body, originOf(req))) }, { headers: NO_STORE })
      }
      case 'schema': return Response.json({ ok: true, ...(await applySchema()) }, { headers: NO_STORE })
      case 'site': return Response.json(await installSite(body), { headers: NO_STORE })
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) {
    if (error instanceof InstallError) return err(error.message, error.status)
    throw error
  }
}

