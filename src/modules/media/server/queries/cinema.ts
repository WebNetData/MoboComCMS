import { db } from '@/platform/database/prisma'
import { CALENDAR_PAGE, calendarPage, groupByDay, groupDays, normalizeWhen, type CalendarEpisode, type CalendarFilm } from '@/modules/cinema/domain/calendar'
import { parseJsonList, splitList } from '@/modules/media/domain/media'
import { plainText } from '@/shared/text/plain'
import { renderEditorialText } from '@/shared/content/sanitize'
import { relatedCinema } from '@/modules/recommendations/server/contextual'
import { allOrEmpty } from '@/modules/media/server/queries/music'
import { PAGE_SIZE, live, publishedNow } from '@/modules/media/server/queries/core'
import { countList } from '@/modules/media/server/queries/shared'
import { cinemaBrowsePage, cinemaPersonId } from '@/modules/cinema/domain/discovery'
import { canonicalPersonId } from '@/modules/cinema/server/people'
import { audienceClause, opensAudience } from '@/modules/account/server/item-audience'

export type TitleCard = {
  id: number; slug: string; kind: string; title: string; titleEn: string; originalTitle: string; poster: string; backdrop: string
  year: number | null; imdbRating: number | null; genres: string[]; quality: string; dubbed: boolean; subtitle: boolean
  access: string; runtime: number; summary: string; summaryEn: string; ageRating: string; seasonsCount: number
  recommendationReason?: string
  /** The managed format (film, series, anime…); null only for a title saved before formats existed. */
  format: { slug: string; name: string; nameEn: string; icon: string } | null
}

export type PublicLink = { id: number; label: string; kind: string; quality: string; size: string; platform: string; architecture: string; checksum: string; audio: string; subtitle: boolean; access: string }

export function toTitle(row: any): TitleCard {
  return {
    id: row.id, slug: row.slug, kind: row.kind, title: row.title, titleEn: row.titleEn, originalTitle: row.originalTitle, poster: row.poster, backdrop: row.backdrop || row.poster,
    year: row.year, imdbRating: row.imdbRating, genres: splitList(row.genres, 6), quality: row.quality, dubbed: row.dubbed, subtitle: row.subtitle,
    access: row.access, runtime: row.runtime, summary: plainText(row.summary), summaryEn: plainText(row.summaryEn), ageRating: row.ageRating, seasonsCount: row._count?.seasons ?? 0,
    format: row.format ? { slug: row.format.slug, name: row.format.name, nameEn: row.format.nameEn, icon: row.format.icon } : null,
  }
}

export const titleInclude = { _count: { select: { seasons: true } }, format: { select: { slug: true, name: true, nameEn: true, icon: true } } } as const

export async function publicLinks(ownerType: string, ids: number[]): Promise<Map<number, PublicLink[]>> {
  const map = new Map<number, PublicLink[]>()
  if (!ids.length) return map
  const rows = await db.mediaLink.findMany({ where: { ownerType, ownerId: { in: ids }, disabled: false }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, ownerId: true, label: true, kind: true, quality: true, size: true, platform: true, architecture: true, checksum: true, audio: true, subtitle: true, language: true, access: true } }).catch(() => [])
  for (const { ownerId, ...link } of rows) map.set(ownerId, [...(map.get(ownerId) || []), link])
  return map
}

/** Cinema home read model; layout options come from the cinema section settings. */
/** One shelf per active format the owner gave a home shelf, newest titles first, in the formats' order. */
async function formatShelves(take: number) {
  const formats = await db.cinemaFormat.findMany({ where: { active: true, homeShelf: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, slug: true, name: true, nameEn: true, plural: true, icon: true } }).catch(() => [])
  return Promise.all(formats.map(async ({ id, ...format }) => ({ ...format, titles: (await db.cinemaTitle.findMany({ where: { ...live(), formatId: id }, include: titleInclude, orderBy: { publishedAt: 'desc' }, take }).catch(() => [])).map(toTitle) })))
}

export async function getCinemaHome(opts: { shelfSize?: number; genreShelves?: number; topRatedMin?: number; heroIds?: number[] } = {}) {
  const take = Math.min(24, Math.max(6, opts.shelfSize || 16))
  const shelves = Math.min(6, Math.max(0, opts.genreShelves ?? 3))
  const heroIds = (opts.heroIds || []).slice(0, 8)
  const [featured, movies, series, topRated, members, dubbed, genreRows, picked] = await allOrEmpty([
    db.cinemaTitle.findMany({ where: { ...live(), featured: true }, include: titleInclude, orderBy: { publishedAt: 'desc' }, take: 6 }),
    db.cinemaTitle.findMany({ where: { ...live(), kind: 'MOVIE' }, include: titleInclude, orderBy: { publishedAt: 'desc' }, take }),
    db.cinemaTitle.findMany({ where: { ...live(), kind: 'SERIES' }, include: titleInclude, orderBy: { publishedAt: 'desc' }, take }),
    db.cinemaTitle.findMany({ where: { ...live(), imdbRating: opts.topRatedMin ? { gte: opts.topRatedMin } : { not: null } }, include: titleInclude, orderBy: { imdbRating: 'desc' }, take: Math.min(take, 10) }),
    db.cinemaTitle.findMany({ where: { ...live(), access: 'MEMBERS' }, include: titleInclude, orderBy: { publishedAt: 'desc' }, take }),
    db.cinemaTitle.findMany({ where: { ...live(), dubbed: true }, include: titleInclude, orderBy: { publishedAt: 'desc' }, take }),
    db.cinemaTitle.findMany({ where: live(), select: { genres: true }, take: 600 }),
    heroIds.length ? db.cinemaTitle.findMany({ where: { ...live(), id: { in: heroIds } }, include: titleInclude }) : Promise.resolve([]),
  ])
  const genres = countList(genreRows.map((row: { genres: string }) => row.genres)).slice(0, 16)
  const [genreShelves, formats] = await Promise.all([Promise.all(genres.slice(0, shelves).map(async (genre) => ({
    genre,
    titles: (await db.cinemaTitle.findMany({ where: { ...live(), genres: { contains: genre } }, include: titleInclude, orderBy: { publishedAt: 'desc' }, take }).catch(() => [])).map(toTitle),
  }))), formatShelves(take)])
  const byId = new Map(picked.map((row: any) => [row.id, row]))
  const chosen = heroIds.map((id) => byId.get(id)).filter(Boolean)
  const hero = chosen.length ? chosen : featured.length ? featured : [...movies, ...series].sort((a: any, b: any) => +b.publishedAt - +a.publishedAt).slice(0, 5)
  return {
    hero: hero.map(toTitle), movies: movies.map(toTitle), series: series.map(toTitle), topRated: topRated.map(toTitle),
    members: members.map(toTitle), dubbed: dubbed.map(toTitle), genres, genreShelves, formatShelves: formats,
  }
}

export async function browseCinema(input: { format?: string; kind?: string; genre?: string; year?: string; country?: string; dubbed?: string; sort?: string; q?: string; page?: number; ids?: number[]; actor?: string; director?: string; producer?: string }) {
  const page = cinemaBrowsePage(input.page)
  const where: any = { ...live(), ...(await audienceClause('title')) }
  // Each person filter matches that person's canonical profile (a merged alias leads to the person it joined).
  const canonical = (raw: string | undefined) => { const id = cinemaPersonId(raw); return id === null || id <= 0 ? Promise.resolve(id) : canonicalPersonId(id).then(found => found || id) }
  const [actor,director,producer] = await Promise.all([canonical(input.actor), canonical(input.director), canonical(input.producer)])
  const credits=[actor!==null?{credits:{some:{personId:actor,role:'CAST'}}}:null,director!==null?{credits:{some:{personId:director,role:'DIRECTOR'}}}:null,producer!==null?{credits:{some:{personId:producer,role:'PRODUCER'}}}:null].filter(Boolean)
  if(credits.length)where.AND=credits
  if (input.ids) where.id = { in: input.ids.slice(0, 5000) }
  if (input.kind === 'MOVIE' || input.kind === 'SERIES') where.kind = input.kind
  if (input.format && /^[a-z0-9-]{1,40}$/.test(input.format)) where.format = { slug: input.format }
  if (input.genre) where.genres = { contains: String(input.genre).slice(0, 60) }
  if (input.country) where.countries = { contains: String(input.country).slice(0, 60) }
  if (input.dubbed === '1') where.dubbed = true
  const year = Number(input.year)
  if (Number.isSafeInteger(year) && year > 1880) where.year = year
  const q = String(input.q || '').trim().slice(0, 80)
  if (q) where.OR = [{ title: { contains: q,mode:'insensitive' } }, { titleEn: { contains: q,mode:'insensitive' } }, { originalTitle: { contains: q,mode:'insensitive' } }, { director: { contains: q,mode:'insensitive' } }, { producer: { contains: q,mode:'insensitive' } }]
  const orderBy = input.sort === 'imdb' ? [{ imdbRating: 'desc' as const }] : input.sort === 'year' ? [{ year: 'desc' as const }] : input.sort === 'popular' ? [{ views: 'desc' as const }] : [{ publishedAt: 'desc' as const }]
  let unavailable=false
  const stableOrder=[...orderBy,{id:'desc' as const}]
  let [rows, total, facets] = await Promise.all([
    db.cinemaTitle.findMany({ where, include: titleInclude, orderBy:stableOrder, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.cinemaTitle.count({ where }),
    db.cinemaTitle.findMany({ where: live(), select: { genres: true, countries: true, year: true }, take: 1500 }),
  ]).catch(() => {unavailable=true;return [[], 0, []] as [any[], number, any[]]})
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE)),shownPage=Math.min(page,pages)
  if(shownPage!==page&&!unavailable)rows=await db.cinemaTitle.findMany({where,include:titleInclude,orderBy:stableOrder,skip:(shownPage-1)*PAGE_SIZE,take:PAGE_SIZE}).catch(()=>{unavailable=true;return []})
  return {
    titles: rows.map(toTitle), total, page:shownPage, pages, unavailable,
    genres: countList(facets.map((f: any) => f.genres)).slice(0, 40),
    countries: countList(facets.map((f: any) => f.countries)).slice(0, 40),
    years: [...new Set(facets.map((f: any) => f.year).filter(Boolean) as number[])].sort((a, b) => b - a).slice(0, 60),
  }
}

export async function getTitle(slug: string) {
  const row = await db.cinemaTitle.findFirst({ where: { slug, ...publishedNow() }, include: { ...titleInclude, seasons: { orderBy: { number: 'asc' }, include: { episodes: { orderBy: { number: 'asc' } } } } } }).catch(() => null)
  if (!row || !await opensAudience(row.audienceGroups, 'title')) return null
  await db.cinemaTitle.update({ where: { id: row.id }, data: { views: { increment: 1 } } }).catch(() => undefined)
  const episodeIds = row.seasons.flatMap((season) => season.episodes.map((episode) => episode.id))
  const [titleLinks, episodeLinks, recommendations] = await Promise.all([
    publicLinks('title', [row.id]),
    publicLinks('episode', episodeIds),
    relatedCinema(row),
  ])
  const similarRows = recommendations.length ? await db.cinemaTitle.findMany({ where: { ...live(), id: { in: recommendations.map((result) => result.item.id) } }, include: titleInclude }) : []
  const similarById = new Map(similarRows.map((item) => [item.id, item]))
  return {
    title: {
      ...toTitle(row), summaryHtml: renderEditorialText(row.summary), summaryEnHtml: renderEditorialText(row.summaryEn), endYear: row.endYear, imdbId: row.imdbId, countries: splitList(row.countries), languages: splitList(row.languages), director: row.director, producer: row.producer,
      cast: parseJsonList<{ name: string; role?: string; image?: string }>(row.cast), trailerUrl: row.trailerUrl, seriesStatus: row.seriesStatus, views: row.views, publishedAt: row.publishedAt,
    },
    links: titleLinks.get(row.id) || [],
    seasons: row.seasons.map((season) => ({
      id: season.id, number: season.number, name: season.name, poster: season.poster,
      episodes: season.episodes.map((episode) => ({ id: episode.id, number: episode.number, title: episode.title, titleEn: episode.titleEn, summary: plainText(episode.summary), summaryHtml: renderEditorialText(episode.summary), still: episode.still, runtime: episode.runtime, airDate: episode.airDate, access: episode.access, links: episodeLinks.get(episode.id) || [] })),
    })),
    similar: recommendations.flatMap((result) => { const item = similarById.get(result.item.id); return item ? [{ ...toTitle(item), recommendationReason: result.reason }] : [] }),
  }
}

/**
 * Episode calendar: episodes of published series by air time. "upcoming" is what has not aired yet,
 * soonest first; "recent" is what has, latest first. An episode without an air date is in neither.
 */
export async function episodeCalendar(input: { when?: unknown; page?: unknown }, now = new Date()) {
  const when = normalizeWhen(input.when)
  const page = calendarPage(input.page)
  const series = { season: { title: { status: 'PUBLISHED', publishedAt: { lte: now }, audienceGroups: '', kind: 'SERIES' } } }
  const where = { ...series, airDate: when === 'upcoming' ? { gt: now } : { lte: now } }
  const [rows, total, upcoming] = await Promise.all([
    db.cinemaEpisode.findMany({
      where, orderBy: [{ airDate: when === 'upcoming' ? 'asc' : 'desc' }, { id: 'asc' }], skip: (page - 1) * CALENDAR_PAGE, take: CALENDAR_PAGE,
      select: { id: true, number: true, title: true, titleEn: true, airDate: true, access: true, season: { select: { number: true, title: { select: { slug: true, title: true, titleEn: true, poster: true, access: true } } } } },
    }),
    db.cinemaEpisode.count({ where }),
    when === 'upcoming' ? Promise.resolve(-1) : db.cinemaEpisode.count({ where: { ...series, airDate: { gt: now } } }),
  ]).catch(() => [[], 0, 0] as [never[], number, number])
  const episodes: CalendarEpisode[] = rows.flatMap((row) => row.airDate ? [{
    id: row.id, at: row.airDate.toISOString(), season: row.season.number, number: row.number, title: row.title, titleEn: row.titleEn,
    members: row.access === 'MEMBERS' || row.season.title.access === 'MEMBERS',
    series: { slug: row.season.title.slug, title: row.season.title.title, titleEn: row.season.title.titleEn, poster: row.season.title.poster },
  }] : [])
  return { when, page, pages: Math.max(1, Math.ceil(total / CALENDAR_PAGE)), total, upcomingTotal: upcoming < 0 ? total : upcoming, days: groupByDay(episodes) }
}

/**
 * Film release calendar: published films with a release day, the ones opening next (soonest first) or the
 * ones that opened last (latest first), by day. A film without a release day is not on it.
 */
export async function filmCalendar(input: { when?: unknown; page?: unknown }, now = new Date()) {
  const when = normalizeWhen(input.when)
  const page = calendarPage(input.page)
  const films = { kind: 'MOVIE', status: 'PUBLISHED', publishedAt: { lte: now }, audienceGroups: '' }
  const where = { ...films, releaseDate: when === 'upcoming' ? { gt: now } : { lte: now } }
  const [rows, total, upcoming] = await Promise.all([
    db.cinemaTitle.findMany({
      where, orderBy: [{ releaseDate: when === 'upcoming' ? 'asc' : 'desc' }, { id: 'asc' }], skip: (page - 1) * CALENDAR_PAGE, take: CALENDAR_PAGE,
      select: { id: true, slug: true, title: true, titleEn: true, poster: true, year: true, access: true, releaseDate: true },
    }),
    db.cinemaTitle.count({ where }),
    when === 'upcoming' ? Promise.resolve(-1) : db.cinemaTitle.count({ where: { ...films, releaseDate: { gt: now } } }),
  ]).catch(() => [[], 0, 0] as [never[], number, number])
  const list: CalendarFilm[] = rows.flatMap((row) => row.releaseDate ? [{ id: row.id, at: row.releaseDate.toISOString(), slug: row.slug, title: row.title, titleEn: row.titleEn, poster: row.poster, year: row.year, members: row.access === 'MEMBERS' }] : [])
  return { when, page, pages: Math.max(1, Math.ceil(total / CALENDAR_PAGE)), total, upcomingTotal: upcoming < 0 ? total : upcoming, days: groupDays(list) }
}
