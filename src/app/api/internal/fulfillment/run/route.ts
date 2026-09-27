import { timingSafeEqual } from 'node:crypto'
import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { env } from '@/platform/config/env'
import { requestIdFrom } from '@/platform/observability/logger'
import { runFulfillmentWorker } from '@/modules/fulfillment/server/worker'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

function authorized(req: NextRequest) {
  const expected = env('INTERNAL_JOBS_SECRET')
  if (!expected) return false
  const auth = req.headers.get('authorization') || ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (req.headers.get('x-internal-secret') || '').trim()
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  if (!env('INTERNAL_JOBS_SECRET')) return err('internal worker secret is not configured', 503, { code: 'WORKER_NOT_CONFIGURED' })
  if (!authorized(req)) return err('unauthorized', 401, { code: 'UNAUTHORIZED' })
  const rawLimit = Number(req.nextUrl.searchParams.get('limit') || 20)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.floor(rawLimit))) : 20
  return ok(await runFulfillmentWorker(limit, requestIdFrom(req.headers)))
}
