import { orderGroups, visibleSources, type QueueGroup, type QueueSourceKey } from '@/modules/moderation/domain/queue'
import { waitingForModeration as forumWaiting } from '@/modules/forum/server/moderation'
import { waitingForModeration as journalWaiting, waitingInTrash as postsInTrash } from '@/modules/journal/server/admin'
import { waitingForReview as postsInReview } from '@/modules/journal/server/review'
import { waitingInTrash as mediaInTrash } from '@/modules/media/server/admin'
import { waitingForModeration as reviewsWaiting } from '@/modules/reviews/server/reviews'
import { waitingForModeration as businessesWaiting } from '@/modules/businesses/server/businesses'
import { waitingForModeration as storeWaiting } from '@/modules/store/server/admin'
import { waitingForModeration as communityWaiting } from '@/modules/community/server/admin'
import { waitingForModeration as copyrightWaiting } from '@/modules/copyright/server/copyright'

// The staff moderation overview. Each module reads its own waiting items; nothing is decided here.

type Waiting = { count: number; items: { id: number; text: string; full: string; by: string; about: string; at: Date }[] }

const TAKE = 5

/**
 * What waits for a decision, for the sources this staff member may see. A source that cannot be
 * read is reported as failed instead of hiding the others.
 */
export async function moderationQueue(states: Readonly<Record<string, boolean | undefined>>, can: (permission: string) => boolean) {
  const sources = visibleSources(states, can)
  const wanted = new Set(sources.map((source) => source.module))
  const read = <T>(module: string, load: () => Promise<T>) => wanted.has(module) ? load().catch(() => null) : Promise.resolve(null)
  const [forum, journal, reviews, store, community, copyright, businesses] = await Promise.all([
    read('forum', () => forumWaiting(TAKE)), read('journal', () => journalWaiting(TAKE)), read('reviews', () => reviewsWaiting(TAKE)),
    read('store', () => storeWaiting(TAKE)), read('community', () => communityWaiting(TAKE)), read('copyright', () => copyrightWaiting(TAKE)),
    read('businesses', () => businessesWaiting(TAKE)),
  ])
  // Delete requests of section authors, each read from the owner of that kind of item.
  const [trashPosts, trashCinema, trashTracks, trashAlbums, trashSoftware, trashGames, reviewPosts] = await Promise.all([
    read('journal', () => postsInTrash(TAKE)), read('cinema', () => mediaInTrash('cinema-titles', TAKE)), read('music', () => mediaInTrash('music-tracks', TAKE)),
    read('music', () => mediaInTrash('music-albums', TAKE)), read('software', () => mediaInTrash('software', TAKE)),
    read('games', () => mediaInTrash('games', TAKE)), read('journal', () => postsInReview(TAKE)),
  ])
  const bySource: Record<QueueSourceKey, Waiting | null | undefined> = {
    'forum-posts': forum?.posts, 'forum-flags': forum?.flags, 'article-comments': journal, 'item-reviews': reviews, 'business-experiences': businesses,
    'product-reviews': store?.reviews, 'product-questions': store?.questions, 'community-reports': community, copyright,
    'review-posts': reviewPosts, 'trash-posts': trashPosts, 'trash-cinema': trashCinema, 'trash-music-tracks': trashTracks, 'trash-music-albums': trashAlbums, 'trash-games': trashGames, 'trash-software': trashSoftware,
  }
  const failed: QueueSourceKey[] = []
  const groups: QueueGroup[] = []
  for (const source of sources) {
    const waiting = bySource[source.key]
    if (!waiting) { failed.push(source.key); continue }
    groups.push({
      key: source.key, label: source.label, labelEn: source.labelEn, href: source.href, count: waiting.count,
      // Items come oldest first, so the first one is the longest wait.
      oldestAt: waiting.items[0]?.at.toISOString() ?? null,
      items: waiting.items.map((item) => ({ ...item, at: item.at.toISOString() })),
    })
  }
  return { total: groups.reduce((sum, group) => sum + group.count, 0), groups: orderGroups(groups), failed }
}
