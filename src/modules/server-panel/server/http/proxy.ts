import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { serverGate } from '@/modules/server-panel/server/gate'
import { SocialProxyError, proxyOverview, removeProfile, revealProxyLink, saveProfile, setRoutes, testProxy } from '@/modules/social/server/proxy'

const LIMIT = 32_768

function failure(error: unknown) {
  if (error instanceof SocialProxyError) return err(error.message, error.status)
  return err('عملیات انجام نشد', 500)
}

/** GET /api/admin/server/proxy — the proxy service, the saved profiles (never their links) and the profile of each purpose. */
export async function GET_proxy(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  try { return ok(await proxyOverview()) } catch (error) { return failure(error) }
}

/** POST /api/admin/server/proxy {op: profile {id?, name, link?} | remove {id} | routes {routes} | test {purposes?} | reveal {id}} */
export async function POST_proxy(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  if (Number(req.headers.get('content-length') || 0) > LIMIT) return err('حجم درخواست زیاد است', 413)
  let body: Record<string, unknown>
  try {
    const raw = await req.text()
    if (raw.length > LIMIT) return err('حجم درخواست زیاد است', 413)
    body = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return err('درخواست نامعتبر است')
  } catch { return err('درخواست نامعتبر است') }
  // The link holds the proxy's credentials: the audit names only what kind of server it is.
  const audit = (action: string, metadata?: Record<string, unknown>) => auditAdmin({ req, actor: gate.user, action: `server.${action}`, targetType: 'social_proxy', targetId: 'xray', metadata })
  try {
    switch (body.op) {
      case 'profile': { const r = await saveProfile({ id: body.id, name: body.name, link: body.link }); await audit('social_proxy_save', { profile: r.id, protocol: r.protocol, server: r.server }); return ok(r) }
      case 'remove': { const r = await removeProfile(body.id); await audit('social_proxy_remove', { profile: r.removed }); return ok(r) }
      case 'routes': { const r = await setRoutes(body.routes); await audit('social_proxy_routes', { routes: r.routes }); return ok(r) }
      case 'test': return ok(await testProxy(body.purposes))
      case 'reveal': { const r = await revealProxyLink(body.id); await audit('social_proxy_reveal', { profile: typeof body.id === 'string' ? body.id : '' }); return ok(r) }
      default: return err('عملیات نامعتبر')
    }
  } catch (error) { return failure(error) }
}
