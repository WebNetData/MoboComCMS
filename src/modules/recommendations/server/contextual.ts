import { db } from '@/platform/database/prisma'
import { rankContextual, terms, type ContextualRecommendation } from '@/modules/recommendations/domain/contextual'

const live = (now: Date) => ({ status: 'PUBLISHED', publishedAt: { lte: now } })

type GameSource = { id: number; genres: string; platforms: string; developerStudioId: number | null; publisherStudioId: number | null }
type SoftwareSource = { id: number; category: string; platforms: string; developerStudioId: number | null; publisherStudioId: number | null }

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
