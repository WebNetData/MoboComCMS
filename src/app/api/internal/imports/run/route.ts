import { timingSafeEqual } from 'node:crypto'
import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { runQueue } from '@/modules/operations/server/queue'
import { sweepImportJobs } from '@/modules/imports/server/engine'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

/**
 * Bulk import work on demand (the built-in scheduler already runs it; this
 * route is for an external cron when BACKGROUND_JOBS=false): restarts stalled
 * import chains and runs the background queue, where the slices execute.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_JOBS_SECRET
  if (!secret) return err('worker secret not configured', 503)
  const expected = Buffer.from(secret)
  const provided = Buffer.from((req.headers.get('authorization') || '').replace(/^Bearer /, ''))
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return err('unauthorized', 401)
  const sweep = await sweepImportJobs()
  return ok({ sweep, queue: await runQueue(90_000) })
}
