import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { monitoringOverview, purgeCdn, recordVital } from '@/modules/operations/server/monitoring'
import { enqueue, isJobKind, retryJob } from '@/modules/operations/server/queue'

/** GET /api/admin/performance — health, queues, errors, slow queries and Web Vitals. */
export async function GET_admin(req: NextRequest) {
  const guard = await adminGuard(req, null, ['settings.manage'])
  if ('response' in guard) return guard.response
  return ok(await monitoringOverview())
}

/** POST {op: 'job', kind} | {op: 'retry', id} | {op: 'purge-cdn'} */
export async function POST_admin(req: NextRequest) {
  const guard = await adminGuard(req, null, ['settings.manage'])
  if ('response' in guard) return guard.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (body.op === 'job') {
      const kind = String(body.kind || '')
      if (!isJobKind(kind)) return err('نوع کار نامعتبر است', 400)
      const job = await enqueue(kind, {}, { dedupeKey: `manual:${kind}` })
      await auditAdmin({ req, actor: guard.admin, action: 'operations.enqueue', targetType: 'job', targetId: String(job.id), metadata: { kind } })
      return ok({ id: job.id })
    }
    if (body.op === 'retry') return ok({ retried: await retryJob(Number(body.id) || 0) })
    if (body.op === 'purge-cdn') {
      const result = await purgeCdn()
      await auditAdmin({ req, actor: guard.admin, action: 'operations.purge_cdn', targetType: 'cdn', targetId: 'cloudflare', metadata: { zones: result.zones } })
      return ok(result)
    }
    return err('عملیات نامعتبر است', 400)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'انجام نشد', 400)
  }
}

/** POST /api/metrics/vitals — sampled Web Vitals from visitors' browsers (sendBeacon). */
export async function POST_vitals(req: NextRequest) {
  if (!rateLimitHit(`vitals:${clientIp(req.headers)}`, 30, 60_000).ok) return new Response(null, { status: 204 })
  const text = await req.text().catch(() => '')
  if (text.length > 4000) return new Response(null, { status: 204 })
  let rows: unknown = []
  try { rows = JSON.parse(text) } catch { return new Response(null, { status: 204 }) }
  const list = Array.isArray(rows) ? rows.slice(0, 10) : [rows]
  const ua = req.headers.get('user-agent') || ''
  for (const row of list) if (row && typeof row === 'object') await recordVital(row as Record<string, unknown>, ua)
  return new Response(null, { status: 204 })
}
