import { processSocialQueue, releaseStuckSocialPosts } from '@/modules/social/server/social'
import { rebuildSearchIndex } from '@/modules/search/server/search'
import { pruneDownloadLogs } from '@/modules/downloads/server/guard'
import { pruneAnalytics } from '@/modules/analytics/server/collect'
import { processTrackReleaseNotifications } from '@/modules/music/server/release-notifications'
import { processGameUpdateReleaseNotifications } from '@/modules/games/server/release-notifications'
import { processSoftwareReleaseNotifications } from '@/modules/software/server/release-notifications'

/**
 * Engagement background work. The quick part (announcement queue) runs every
 * minute; `full` adds the search index rebuild and data retention, which the
 * scheduler runs every 15 minutes.
 */
export async function runEngagementJobs(options: { full?: boolean } = {}) {
  const released = await releaseStuckSocialPosts()
  const announced = await processSocialQueue(50)
  const trackNotifications = await processTrackReleaseNotifications()
  const gameNotifications = await processGameUpdateReleaseNotifications()
  const softwareNotifications = await processSoftwareReleaseNotifications()
  if (!options.full) return { released, announced, trackNotifications, gameNotifications, softwareNotifications }
  const indexed = await rebuildSearchIndex()
  const prunedDownloadLogs = await pruneDownloadLogs()
  const analytics = await pruneAnalytics()
  return { released, announced, trackNotifications, gameNotifications, softwareNotifications, indexed, prunedDownloadLogs, analytics }
}
