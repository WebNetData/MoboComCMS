import { db } from '@/platform/database/prisma'

export type StudioRecommendation = { id: number; name: string; logo: string; reason: string }

const genresOf = (value: string) => String(value || '').split(/[,،]/).map((part) => part.trim()).filter(Boolean)
const live = (now: Date) => ({ status: 'PUBLISHED', publishedAt: { lte: now } })

/** Explainable topic overlap. Scores use distinct topics, never mutable view totals. */
export async function recommendStudios(studioId: number, enabled: { games: boolean; software: boolean }, take = 6): Promise<StudioRecommendation[]> {
  if (!Number.isSafeInteger(studioId) || studioId < 1 || (!enabled.games && !enabled.software)) return []
  const now = new Date()
  const owner = { OR: [{ developerStudioId: studioId }, { publisherStudioId: studioId }] }
  const [ownGames, ownSoftware] = await Promise.all([
    enabled.games ? db.gameTitle.findMany({ where: { ...live(now), ...owner }, orderBy: { publishedAt: 'desc' }, take: 60, select: { genres: true } }) : [],
    enabled.software ? db.softwareTitle.findMany({ where: { ...live(now), ...owner }, orderBy: { publishedAt: 'desc' }, take: 60, select: { category: true } }) : [],
  ])
  const gameTopics = new Map<string, string>()
  for (const game of ownGames) for (const genre of genresOf(game.genres)) if (!gameTopics.has(genre.toLowerCase())) gameTopics.set(genre.toLowerCase(), genre)
  const softwareTopics = new Map<string, string>()
  for (const software of ownSoftware) if (software.category.trim() && !softwareTopics.has(software.category.trim().toLowerCase())) softwareTopics.set(software.category.trim().toLowerCase(), software.category.trim())
  const genres = [...gameTopics.values()].slice(0, 8)
  const categories = [...softwareTopics.values()].slice(0, 8)
  if (!genres.length && !categories.length) return []
  const [games, software] = await Promise.all([
    genres.length ? db.gameTitle.findMany({ where: { ...live(now), OR: genres.map((genre) => ({ genres: { contains: genre } })) }, orderBy: { publishedAt: 'desc' }, take: 240, select: { genres: true, developerStudioId: true, publisherStudioId: true, publishedAt: true } }) : [],
    categories.length ? db.softwareTitle.findMany({ where: { ...live(now), category: { in: categories } }, orderBy: { publishedAt: 'desc' }, take: 240, select: { category: true, developerStudioId: true, publisherStudioId: true, publishedAt: true } }) : [],
  ])
  const candidates = new Map<number, { topics: Map<string, string>; recent: Date }>()
  function add(ids: (number | null)[], key: string, reason: string, at: Date) {
    for (const id of new Set(ids)) {
      if (!id || id === studioId) continue
      const entry = candidates.get(id) || { topics: new Map<string, string>(), recent: at }
      entry.topics.set(key, reason)
      if (at > entry.recent) entry.recent = at
      candidates.set(id, entry)
    }
  }
  for (const game of games) for (const genre of genresOf(game.genres)) {
    if (game.developerStudioId === studioId || game.publisherStudioId === studioId) continue
    const match = gameTopics.get(genre.toLowerCase())
    if (match) add([game.developerStudioId, game.publisherStudioId], `game:${match.toLowerCase()}`, `بازی‌های هم‌سبک: ${match}`, game.publishedAt)
  }
  for (const app of software) {
    if (app.developerStudioId === studioId || app.publisherStudioId === studioId) continue
    const match = softwareTopics.get(app.category.toLowerCase())
    if (match) add([app.developerStudioId, app.publisherStudioId], `software:${match.toLowerCase()}`, `نرم‌افزارهای هم‌دسته: ${match}`, app.publishedAt)
  }
  const ranked = [...candidates].sort((a, b) => b[1].topics.size - a[1].topics.size || b[1].recent.getTime() - a[1].recent.getTime() || a[0] - b[0]).slice(0, Math.max(1, Math.min(12, Math.trunc(take) || 6)))
  if (!ranked.length) return []
  const studios = await db.studio.findMany({ where: { id: { in: ranked.map(([id]) => id) } }, select: { id: true, name: true, logo: true } })
  const byId = new Map(studios.map((studio) => [studio.id, studio]))
  return ranked.flatMap(([id, score]) => {
    const studio = byId.get(id)
    return studio ? [{ ...studio, reason: score.topics.values().next().value || 'محصولات مرتبط' }] : []
  })
}
