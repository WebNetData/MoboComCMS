import { db } from '@/platform/database/prisma'
import { rankContextual, terms, type ContextualRecommendation } from '@/modules/recommendations/domain/contextual'

const live = (now: Date) => ({ status: 'PUBLISHED', publishedAt: { lte: now } })

type GameSource = { id: number; genres: string; platforms: string; developerStudioId: number | null; publisherStudioId: number | null }
type SoftwareSource = { id: number; category: string; platforms: string; developerStudioId: number | null; publisherStudioId: number | null }
type CinemaSource = { id: number; genres: string; kind: string }
type AlbumSource = { id: number; genre: string; artistId: number }
type TrackSource = { id: number; genre: string; artistId: number }

/** Game adapter: query a bounded public candidate pool, then rank exact shared terms. */
export async function relatedGames(source: GameSource, take = 8): Promise<ContextualRecommendation[]> {
  const now = new Date()
  const genres = terms(source.genres)
  const platforms = terms(source.platforms)
  const creators = [source.developerStudioId, source.publisherStudioId].filter((id): id is number => !!id)
  const matches = [
    ...genres.map((genre) => ({ genres: { contains: genre } })),
    ...(creators.length ? [{ developerStudioId: { in: creators } }, { publisherStudioId: { in: creators } }] : []),
    ...platforms.map((platform) => ({ platforms: { contains: platform } })),
  ]
  const rows = await db.gameTitle.findMany({ where: { ...live(now), id: { not: source.id }, ...(matches.length ? { OR: matches } : {}) }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 180, select: { id: true, genres: true, platforms: true, developerStudioId: true, publisherStudioId: true, publishedAt: true } })
  return rankContextual({ type: 'game', id: source.id, topics: genres, platforms, creators, publishedAt: now }, rows.map((row) => ({ id: row.id, topics: terms(row.genres), platforms: terms(row.platforms), creators: [row.developerStudioId, row.publisherStudioId], publishedAt: row.publishedAt })), take)
}

/** Software adapter: topic and shared Studio roles outrank a platform-only match. */
export async function relatedSoftware(source: SoftwareSource, take = 8): Promise<ContextualRecommendation[]> {
  const now = new Date()
  const category = source.category.trim()
  const platforms = terms(source.platforms)
  const creators = [source.developerStudioId, source.publisherStudioId].filter((id): id is number => !!id)
  const matches = [
    ...(category ? [{ category }] : []),
    ...(creators.length ? [{ developerStudioId: { in: creators } }, { publisherStudioId: { in: creators } }] : []),
    ...platforms.map((platform) => ({ platforms: { contains: platform } })),
  ]
  const rows = await db.softwareTitle.findMany({ where: { ...live(now), id: { not: source.id }, ...(matches.length ? { OR: matches } : {}) }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 180, select: { id: true, category: true, platforms: true, developerStudioId: true, publisherStudioId: true, publishedAt: true } })
  return rankContextual({ type: 'software', id: source.id, topics: category ? [category] : [], platforms, creators, publishedAt: now }, rows.map((row) => ({ id: row.id, topics: row.category.trim() ? [row.category.trim()] : [], platforms: terms(row.platforms), creators: [row.developerStudioId, row.publisherStudioId], publishedAt: row.publishedAt })), take)
}

/** Cinema adapter: shared genres lead, same film/series format fills the rail. */
export async function relatedCinema(source: CinemaSource, take = 12): Promise<ContextualRecommendation[]> {
  const now = new Date()
  const genres = terms(source.genres)
  const rows = await db.cinemaTitle.findMany({
    where: { ...live(now), id: { not: source.id }, OR: [{ kind: source.kind }, ...genres.map((genre) => ({ genres: { contains: genre } }))] },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 180,
    select: { id: true, genres: true, kind: true, publishedAt: true },
  })
  return rankContextual({ type: 'title', id: source.id, topics: genres, platforms: [], creators: [], kind: source.kind, publishedAt: now }, rows.map((row) => ({ id: row.id, topics: terms(row.genres), platforms: [], creators: [], kind: row.kind, publishedAt: row.publishedAt })), take)
}

/** Music adapter: related album genres and artist identity, without play/view counters. */
export async function relatedAlbums(source: AlbumSource, take = 8): Promise<ContextualRecommendation[]> {
  const now = new Date()
  const genres = terms(source.genre)
  const rows = await db.musicAlbum.findMany({
    where: { ...live(now), id: { not: source.id }, OR: [{ artistId: source.artistId }, ...genres.map((genre) => ({ genre: { contains: genre } }))] },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 180,
    select: { id: true, genre: true, artistId: true, publishedAt: true },
  })
  return rankContextual({ type: 'album', id: source.id, topics: genres, platforms: [], creators: [source.artistId], publishedAt: now }, rows.map((row) => ({ id: row.id, topics: terms(row.genre), platforms: [], creators: [row.artistId], publishedAt: row.publishedAt })), take)
}

/** Cross-artist genre discovery complements the existing more-from-artist track list. */
export async function relatedTracks(source: TrackSource, take = 8, excludedIds: readonly number[] = []): Promise<ContextualRecommendation[]> {
  const genres = terms(source.genre)
  if (!genres.length) return []
  const now = new Date()
  const insensitive = /^postgres(?:ql)?:/i.test(process.env.DATABASE_URL || '') ? { mode: 'insensitive' as const } : {}
  const rows = await db.musicTrack.findMany({
    where: { ...live(now), id: { notIn: [source.id, ...excludedIds.filter(id => Number.isSafeInteger(id) && id > 0).slice(0, 50)] }, artistId: { not: source.artistId }, OR: genres.map(genre => ({ genre: { contains: genre, ...insensitive } })) },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 180,
    select: { id: true, genre: true, artistId: true, publishedAt: true },
  })
  return rankContextual({ type: 'track', id: source.id, topics: genres, platforms: [], creators: [source.artistId], publishedAt: now }, rows.map(row => ({ id: row.id, topics: terms(row.genre), platforms: [], creators: [row.artistId], publishedAt: row.publishedAt })), take)
}
