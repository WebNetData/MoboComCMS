import { timingSafeEqual } from 'node:crypto'
import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { processSocialQueue, releaseStuckSocialPosts } from '@/modules/social/server/social'
import { rebuildSearchIndex } from '@/modules/search/server/search'
import { pruneDownloadLogs } from '@/modules/downloads/server/guard'
import { pruneAnalytics } from '@/modules/analytics/server/collect'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Periodic engagement jobs (call every 5–15 minutes from cron / Coolify):
 * scheduled and retried announcements, search index rebuild and data retention.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_JOBS_SECRET
  if (!secret) return err('worker secret not configured', 503)
  const expected = Buffer.from(secret)
  const provided = Buffer.from((req.headers.get('authorization') || '').replace(/^Bearer /, ''))
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return err('unauthorized', 401)
  const released = await releaseStuckSocialPosts()
  const announced = await processSocialQueue(50)
  const indexed = await rebuildSearchIndex()
  const downloads = await pruneDownloadLogs()
  const analytics = await pruneAnalytics()
  return ok({ released, announced, indexed, prunedDownloadLogs: downloads, analytics })
}
