import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { getViewer } from '@/modules/membership/server/membership'
import { getPushConfig, publicVapidKey, pushStats, savePushConfig, sendCampaign, subscribe, unsubscribe } from '@/modules/push/server/push'

/** GET /api/push/key — the VAPID public key for PushManager.subscribe. */
export async function GET_key() {
  const off = await moduleGuard('web-push')
  if (off) return off
  const response = ok({ key: await publicVapidKey() })
  response.headers.set('Cache-Control', 'public, max-age=3600')
  return response
}

/** POST /api/push/subscribe { endpoint, keys: { p256dh, auth } } — guests may subscribe too. */
export async function POST_subscribe(req: NextRequest) {
  const off = await moduleGuard('web-push')
  if (off) return off
  if (!rateLimitHit(`push-sub:${clientIp(req.headers)}`, 20, 3_600_000).ok) return err('too many requests', 429)
  const body = (await req.json().catch(() => null)) || {}
  const viewer = await getViewer()
  try { return ok(await subscribe({ endpoint: body.endpoint, keys: body.keys, userId: viewer.userId, userAgent: req.headers.get('user-agent') || '' }), 201) }
  catch { return err('اشتراک نامعتبر است') }
}

/** DELETE /api/push/subscribe { endpoint } */
export async function DELETE_subscribe(req: NextRequest) {
  const body = (await req.json().catch(() => null)) || {}
  return ok(await unsubscribe(body.endpoint))
}

const guard = (req: NextRequest) => adminGuard(req, 'web-push', ['push.manage', 'settings.manage'])

export async function GET_admin(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const [stats, config] = await Promise.all([pushStats(), getPushConfig()])
  return ok({ ...stats, config })
}

/** POST { action: campaign, title, body, url, audience } | { action: config, accountEvents } */
export async function POST_admin(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (body.action === 'config') return ok({ config: await savePushConfig(body) })
    if (body.action === 'campaign') {
      const result = await sendCampaign({ title: body.title, body: body.body, url: body.url, audience: body.audience, createdBy: g.admin.id })
      await auditAdmin({ req, actor: g.admin, action: 'push.campaign', targetType: 'push', targetId: null, metadata: { audience: body.audience, ...result } })
      return ok(result)
    }
    return err('unknown action')
  } catch (error) {
    return err(error instanceof Error ? error.message : 'ارسال انجام نشد', 400)
  }
}
