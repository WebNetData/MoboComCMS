import { db } from '@/platform/database/prisma'
import { parseJsonList, parseJsonObject, splitList, type Requirements } from '@/modules/media/domain/media'
import { plainText } from '@/shared/text/plain'
import { relatedGames } from '@/modules/recommendations/server/contextual'
import { allOrEmpty } from '@/modules/media/server/queries/music'
import { PAGE_SIZE, live } from '@/modules/media/server/queries/core'
import { countList, countMap } from '@/modules/media/server/queries/shared'
import { publicLinks } from '@/modules/media/server/queries/cinema'

export type GameCard = {
  id: number; slug: string; title: string; titleEn: string; cover: string; backdrop: string; platforms: string[]; genres: string[]
  releaseDate: Date | null; score: number | null; userScore: number | null; access: string; summary: string; developer: string
  publisher: string; screenshots: string[]; featured: boolean; views: number; publishedAt: Date
  editorsChoice: boolean; localization: string[]
  recommendationReason?: string
}

export function toGame(row: any): GameCard {
  return {
    id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn, cover: row.cover, backdrop: row.backdrop || row.cover,
    platforms: splitList(row.platforms, 10), genres: splitList(row.genres, 6), releaseDate: row.releaseDate, score: row.score, userScore: row.userScore,
    access: row.access, summary: plainText(row.summary), developer: row.developer,
    publisher: row.publisher || '', featured: !!row.featured, views: row.views ?? 0, publishedAt: row.publishedAt,
    editorsChoice: !!row.editorsChoice, localization: splitList(row.localization, 3),
    screenshots: parseJsonList<{ src: string }>(row.screenshots || '[]').map((shot) => shot.src).filter(Boolean).slice(0, 4),
  }
}

export async function getGamesHome() {
  const now = new Date()
  const [featured, latest, topRated, upcoming, facetRows, popular, reviewed] = await allOrEmpty([
    db.gameTitle.findMany({ where: { ...live(), featured: true }, orderBy: { publishedAt: 'desc' }, take: 6 }),
    db.gameTitle.findMany({ where: live(), orderBy: { publishedAt: 'desc' }, take: 16 }),
    db.gameTitle.findMany({ where: { ...live(), score: { not: null } }, orderBy: { score: 'desc' }, take: 8 }),
    db.gameTitle.findMany({ where: { ...live(), releaseDate: { gt: now } }, orderBy: { releaseDate: 'asc' }, take: 8 }),
    db.gameTitle.findMany({ where: live(), select: { platforms: true, genres: true }, take: 800 }),
    db.gameTitle.findMany({ where: live(), orderBy: [{ views: 'desc' }], take: 16 }),
    db.gameTitle.findMany({ where: { ...live(), score: { not: null }, content: { not: '' } }, orderBy: { publishedAt: 'desc' }, take: 8 }),
  ])
  return {
    hero: (featured.length ? featured : latest.slice(0, 4)).map(toGame),
    latest: latest.map(toGame), topRated: topRated.map(toGame), upcoming: upcoming.map(toGame),
    popular: popular.map(toGame), reviewed: (reviewed.length ? reviewed : topRated).map(toGame), recommended: featured.map(toGame),
    platforms: countList(facetRows.map((row: any) => row.platforms)).slice(0, 12),
    platformCounts: countMap(facetRows.map((row: any) => row.platforms)),
    genres: countList(facetRows.map((row: any) => row.genres)).slice(0, 16),
  }
}

export async function browseGames(input: { platform?: string; genre?: string; developer?: string; publisher?: string; developerStudioId?: number; publisherStudioId?: number; sort?: string; q?: string; page?: number; ids?: number[]; lang?: string; mode?: string; year?: string; pick?: string }) {
  const page = Math.max(1, Math.min(500, Number(input.page) || 1))
  const where: any = { ...live() }
  // Any well-formed code of the owner's lists, matched as a whole item of the game's comma list.
  const hasCode = (code: string) => ({ OR: [{ equals: code }, { startsWith: `${code},` }, { endsWith: `, ${code}` }, { contains: `, ${code},` }] })
  const filters = [['localization', input.lang], ['modes', input.mode]].filter(([, code]) => code && /^[A-Z0-9_]{1,40}$/.test(code)).map(([field, code]) => ({ OR: hasCode(code!).OR.map((match) => ({ [field!]: match })) }))
  if (filters.length) where.AND = [...(where.AND || []), ...filters]
  if (input.pick === 'editors') where.editorsChoice = true
  if (input.pick === 'upcoming') where.releaseDate = { gt: new Date() }
  if (/^\d{4}$/.test(String(input.year || ''))) where.releaseDate = { gte: new Date(Date.UTC(Number(input.year), 0, 1)), lt: new Date(Date.UTC(Number(input.year) + 1, 0, 1)) }
  if (input.ids) where.id = { in: input.ids.slice(0, 5000) }
  if (input.developerStudioId && Number.isSafeInteger(input.developerStudioId) && input.developerStudioId > 0) where.developerStudioId = input.developerStudioId
  else if (input.developer) where.developer = String(input.developer).slice(0, 160)
  if (input.publisherStudioId && Number.isSafeInteger(input.publisherStudioId) && input.publisherStudioId > 0) where.publisherStudioId = input.publisherStudioId
  else if (input.publisher) where.publisher = String(input.publisher).slice(0, 160)
  if (input.platform) where.platforms = { contains: String(input.platform).slice(0, 40) }
  if (input.genre) where.genres = { contains: String(input.genre).slice(0, 40) }
  const q = String(input.q || '').trim().slice(0, 80)
  if (q) where.OR = [{ title: { contains: q } }, { titleEn: { contains: q } }, { developer: { contains: q } }]
  const orderBy = input.sort === 'score' ? [{ score: 'desc' as const }] : input.sort === 'release' ? [{ releaseDate: 'desc' as const }] : input.sort === 'views' ? [{ views: 'desc' as const }] : [{ publishedAt: 'desc' as const }]
  const [rows, total] = await Promise.all([
    db.gameTitle.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.gameTitle.count({ where }),
  ]).catch(() => [[], 0] as [any[], number])
  return { games: rows.map(toGame), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

/** Filter options for the games browser (developers and publishers with at least one game). */
export async function gameFacets() {
  const rows = await db.gameTitle.findMany({ where: live(), select: { platforms: true, genres: true, developer: true, publisher: true }, take: 3000 }).catch(() => [])
  return {
    platforms: countList(rows.map((row) => row.platforms)).slice(0, 16),
    genres: countList(rows.map((row) => row.genres)).slice(0, 30),
    developers: countList(rows.map((row) => row.developer)).slice(0, 40),
    publishers: countList(rows.map((row) => row.publisher)).slice(0, 40),
  }
}

/** Journal posts about games (categories named بازی/گیم/game), newest first; any posts as a fallback. */
export async function gamePosts(take = 9) {
  const select = { slug: true, title: true, excerpt: true, cover: true, publishedAt: true, views: true, category: { select: { name: true } } } as const
  const base = { status: 'PUBLISHED', publishedAt: { lte: new Date() }, cover: { not: '' } }
  const about = await db.post.findMany({ where: { ...base, OR: ['بازی', 'گیم', 'game', 'Game'].map((word) => ({ category: { name: { contains: word } } })) }, orderBy: { publishedAt: 'desc' }, take, select }).catch(() => [])
  return about.length >= 3 ? about : db.post.findMany({ where: base, orderBy: { publishedAt: 'desc' }, take, select }).catch(() => [])
}

export async function getGame(slug: string) {
  const row = await db.gameTitle.findFirst({ where: { slug, ...live() } }).catch(() => null)
  if (!row) return null
  await db.gameTitle.update({ where: { id: row.id }, data: { views: { increment: 1 } } }).catch(() => undefined)
  const [links, recommendations, releasedVersion, scheduledVersion] = await Promise.all([
    publicLinks('game', [row.id]),
    relatedGames(row),
    db.gameUpdate.findFirst({ where: { gameId: row.id, kind: { not: 'DLC' }, version: { not: '' }, releasedAt: { lte: new Date() } }, orderBy: { releasedAt: 'desc' }, select: { version: true } }),
    row.version ? db.gameUpdate.findFirst({ where: { gameId: row.id, version: row.version, kind: { not: 'DLC' }, releasedAt: { gt: new Date() } }, select: { id: true } }) : null,
  ])
  const relatedRows = recommendations.length ? await db.gameTitle.findMany({ where: { ...live(), id: { in: recommendations.map((result) => result.item.id) } } }) : []
  const relatedById = new Map(relatedRows.map((item) => [item.id, item]))
  // The public version follows the release clock, including updates that become due without an admin save.
  return {
    game: {
      ...toGame(row), publisher: row.publisher, developerStudioId: row.developerStudioId, publisherStudioId: row.publisherStudioId, ageRating: row.ageRating, trailerUrl: row.trailerUrl, content: row.content, views: row.views, publishedAt: row.publishedAt,
      screenshots: parseJsonList<{ src: string }>(row.screenshots).map((shot) => shot.src).filter(Boolean),
      pros: parseJsonList<{ text: string }>(row.pros).map((p) => p.text).filter(Boolean),
      cons: parseJsonList<{ text: string }>(row.cons).map((c) => c.text).filter(Boolean),
      requirements: parseJsonObject<Requirements>(row.requirements, { min: {}, rec: {} }),
      franchiseId: row.franchiseId, engine: row.engine, modes: splitList(row.modes, 4), releases: parseJsonList<{ platform: string; date: string }>(row.releases),
      playMain: row.playMain, playExtra: row.playExtra, playComplete: row.playComplete, storeLinks: parseJsonList<{ store: string; url: string }>(row.storeLinks),
      gameSize: row.gameSize, version: releasedVersion?.version || (scheduledVersion ? '' : row.version), verdict: row.verdict, seoTitle: row.seoTitle, seoDescription: row.seoDescription,
    },
    links: links.get(row.id) || [],
    related: recommendations.flatMap((result) => { const item = relatedById.get(result.item.id); return item ? [{ ...toGame(item), recommendationReason: result.reason }] : [] }),
  }
}
