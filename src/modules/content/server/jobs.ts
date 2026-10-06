import { processSocialQueue, releaseStuckSocialPosts } from '@/modules/social/server/social'
import { rebuildSearchIndex } from '@/modules/search/server/search'
import { pruneDownloadLogs } from '@/modules/downloads/server/guard'
import { backfillVerifiedBadges } from '@/modules/reviews/server/reviews'
import { pruneAnalytics } from '@/modules/analytics/server/collect'
import { processTrackReleaseNotifications } from '@/modules/music/server/release-notifications'
import { processGameUpdateReleaseNotifications } from '@/modules/games/server/release-notifications'
import { processEpisodeAirNotifications } from '@/modules/cinema/server/episode-notifications'
import { processSoftwareReleaseNotifications } from '@/modules/software/server/release-notifications'
import { processStudioPublicationNotifications } from '@/modules/studios/server/publication-notifications'
import { logEvent } from '@/platform/observability/logger'

/**
 * Engagement background work. The quick part (announcement queue) runs every
 * minute; `full` adds the search index rebuild and data retention, which the
 * scheduler runs every 15 minutes.
 *
 * Every step runs even when an earlier one fails, so one broken announcement or
 * release cannot hold back the others. The first failure is thrown at the end,
 * which keeps the run reported as failed (and a queued reindex retried).
 */
export async function runEngagementJobs(options: { full?: boolean } = {}) {
  const errors: unknown[] = []
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T | null> => {
    try { return await run() } catch (error) {
      errors.push(error)
      logEvent('error', 'engagement.step_failed', { step: name, error: String(error) })
      return null
    }
  }
  const released = await step('social.release', () => releaseStuckSocialPosts())
  const announced = await step('social.queue', () => processSocialQueue(50))
  const trackNotifications = await step('music.releases', () => processTrackReleaseNotifications())
  const gameNotifications = await step('games.releases', () => processGameUpdateReleaseNotifications())
  const softwareNotifications = await step('software.releases', () => processSoftwareReleaseNotifications())
  const studioNotifications = await step('studios.publications', () => processStudioPublicationNotifications())
  const episodeNotifications = await step('cinema.episodes', () => processEpisodeAirNotifications())
  const quick = { released, announced, trackNotifications, gameNotifications, softwareNotifications, studioNotifications, episodeNotifications }
  if (!options.full) {
    if (errors.length) throw errors[0]
    return quick
  }
  const indexed = await step('search.index', () => rebuildSearchIndex())
  // Before the prune: a badge is read from download logs that are about to go.
  const reviewBadges = await step('reviews.badges', () => backfillVerifiedBadges())
  const prunedDownloadLogs = await step('downloads.prune', () => pruneDownloadLogs())
  const analytics = await step('analytics.prune', () => pruneAnalytics())
  if (errors.length) throw errors[0]
  return { ...quick, reviewBadges, indexed, prunedDownloadLogs, analytics }
}
