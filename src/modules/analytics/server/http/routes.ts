import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { recordPageview } from '@/modules/analytics/server/collect'
import { analyticsDashboard } from '@/modules/analytics/server/dashboard'
import { logEvent } from '@/platform/observability/logger'

/** POST /api/analytics/collect — text/plain JSON { p: path, r: referrer, u: utm_source } from sendBeacon. */
export async function POST_collect(req: NextRequest) {
  if (!rateLimitHit(`analytics:${clientIp(req.headers)}`, 120, 60_000).ok) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  const text = (await req.text().catch(() => '')).slice(0, 2000)
  let body: { p?: unknown; r?: unknown; u?: unknown } = {}
  try { body = JSON.parse(text) } catch { return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  await recordPageview({ path: body.p, referrer: body.r, utm: body.u, headers: req.headers, host: req.headers.get('host') || '' }).catch(error => {
    logEvent('error', 'analytics.collection_failed', { phase: 'pageview', errorName: error instanceof Error ? error.name : 'unknown' })
  })
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}

/** GET /api/admin/analytics?days=30 */
export async function GET_admin(req: NextRequest) {
  const g = await adminGuard(req, 'analytics', ['analytics.view', 'dashboard.view'])
  if ('response' in g) return g.response
  const days = Number(req.nextUrl.searchParams.get('days'))
  if (![7, 30, 90].includes(days) && req.nextUrl.searchParams.has('days')) return err('invalid range')
  return ok(await analyticsDashboard(days || 30))
}
