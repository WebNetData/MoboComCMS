import { db } from '@/platform/database/prisma'
import { itemCards, type ItemCard } from '@/modules/content/server/registry'
import { itemKey, parseItemKey, type ItemRef } from '@/modules/content/domain/items'
import { relatedAlbums, relatedCinema, relatedGames, relatedSoftware } from '@/modules/recommendations/server/contextual'

type Seed = { ref: ItemRef; kind: 'favorite' | 'view' | 'follow' }
type PersonalSuggestion = { item: ItemCard; sourceTitle: string; sourceKind: Seed['kind']; reason: string }

const supported = ['game', 'software', 'title', 'album']
const followedCreators = ['artist', 'studio']
const live = (now: Date) => ({ status: 'PUBLISHED', publishedAt: { lte: now } })
// Admin pause must take effect on the next request, including across separately bundled routes.
const available = async () => (await db.setting.findUnique({ where: { key: 'personalRecommendationsEnabled' }, select: { value: true } }))?.value !== 'false'

/** Private, bounded suggestions. No interaction history is read before explicit consent. */
export async function personalRecommendations(userId: number, take = 6): Promise<{ available: boolean; enabled: boolean; items: PersonalSuggestion[] }> {
  if (!Number.isSafeInteger(userId) || userId < 1) return { available: false, enabled: false, items: [] }
  if (!await available()) return { available: false, enabled: false, items: [] }
  const preference = await db.user.findUnique({ where: { id: userId }, select: { recommendationOptIn: true } })
  if (!preference?.recommendationOptIn) return { available: true, enabled: false, items: [] }

  const [follows, favorites, views] = await Promise.all([
    db.itemFavorite.findMany({ where: { userId, itemType: { in: followedCreators } }, orderBy: { createdAt: 'desc' }, take: 12, select: { itemType: true, itemId: true } }),
    db.itemFavorite.findMany({ where: { userId, itemType: { in: supported } }, orderBy: { createdAt: 'desc' }, take: 12, select: { itemType: true, itemId: true } }),
    db.userRecentView.findMany({ where: { userId, lastViewedAt: { gte: new Date(Date.now() - 180 * 86_400_000) } }, orderBy: { lastViewedAt: 'desc' }, take: 12, select: { itemType: true, itemId: true } }),
  ])
  const creatorSeeds: Seed[] = []
  const contentSeeds: Seed[] = []
  const seen = new Set<string>()
  for (const [kind, rows] of [['follow', follows], ['favorite', favorites], ['view', views]] as const) for (const row of rows) {
    const ref = parseItemKey(`${row.itemType}:${row.itemId}`)
    if (!ref) continue
    const key = itemKey(ref)
    if (!seen.has(key) && (kind === 'follow' ? followedCreators.includes(ref.type) : supported.includes(ref.type)))
      (kind === 'follow' ? creatorSeeds : contentSeeds).push({ ref, kind })
    seen.add(key)
  }
  // Reserve room for a followed creator even when newer content favorites fill the history window.
  const seeds = [creatorSeeds[0], contentSeeds[0], ...creatorSeeds.slice(1), ...contentSeeds.slice(1)].filter((seed): seed is Seed => !!seed)
  if (!seeds.length) return { available: true, enabled: true, items: [] }
  const sourceCards = await itemCards(seeds.map((seed) => seed.ref))
  const now = new Date()
  const ranked = new Map<string, { ref: ItemRef; score: number; sourceTitle: string; sourceKind: Seed['kind']; reason: string }>()
  let used = 0
  for (const seed of seeds) {
    const source = sourceCards.get(itemKey(seed.ref))
    if (!source) continue
    let suggestions: { item: ItemRef; score: number; reason: string }[]
    switch (seed.ref.type) {
      case 'artist': {
        const [albums, tracks] = await Promise.all([
          db.musicAlbum.findMany({ where: { artistId: seed.ref.id, ...live(now) }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 12, select: { id: true } }),
          db.musicTrack.findMany({ where: { artistId: seed.ref.id, ...live(now) }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 12, select: { id: true } }),
        ])
        suggestions = [
          ...albums.map((row) => ({ item: { type: 'album' as const, id: row.id }, score: 18, reason: 'از هنرمندی که دنبال می‌کنید' })),
          ...tracks.map((row) => ({ item: { type: 'track' as const, id: row.id }, score: 18, reason: 'از هنرمندی که دنبال می‌کنید' })),
        ]
        break
      }
      case 'studio': {
        const creator = { OR: [{ developerStudioId: seed.ref.id }, { publisherStudioId: seed.ref.id }], ...live(now) }
        const [games, software] = await Promise.all([
          db.gameTitle.findMany({ where: creator, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 12, select: { id: true } }),
          db.softwareTitle.findMany({ where: creator, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 12, select: { id: true } }),
        ])
        suggestions = [
          ...games.map((row) => ({ item: { type: 'game' as const, id: row.id }, score: 18, reason: 'از سازنده یا ناشری که دنبال می‌کنید' })),
          ...software.map((row) => ({ item: { type: 'software' as const, id: row.id }, score: 18, reason: 'از سازنده یا ناشری که دنبال می‌کنید' })),
        ]
        break
      }
      case 'game': {
        const row = await db.gameTitle.findFirst({ where: { id: seed.ref.id, ...live(now) }, select: { id: true, genres: true, platforms: true, developerStudioId: true, publisherStudioId: true } })
        suggestions = row ? await relatedGames(row, 12) : []
        break
      }
      case 'software': {
        const row = await db.softwareTitle.findFirst({ where: { id: seed.ref.id, ...live(now) }, select: { id: true, category: true, platforms: true, developerStudioId: true, publisherStudioId: true } })
        suggestions = row ? await relatedSoftware(row, 12) : []
        break
      }
      case 'title': {
        const row = await db.cinemaTitle.findFirst({ where: { id: seed.ref.id, ...live(now) }, select: { id: true, genres: true, kind: true } })
        suggestions = row ? await relatedCinema(row, 12) : []
        break
      }
      case 'album': {
        const row = await db.musicAlbum.findFirst({ where: { id: seed.ref.id, ...live(now) }, select: { id: true, genre: true, artistId: true } })
        suggestions = row ? await relatedAlbums(row, 12) : []
        break
      }
      default: continue
    }
    for (const suggestion of suggestions) {
      const key = itemKey(suggestion.item)
      if (seen.has(key)) continue
      const score = suggestion.score + (seed.kind === 'view' ? 0 : 3)
      const previous = ranked.get(key)
      if (!previous || score > previous.score) ranked.set(key, { ref: suggestion.item, score, sourceTitle: source.title, sourceKind: seed.kind, reason: suggestion.reason })
    }
    if (++used === 2) break
  }
  const order = [...ranked.values()].sort((a, b) => b.score - a.score || a.ref.id - b.ref.id).slice(0, 24)
  const cards = await itemCards(order.map((entry) => entry.ref))
  // A preference changed during calculation must close this private result too.
  const stillEnabled = await db.user.findUnique({ where: { id: userId }, select: { recommendationOptIn: true } })
  if (!stillEnabled?.recommendationOptIn) return { available: true, enabled: false, items: [] }
  if (!await available()) return { available: false, enabled: false, items: [] }
  return { available: true, enabled: true, items: order.flatMap((entry) => {
    const item = cards.get(itemKey(entry.ref))
    return item ? [{ item, sourceTitle: entry.sourceTitle, sourceKind: entry.sourceKind, reason: entry.reason }] : []
  }).slice(0, Math.max(1, Math.min(12, Math.trunc(take) || 6))) }
}
