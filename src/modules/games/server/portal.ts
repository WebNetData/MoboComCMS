import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { isModuleEnabled } from '@/extensions/server/modules'
import { ratingsFor } from '@/modules/reviews/server/reviews'
import { gamePosts, getGamesHome, publicLinks, toGame, type GameCard } from '@/modules/media/server/queries'
import { calendarMonth, cleanReleases, memberScore, normalizeGamesSettings, type GamesSettings, type UpdateKind } from '@/modules/games/domain/games'
import { libraryCounts, libraryEntry, mostWanted } from '@/modules/games/server/library'

// Public read models of the GameUp-style games portal.

const SETTINGS_KEY = 'games.portal.v1'
const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() } })

export async function getGamesSettings(): Promise<GamesSettings> {
  return normalizeGamesSettings(await readJsonSetting(SETTINGS_KEY))
}

export async function saveGamesSettings(input: unknown): Promise<GamesSettings> {
  const next = normalizeGamesSettings(input)
  await writeJsonSetting(SETTINGS_KEY, next)
  return next
}

/** Member score for many games (reviews module, 5 stars → 10 points). */
export async function memberScores(games: { id: number; userScore: number | null }[]) {
  const map = new Map<number, { value: number | null; count: number }>()
  const rated = await isModuleEnabled('reviews') ? await ratingsFor(games.map((game) => ({ type: 'game' as const, id: game.id }))).catch(() => new Map()) : new Map()
  for (const game of games) {
    const row = rated.get(`game:${game.id}`)
    map.set(game.id, memberScore(row && row.average !== null ? { average: row.average, count: row.count } : null, game.userScore))
  }
  return map
}

type PostCard = { slug: string; title: string; excerpt: string; cover: string; publishedAt: Date; views: number; category: { name: string } | null }

/** Journal posts that name the game in their title (Persian or English name). */
async function newsAbout(names: string[], take = 6): Promise<PostCard[]> {
  const words = [...new Set(names.map((name) => name.trim()).filter((name) => name.length >= 3))]
  if (!words.length || !await isModuleEnabled('journal')) return []
  return db.post.findMany({
    where: { status: 'PUBLISHED', publishedAt: { lte: new Date() }, OR: words.map((word) => ({ title: { contains: word } })) },
    orderBy: { publishedAt: 'desc' }, take,
    select: { slug: true, title: true, excerpt: true, cover: true, publishedAt: true, views: true, category: { select: { name: true } } },
  }).catch(() => [])
}

export type PublicUpdate = { id: number; kind: UpdateKind; title: string; version: string; size: string; notes: string; releasedAt: string; links: Awaited<ReturnType<typeof publicLinks>> extends Map<number, infer L> ? L : never }

/** Everything the game page adds on top of the base read model. */
export async function gamePageExtras(game: { id: number; title: string; titleEn: string; userScore: number | null; franchiseId: number | null }, userId: number | null) {
  const settings = await getGamesSettings()
  const [franchise, updates, news, counts, mine, scores] = await Promise.all([
    game.franchiseId ? db.gameFranchise.findUnique({ where: { id: game.franchiseId }, include: { games: { where: { ...live(), id: { not: game.id } }, orderBy: { releaseDate: 'asc' }, take: 12 } } }).catch(() => null) : null,
    db.gameUpdate.findMany({ where: { gameId: game.id }, orderBy: { releasedAt: 'desc' }, take: 30 }).catch(() => []),
    newsAbout([game.title, game.titleEn]),
    settings.libraryEnabled ? libraryCounts(game.id) : null,
    settings.libraryEnabled ? libraryEntry(userId, game.id) : null,
    memberScores([game]),
  ])
  const links = await publicLinks('gameupdate', updates.map((update) => update.id))
  return {
    settings,
    franchise: franchise && { slug: franchise.slug, title: franchise.title, games: franchise.games.map(toGame) },
    updates: updates.map((update) => ({ id: update.id, kind: update.kind as UpdateKind, title: update.title, version: update.version, size: update.size, notes: update.notes, releasedAt: update.releasedAt.toISOString(), links: links.get(update.id) || [] })),
    news,
    library: counts && { counts, mine },
    member: scores.get(game.id) || { value: game.userScore, count: 0 },
  }
}

// ------------------------------------------------------------------ calendar

export type CalendarEntry = { day: string; platforms: string[]; game: GameCard }

/**
 * Release calendar for one Persian month: a game appears on each day one of
 * its platforms releases (per-platform dates first, else the main date).
 */
export async function releaseCalendar(monthParam: unknown, platform?: string) {
  const month = calendarMonth(monthParam)
  const filter = String(platform || '').trim().slice(0, 40)
  const rows = await db.gameTitle.findMany({
    where: { ...live(), OR: [{ releaseDate: { gte: month.start, lt: month.end } }, { releases: { not: '[]' } }], ...(filter ? { platforms: { contains: filter } } : {}) },
    take: 2000,
  }).catch(() => [])
  const entries: CalendarEntry[] = []
  const inMonth = (day: string) => day >= month.start.toISOString().slice(0, 10) && day < month.end.toISOString().slice(0, 10)
  for (const row of rows) {
    const card = toGame(row)
    let releases: { platform: string; date: string }[] = []
    try { releases = cleanReleases(row.releases) } catch { releases = [] }
    if (releases.length) {
      const byDay = new Map<string, string[]>()
      for (const release of releases) {
        if (!inMonth(release.date) || (filter && release.platform.toLowerCase() !== filter.toLowerCase())) continue
        byDay.set(release.date, [...(byDay.get(release.date) || []), release.platform])
      }
      for (const [day, platforms] of byDay) entries.push({ day, platforms, game: card })
    } else if (row.releaseDate && inMonth(row.releaseDate.toISOString().slice(0, 10))) {
      entries.push({ day: row.releaseDate.toISOString().slice(0, 10), platforms: filter ? [filter] : card.platforms, game: card })
    }
  }
  entries.sort((a, b) => a.day.localeCompare(b.day) || (b.game.featured ? 1 : 0) - (a.game.featured ? 1 : 0))
  const tba = await db.gameTitle.findMany({ where: { ...live(), releaseDate: null, ...(filter ? { platforms: { contains: filter } } : {}) }, orderBy: { publishedAt: 'desc' }, take: 12 }).catch(() => [])
  return { month, entries, tba: tba.map(toGame) }
}

/** The next releases (for the home rail and the calendar teaser). */
export async function upcomingReleases(take = 10) {
  const rows = await db.gameTitle.findMany({ where: { ...live(), releaseDate: { gt: new Date() } }, orderBy: { releaseDate: 'asc' }, take }).catch(() => [])
  return rows.map(toGame)
}

// ------------------------------------------------------------------ top lists

/** Ranked games by critic score for a (Gregorian) release year and platform. */
export async function topGames(input: { year?: string; platform?: string; by?: string }) {
  const year = /^\d{4}$/.test(String(input.year || '')) ? Number(input.year) : null
  const platform = String(input.platform || '').trim().slice(0, 40)
  const by = input.by === 'members' ? 'members' : 'critics'
  const where = {
    ...live(), releaseDate: year ? { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } : { lte: new Date() },
    ...(by === 'critics' ? { score: { not: null } } : {}),
    ...(platform ? { platforms: { contains: platform } } : {}),
  }
  const rows = await db.gameTitle.findMany({ where, orderBy: [{ score: 'desc' }, { views: 'desc' }], take: by === 'critics' ? 50 : 300 }).catch(() => [])
  const scores = await memberScores(rows)
  let list = rows.map((row) => ({ game: toGame(row), verdict: row.verdict, member: scores.get(row.id) || { value: null, count: 0 } }))
  if (by === 'members') list = list.filter((row) => row.member.value !== null).sort((a, b) => (b.member.value || 0) - (a.member.value || 0) || b.member.count - a.member.count).slice(0, 50)
  const years = await db.gameTitle.findMany({ where: { ...live(), releaseDate: { not: null, lte: new Date() } }, select: { releaseDate: true }, take: 5000 }).catch(() => [])
  return { year, platform, by, list, years: [...new Set(years.map((row) => row.releaseDate!.getUTCFullYear()))].sort((a, b) => b - a).slice(0, 12) }
}

// ------------------------------------------------------------------ franchises

export async function franchiseList() {
  const rows = await db.gameFranchise.findMany({ include: { games: { where: live(), orderBy: { releaseDate: 'desc' }, take: 1, select: { cover: true, backdrop: true } }, _count: { select: { games: { where: live() } } } }, orderBy: { title: 'asc' } }).catch(() => [])
  return rows.filter((row) => row._count.games > 0).map((row) => ({ slug: row.slug, title: row.title, titleEn: row.titleEn, image: row.image || row.games[0]?.backdrop || row.games[0]?.cover || '', count: row._count.games }))
}

export async function franchisePage(slug: string) {
  const row = await db.gameFranchise.findUnique({ where: { slug }, include: { games: { where: live(), orderBy: [{ releaseDate: 'asc' }, { id: 'asc' }] } } }).catch(() => null)
  if (!row || !row.games.length) return null
  const games = row.games.map(toGame)
  const scored = games.filter((game) => game.score !== null)
  return {
    franchise: { slug: row.slug, title: row.title, titleEn: row.titleEn, description: row.description, image: row.image || games[games.length - 1]?.backdrop || '' },
    games,
    average: scored.length ? Math.round(scored.reduce((sum, game) => sum + (game.score || 0), 0) / scored.length) : null,
    span: [games.find((game) => game.releaseDate)?.releaseDate, [...games].reverse().find((game) => game.releaseDate)?.releaseDate],
  }
}

// ------------------------------------------------------------------ home

/** Games home: the base catalogue plus editor picks, calendar, most wanted, franchises and news, in the admin's order. */
export async function gamesHome() {
  const settings = await getGamesSettings()
  const [base, editors, upcoming, wanted, franchises, heroRows] = await Promise.all([
    getGamesHome(),
    db.gameTitle.findMany({ where: { ...live(), editorsChoice: true }, orderBy: { publishedAt: 'desc' }, take: 12 }).catch(() => []),
    upcomingReleases(12),
    settings.libraryEnabled ? mostWanted(10) : [],
    franchiseList(),
    settings.heroIds.length ? db.gameTitle.findMany({ where: { ...live(), id: { in: settings.heroIds } } }).catch(() => []) : [],
  ])
  const heroById = new Map(heroRows.map((row) => [row.id, toGame(row)]))
  const hero = settings.heroIds.flatMap((id) => (heroById.has(id) ? [heroById.get(id)!] : []))
  const news = settings.rails.some((rail) => rail.key === 'news' && rail.enabled) && await isModuleEnabled('journal') ? await newsByKeywords(settings.newsKeywords) : []
  return { settings, base: { ...base, hero: hero.length ? hero : base.hero }, editors: editors.map(toGame), upcoming, wanted, franchises: franchises.slice(0, 12), news }
}

async function newsByKeywords(words: string[]) {
  if (!words.length) return gamePosts(9)
  const select = { slug: true, title: true, excerpt: true, cover: true, publishedAt: true, views: true, category: { select: { name: true } } } as const
  const rows = await db.post.findMany({ where: { status: 'PUBLISHED', publishedAt: { lte: new Date() }, cover: { not: '' }, OR: words.flatMap((word) => [{ category: { name: { contains: word } } }, { title: { contains: word } }]) }, orderBy: { publishedAt: 'desc' }, take: 9, select }).catch(() => [])
  return rows.length >= 3 ? rows : gamePosts(9)
}

