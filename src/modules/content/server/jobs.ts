import { processSocialQueue, releaseStuckSocialPosts } from '@/modules/social/server/social'
import { rebuildSearchIndex } from '@/modules/search/server/search'
import { pruneDownloadLogs } from '@/modules/downloads/server/guard'
import { pruneAnalytics } from '@/modules/analytics/server/collect'

/**
 * Engagement background work. The quick part (announcement queue) runs every
 * minute; `full` adds the search index rebuild and data retention, which the
 * scheduler runs every 15 minutes.
 */
export async function runEngagementJobs(options: { full?: boolean } = {}) {
  const released = await releaseStuckSocialPosts()
  const announced = await processSocialQueue(50)
  if (!options.full) return { released, announced }
  const indexed = await rebuildSearchIndex()
  const prunedDownloadLogs = await pruneDownloadLogs()
  const analytics = await pruneAnalytics()
  return { released, announced, indexed, prunedDownloadLogs, analytics }
}
