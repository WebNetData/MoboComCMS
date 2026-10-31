import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { serverGate } from '@/modules/server-panel/server/gate'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { UpdateError } from '../domain/updater'
import { listPackages, uploadPackage } from './packages'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { installGate } from '@/modules/installer/server/gate'

function privateResponse(response: Response) {
  response.headers.set('cache-control', 'no-store')
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
  return response
}

async function guard(req: NextRequest) {
  // This exact binary route streams outside Next Proxy's buffered body clone.
  // It therefore applies the same canonical first-install and origin policies here.
  const setup = await installGate(req)
  if (setup) return { response: setup as Response }
  if (req.method !== 'GET') {
    let configured: string | null = null
    try { configured = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : null } catch { /* invalid public address never widens access */ }
    const verdict = mutationOrigin({ origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'), hasCookies: Boolean(req.headers.get('cookie')?.trim()), hosts: [req.headers.get('host') || req.nextUrl.host, configured] })
    if (verdict !== 'allow') return { response: err(verdict === 'origin-required' ? 'origin required' : 'forbidden origin', 403) }
  }
  const panel = await serverGate(req)
  if ('response' in panel) return panel
  return adminGuard(req, null, ['settings.manage'])
}
export async function GET(req: NextRequest) {
  const access = await guard(req)
  if ('response' in access) return privateResponse(access.response)
  return privateResponse(ok(await listPackages()))
}
export async function POST(req: NextRequest) {
  const access = await guard(req)
  if ('response' in access) return privateResponse(access.response)
  if (!(await rateLimitStrict(`updates:package:${access.admin.id}`, 6, 60_000)).ok) return privateResponse(err('درخواست‌ها زیاد است', 429))
  try {
    const result = await uploadPackage(req)
    await auditAdmin({ req, actor: access.admin, action: 'updates.package-upload', targetType: 'system', targetId: result.id, metadata: { version: result.version, sha256: result.sha256, bytes: result.bytes } })
    return privateResponse(ok(result))
  } catch (error) { if (error instanceof UpdateError) return privateResponse(err(error.message, error.status)); throw error }
}
