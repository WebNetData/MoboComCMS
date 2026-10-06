import { orderGroups, visibleSources, type QueueGroup, type QueueSourceKey } from '@/modules/moderation/domain/queue'
import { waitingForModeration as forumWaiting } from '@/modules/forum/server/moderation'
import { waitingForModeration as journalWaiting } from '@/modules/journal/server/admin'
import { waitingForModeration as reviewsWaiting } from '@/modules/reviews/server/reviews'
import { waitingForModeration as storeWaiting } from '@/modules/store/server/admin'
import { waitingForModeration as communityWaiting } from '@/modules/community/server/admin'
import { waitingForModeration as copyrightWaiting } from '@/modules/copyright/server/copyright'

// The staff moderation overview. Each module reads its own waiting items; nothing is decided here.

type Waiting = { count: number; items: { id: number; text: string; by: string; about: string; at: Date }[] }

const TAKE = 5

/**
 * What waits for a decision, for the sources this staff member may see. A source that cannot be
 * read is reported as failed instead of hiding the others.
 */
export async function moderationQueue(states: Readonly<Record<string, boolean | undefined>>, can: (permission: string) => boolean) {
  const sources = visibleSources(states, can)
  const wanted = new Set(sources.map((source) => source.module))
  const read = <T>(module: string, load: () => Promise<T>) => wanted.has(module) ? load().catch(() => null) : Promise.resolve(null)
  const [forum, journal, reviews, store, community, copyright] = await Promise.all([
    read('forum', () => forumWaiting(TAKE)), read('journal', () => journalWaiting(TAKE)), read('reviews', () => reviewsWaiting(TAKE)),
    read('store', () => storeWaiting(TAKE)), read('community', () => communityWaiting(TAKE)), read('copyright', () => copyrightWaiting(TAKE)),
  ])
  const bySource: Record<QueueSourceKey, Waiting | null | undefined> = {
    'forum-posts': forum?.posts, 'forum-flags': forum?.flags, 'article-comments': journal, 'item-reviews': reviews,
    'product-reviews': store?.reviews, 'product-questions': store?.questions, 'community-reports': community, copyright,
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
