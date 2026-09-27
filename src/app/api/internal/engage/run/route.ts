import { timingSafeEqual } from 'node:crypto'
import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { runEngagementJobs } from '@/modules/content/server/jobs'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Engagement jobs on demand (the built-in scheduler already runs them; this
 * route is for an external cron when BACKGROUND_JOBS=false).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_JOBS_SECRET
  if (!secret) return err('worker secret not configured', 503)
  const expected = Buffer.from(secret)
  const provided = Buffer.from((req.headers.get('authorization') || '').replace(/^Bearer /, ''))
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return err('unauthorized', 401)
  return ok(await runEngagementJobs({ full: true }))
}
