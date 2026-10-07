import { db } from '@/platform/database/prisma'
import { itemCards, type ItemCard } from '@/modules/content/server/registry'
import { itemKey, parseItemKey, type ItemRef } from '@/modules/content/domain/items'
import { RATED_SEED_MIN, SEED_WEIGHT, cleanSuggestions, type Seed } from '@/modules/recommendations/domain/provider'
import { recommendationProvider } from '@/modules/recommendations/server/providers'
import { logEvent } from '@/platform/observability/logger'

type PersonalSuggestion = { item: ItemCard; sourceTitle: string; sourceKind: Seed['kind']; reason: string }

const supported = ['game', 'software', 'title', 'album', 'track']
const followedCreators = ['artist', 'studio']
const HISTORY_DAYS = 180
// A track counts as a listening signal once it was finished or played again, not on a single start.
const LISTEN_SEEDS = 12
// Tracks the member already played are not suggested back to them.
const HEARD_LIMIT = 300
// How many candidates one seed is asked for.
const PER_SEED = 12
// Admin pause must take effect on the next request, including across separately bundled routes.
const available = async () => (await db.setting.findUnique({ where: { key: 'personalRecommendationsEnabled' }, select: { value: true } }))?.value !== 'false'

/**
 * Private, bounded suggestions. No interaction history is read before explicit consent, and
 * listening history only with its own, separate consent. What goes with a seed is asked of the
 * provider for its kind of item (`providers.ts`); consent, bounds, what the member already has
 * and what is shown stay here whichever provider answers.
 */
export async function personalRecommendations(userId: number, take = 6): Promise<{ available: boolean; enabled: boolean; items: PersonalSuggestion[] }> {
  if (!Number.isSafeInteger(userId) || userId < 1) return { available: false, enabled: false, items: [] }
  if (!await available()) return { available: false, enabled: false, items: [] }
  const preference = await db.user.findUnique({ where: { id: userId }, select: { recommendationOptIn: true, recommendationListeningOptIn: true } })
  if (!preference?.recommendationOptIn) return { available: true, enabled: false, items: [] }
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000)
  const useListening = preference.recommendationListeningOptIn

  const [follows, favorites, views, listens, heard, reviews] = await Promise.all([
    db.itemFavorite.findMany({ where: { userId, itemType: { in: followedCreators } }, orderBy: { createdAt: 'desc' }, take: 12, select: { itemType: true, itemId: true } }),
    db.itemFavorite.findMany({ where: { userId, itemType: { in: supported } }, orderBy: { createdAt: 'desc' }, take: 12, select: { itemType: true, itemId: true } }),
    db.userRecentView.findMany({ where: { userId, lastViewedAt: { gte: since } }, orderBy: { lastViewedAt: 'desc' }, take: 12, select: { itemType: true, itemId: true } }),
    useListening ? db.musicListenHistory.findMany({ where: { userId, lastPlayedAt: { gte: since }, OR: [{ completedAt: { not: null } }, { playCount: { gte: 2 } }] }, orderBy: [{ playCount: 'desc' }, { lastPlayedAt: 'desc' }, { trackId: 'desc' }], take: LISTEN_SEEDS, select: { trackId: true } }) : [],
    useListening ? db.musicListenHistory.findMany({ where: { userId }, orderBy: [{ lastPlayedAt: 'desc' }, { trackId: 'desc' }], take: HEARD_LIMIT, select: { trackId: true } }) : [],
    // The member's own published reviews: a high rating is a deliberate "more like this"; whatever they rated is not suggested back.
    db.itemReview.findMany({ where: { userId, status: 'APPROVED', itemType: { in: supported } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 60, select: { itemType: true, itemId: true, rating: true } }),
  ])
  const creatorSeeds: Seed[] = []
  const contentSeeds: Seed[] = []
  const seen = new Set<string>()
  // What the member listens to repeatedly says more than a page view, less than a deliberate favorite.
  const listened = listens.map((row) => ({ itemType: 'track', itemId: row.trackId }))
  const rated = reviews.filter((row) => row.rating >= RATED_SEED_MIN).slice(0, 12)
  for (const [kind, rows] of [['follow', follows], ['favorite', favorites], ['rated', rated], ['listen', listened], ['view', views]] as const) for (const row of rows) {
    const ref = parseItemKey(`${row.itemType}:${row.itemId}`)
    if (!ref) continue
    const key = itemKey(ref)
    if (!seen.has(key) && (kind === 'follow' ? followedCreators.includes(ref.type) : supported.includes(ref.type)))
      (kind === 'follow' ? creatorSeeds : contentSeeds).push({ ref, kind })
    seen.add(key)
  }
  for (const row of heard) seen.add(itemKey({ type: 'track', id: row.trackId }))
  for (const row of reviews) seen.add(`${row.itemType}:${row.itemId}`)
  // Reserve room for a followed creator even when newer content favorites fill the history window.
  const seeds = [creatorSeeds[0], contentSeeds[0], ...creatorSeeds.slice(1), ...contentSeeds.slice(1)].filter((seed): seed is Seed => !!seed)
  if (!seeds.length) return { available: true, enabled: true, items: [] }
  const sourceCards = await itemCards(seeds.map((seed) => seed.ref))
  const now = new Date()
  const ranked = new Map<string, { ref: ItemRef; score: number; sourceTitle: string; sourceKind: Seed['kind']; reason: string }>()
  let used = 0
  let examined = 0
  for (const seed of seeds) {
    const source = sourceCards.get(itemKey(seed.ref))
    if (!source) continue
    // Stop after a bounded number of live sources, even when none yields a candidate.
    if (++examined > 6) break
    const provider = recommendationProvider(seed.ref.type)
    if (!provider) continue
    // A provider that fails or answers nonsense costs its seed, not the member's whole list.
    const suggestions = cleanSuggestions(await provider.suggest(seed.ref, { now, take: PER_SEED }).catch((error) => { logEvent('error', 'recommendations.provider_failed', { provider: provider.id, error }); return [] }), PER_SEED * 2)
    const priorCount = ranked.size
    for (const suggestion of suggestions) {
      const key = itemKey(suggestion.item)
      if (seen.has(key)) continue
      const score = suggestion.score + SEED_WEIGHT[seed.kind]
      const previous = ranked.get(key)
      if (!previous || score > previous.score) ranked.set(key, { ref: suggestion.item, score, sourceTitle: source.title, sourceKind: seed.kind, reason: suggestion.reason })
    }
    // A source with only saved/duplicate candidates must not consume a recommendation slot.
    if (ranked.size > priorCount && ++used === 2) break
  }
  const order = [...ranked.values()].sort((a, b) => b.score - a.score || a.ref.id - b.ref.id).slice(0, 24)
  const cards = await itemCards(order.map((entry) => entry.ref))
  // A preference changed during calculation must close this private result too.
  const stillEnabled = await db.user.findUnique({ where: { id: userId }, select: { recommendationOptIn: true, recommendationListeningOptIn: true } })
  if (!stillEnabled?.recommendationOptIn) return { available: true, enabled: false, items: [] }
  // Listening consent withdrawn meanwhile: nothing derived from listening is shown.
  const listeningStillOn = stillEnabled.recommendationListeningOptIn
  if (!await available()) return { available: false, enabled: false, items: [] }
  return { available: true, enabled: true, items: order.flatMap((entry) => {
    const item = cards.get(itemKey(entry.ref))
    return item && (entry.sourceKind !== 'listen' || listeningStillOn) ? [{ item, sourceTitle: entry.sourceTitle, sourceKind: entry.sourceKind, reason: entry.reason }] : []
  }).slice(0, Math.max(1, Math.min(12, Math.trunc(take) || 6))) }
}
