import { db } from '@/platform/database/prisma'
import type { ItemType } from '@/modules/content/domain/items'
import type { RecommendationProvider } from '@/modules/recommendations/domain/provider'
import { relatedAlbums, relatedCinema, relatedGames, relatedSoftware, relatedTracks } from '@/modules/recommendations/server/contextual'

// The providers the site ships with: one per kind of item a suggestion can start from. They answer from
// the catalogue itself (shared style, creator, platform), so they need no history and no outside service.

const live = (now: Date) => ({ status: 'PUBLISHED', publishedAt: { lte: now }, audienceGroups: '' })
const FROM_ARTIST = 'از هنرمندی که دنبال می‌کنید'
const FROM_STUDIO = 'از سازنده یا ناشری که دنبال می‌کنید'

const BUILT_IN: RecommendationProvider[] = [
  {
    id: 'catalogue.artist', seedType: 'artist',
    suggest: async (seed, { now, take }) => {
      const [albums, tracks] = await Promise.all([
        db.musicAlbum.findMany({ where: { artistId: seed.id, ...live(now) }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take, select: { id: true } }),
        db.musicTrack.findMany({ where: {album: { isNot: { audienceGroups: { not: '' } } },  artistId: seed.id, ...live(now) }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take, select: { id: true } }),
      ])
      return [
        ...albums.map((row) => ({ item: { type: 'album' as const, id: row.id }, score: 18, reason: FROM_ARTIST })),
        ...tracks.map((row) => ({ item: { type: 'track' as const, id: row.id }, score: 18, reason: FROM_ARTIST })),
      ]
    },
  },
  {
    id: 'catalogue.studio', seedType: 'studio',
    suggest: async (seed, { now, take }) => {
      const creator = { OR: [{ developerStudioId: seed.id }, { publisherStudioId: seed.id }], ...live(now) }
      const [games, software] = await Promise.all([
        db.gameTitle.findMany({ where: creator, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take, select: { id: true } }),
        db.softwareTitle.findMany({ where: creator, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take, select: { id: true } }),
      ])
      return [
        ...games.map((row) => ({ item: { type: 'game' as const, id: row.id }, score: 18, reason: FROM_STUDIO })),
        ...software.map((row) => ({ item: { type: 'software' as const, id: row.id }, score: 18, reason: FROM_STUDIO })),
      ]
    },
  },
  {
    id: 'catalogue.game', seedType: 'game',
    suggest: async (seed, { now, take }) => {
      const row = await db.gameTitle.findFirst({ where: { id: seed.id, ...live(now) }, select: { id: true, genres: true, platforms: true, developerStudioId: true, publisherStudioId: true } })
      return row ? relatedGames(row, take) : []
    },
  },
  {
    id: 'catalogue.software', seedType: 'software',
    suggest: async (seed, { now, take }) => {
      const row = await db.softwareTitle.findFirst({ where: { id: seed.id, ...live(now) }, select: { id: true, category: true, platforms: true, developerStudioId: true, publisherStudioId: true } })
      return row ? relatedSoftware(row, take) : []
    },
  },
  {
    id: 'catalogue.title', seedType: 'title',
    suggest: async (seed, { now, take }) => {
      const row = await db.cinemaTitle.findFirst({ where: { id: seed.id, ...live(now) }, select: { id: true, genres: true, kind: true } })
      return row ? relatedCinema(row, take) : []
    },
  },
  {
    id: 'catalogue.album', seedType: 'album',
    suggest: async (seed, { now, take }) => {
      const row = await db.musicAlbum.findFirst({ where: { id: seed.id, ...live(now) }, select: { id: true, genre: true, artistId: true } })
      return row ? relatedAlbums(row, take) : []
    },
  },
  {
    id: 'catalogue.track', seedType: 'track',
    suggest: async (seed, { now, take }) => {
      const row = await db.musicTrack.findFirst({ where: {album: { isNot: { audienceGroups: { not: '' } } },  id: seed.id, ...live(now) }, select: { id: true, genre: true, artistId: true } })
      return row ? relatedTracks(row, take) : []
    },
  },
]

const registry = new Map<ItemType, RecommendationProvider>(BUILT_IN.map((provider) => [provider.seedType, provider]))

/** The provider that answers for a kind of item, or undefined when nothing can start from that kind. */
export const recommendationProvider = (type: ItemType) => registry.get(type)

/** The kinds a suggestion can start from, as the registry stands. */
export const recommendationSeedTypes = () => [...registry.keys()]

/**
 * Puts another provider in charge of its kind of item (a module, a plugin, a test). The engine around it
 * (consent, bounds, what the member has already seen, publication) stays the same. Returns a function that
 * puts the previous provider back.
 */
export function useRecommendationProvider(provider: RecommendationProvider): () => void {
  const previous = registry.get(provider.seedType)
  registry.set(provider.seedType, provider)
  return () => { if (previous) registry.set(provider.seedType, previous); else registry.delete(provider.seedType) }
}
