import { timingSafeEqual } from 'node:crypto'
import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { runMarketingJobs } from '@/modules/store/server/marketing'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Store marketing jobs (back-in-stock alerts, abandoned carts, club points) on
 * demand — for an external cron when BACKGROUND_JOBS=false.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_JOBS_SECRET
  if (!secret) return err('worker secret not configured', 503)
  const expected = Buffer.from(secret)
  const provided = Buffer.from((req.headers.get('authorization') || '').replace(/^Bearer /, ''))
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return err('unauthorized', 401)
  return ok(await runMarketingJobs())
}
