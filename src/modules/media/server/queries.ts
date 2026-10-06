import { db } from '@/platform/database/prisma'
import { CALENDAR_PAGE, calendarPage, groupByDay, normalizeWhen, type CalendarEpisode } from '@/modules/cinema/domain/calendar'
import { parseJsonList, parseJsonObject, splitList, type Requirements } from '@/modules/media/domain/media'
import { plainText } from '@/shared/text/plain'
import { cleanRichText } from '@/shared/content/sanitize'
import { currentSoftwareVersions, projectSoftwareVersion, type VersionProjection } from '@/modules/software/server/current-version'
import { relatedAlbums, relatedCinema, relatedGames, relatedSoftware, relatedTracks } from '@/modules/recommendations/server/contextual'
import type { Prisma } from '@prisma/client'

/**
 * Public read models for music, film & series and games. Raw media URLs never
 * leave the server: players and download buttons go through /api/media/*.
 */

const PAGE_SIZE = 24
const published = { status: 'PUBLISHED', publishedAt: { lte: new Date() } }
const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() } })

// ------------------------------------------------------------------ music

export type ArtistRef = { id: number; slug: string; name: string; nameEn: string; image: string }
export type TrackCard = {
  id: number; slug: string; title: string; titleEn: string; cover: string; duration: number; genre: string
  access: string; plays: number; hasAudio: boolean; hasHq: boolean; publishedAt: Date
  artist: ArtistRef; album: { id: number; slug: string; title: string; titleEn: string } | null
  recommendationReason?: string
}
export type AlbumCard = { id: number; slug: string; title: string; titleEn: string; cover: string; year: number | null; genre: string; access: string; artist: ArtistRef; trackCount: number; recommendationReason?: string }
export type PlaylistCard = { id: number; slug: string; title: string; titleEn: string; cover: string; description: string; access: string; trackCount: number }

const artistSelect = { id: true, slug: true, name: true, nameEn: true, image: true } as const
const trackInclude = { artist: { select: artistSelect }, album: { select: { id: true, slug: true, title: true, titleEn: true, cover: true } } } as const

export function toTrack(row: any): TrackCard {
  return {
    id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn,
    cover: row.cover || row.album?.cover || row.artist?.image || '',
    duration: row.duration, genre: row.genre, access: row.access, plays: row.plays,
    hasAudio: !!row.audioUrl, hasHq: !!row.audioHqUrl, publishedAt: row.publishedAt,
    artist: row.artist, album: row.album ? { id: row.album.id, slug: row.album.slug, title: row.album.title, titleEn: row.album.titleEn } : null,
  }
}
function toAlbum(row: any): AlbumCard {
  return { id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn, cover: row.cover || row.artist?.image || '', year: row.year, genre: row.genre, access: row.access, artist: row.artist, trackCount: row._count?.tracks ?? 0 }
}
function toPlaylist(row: any): PlaylistCard {
  return { id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn, cover: row.cover, description: plainText(row.description), access: row.access, trackCount: parseJsonList<number>(row.trackIds).length }
}

const albumInclude = { artist: { select: artistSelect }, _count: { select: { tracks: true } } } as const

const musicPage = (value: unknown) => Math.min(10_000, Math.max(1, Number.isSafeInteger(Number(value)) ? Number(value) : 1))
const musicSearch = (value: unknown) => String(value || '').trim().slice(0, 100)

export async function browseMusicArtists(input: { q?: string; page?: number }) {
  const page = musicPage(input.page)
  const q = musicSearch(input.q)
  const where = q ? { OR: [{ name: { contains: q } }, { nameEn: { contains: q } }, { slug: { contains: q.toLowerCase() } }] } : undefined
  const [rows, total] = await Promise.all([
    db.musicArtist.findMany({ where, select: artistSelect, orderBy: [{ featured: 'desc' }, { name: 'asc' }, { id: 'asc' }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.musicArtist.count({ where }),
  ])
  return { artists: rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

export async function browseMusicAlbums(input: { q?: string; page?: number }) {
  const page = musicPage(input.page)
  const q = musicSearch(input.q)
  const where = { ...live(), ...(q ? { OR: [{ title: { contains: q } }, { titleEn: { contains: q } }, { slug: { contains: q.toLowerCase() } }, { artist: { OR: [{ name: { contains: q } }, { nameEn: { contains: q } }] } }] } : {}) }
  const [rows, total] = await Promise.all([
    db.musicAlbum.findMany({ where, include: albumInclude, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.musicAlbum.count({ where }),
  ])
  return { albums: rows.map(toAlbum), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

export async function browseMusicPlaylists(input: { q?: string; page?: number }) {
  const page = musicPage(input.page)
  const q = musicSearch(input.q)
  const where = { status: 'PUBLISHED', ...(q ? { OR: [{ title: { contains: q } }, { titleEn: { contains: q } }, { slug: { contains: q.toLowerCase() } }] } : {}) }
  const [rows, total] = await Promise.all([
    db.musicPlaylist.findMany({ where, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { id: 'desc' }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.musicPlaylist.count({ where }),
  ])
  return { playlists: rows.map(toPlaylist), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

/** Media tables can be missing on older databases: render an empty section instead of an error page, keeping row types. */
function allOrEmpty<P extends readonly Promise<unknown>[]>(queries: [...P]): Promise<{ [K in keyof P]: Awaited<P[K]> }> {
  return Promise.all(queries).catch(() => queries.map(() => [])) as Promise<{ [K in keyof P]: Awaited<P[K]> }>
}

/** Music home read model; layout options come from the music section settings. */
export async function getMusicHome(opts: { latestSize?: number; chartSize?: number; chartSource?: 'plays' | 'downloads' | 'recent'; heroTrackIds?: number[]; featuredAlbumIds?: number[] } = {}) {
  const latestTake = Math.min(30, Math.max(6, opts.latestSize || 12))
  const chartTake = Math.min(30, Math.max(5, opts.chartSize || 10))
  const chartOrder = opts.chartSource === 'downloads' ? [{ downloads: 'desc' as const }, { publishedAt: 'desc' as const }] : opts.chartSource === 'recent' ? [{ publishedAt: 'desc' as const }] : [{ plays: 'desc' as const }, { publishedAt: 'desc' as const }]
  const heroIds = (opts.heroTrackIds || []).slice(0, 5)
  const albumIds = (opts.featuredAlbumIds || []).slice(0, 12)
  const [featuredAlbums, latestTracks, topTracks, latestAlbums, artists, playlists, genreRows, featuredTracks, pickedTracks, pickedAlbums] = await allOrEmpty([
    db.musicAlbum.findMany({ where: { ...live(), featured: true }, include: albumInclude, orderBy: { publishedAt: 'desc' }, take: 6 }),
    db.musicTrack.findMany({ where: live(), include: trackInclude, orderBy: { publishedAt: 'desc' }, take: Math.max(20, latestTake) }),
    db.musicTrack.findMany({ where: live(), include: trackInclude, orderBy: chartOrder, take: chartTake }),
    db.musicAlbum.findMany({ where: live(), include: albumInclude, orderBy: { publishedAt: 'desc' }, take: 12 }),
    db.musicArtist.findMany({ orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }], select: artistSelect, take: 14 }),
    db.musicPlaylist.findMany({ where: { status: 'PUBLISHED' }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }], take: 8 }),
    db.musicTrack.findMany({ where: live(), select: { genre: true }, take: 500, orderBy: { publishedAt: 'desc' } }),
    db.musicTrack.findMany({ where: { ...live(), featured: true }, include: trackInclude, orderBy: { publishedAt: 'desc' }, take: 8 }),
    heroIds.length ? db.musicTrack.findMany({ where: { ...live(), id: { in: heroIds } }, include: trackInclude }) : Promise.resolve([]),
    albumIds.length ? db.musicAlbum.findMany({ where: { ...live(), id: { in: albumIds } }, include: albumInclude }) : Promise.resolve([]),
  ])
  const genres = countList(genreRows.map((row: { genre: string }) => row.genre)).slice(0, 14)
  const inOrder = <T extends { id: number }>(ids: number[], rows: T[]) => { const byId = new Map(rows.map((row) => [row.id, row])); return ids.map((id) => byId.get(id)).filter((row): row is T => !!row) }
  const heroPicked = inOrder(heroIds, pickedTracks as any[])
  const albumsPicked = inOrder(albumIds, pickedAlbums as any[])
  return {
    featuredAlbums: albumsPicked.length ? albumsPicked.map(toAlbum) : featuredAlbums.length ? featuredAlbums.map(toAlbum) : latestAlbums.slice(0, 5).map(toAlbum),
    featuredTracks: (heroPicked.length ? heroPicked : featuredTracks).map(toTrack),
    heroPicked: heroPicked.length > 0,
    latestTracks: latestTracks.map(toTrack),
    latestSize: latestTake,
    topTracks: topTracks.map(toTrack),
    latestAlbums: latestAlbums.map(toAlbum),
    artists: artists as ArtistRef[],
    playlists: playlists.map(toPlaylist),
    genres,
  }
}

/** `ids`, when given, narrows the songs to those (a language's songs); an empty list means none, not all. */
export async function browseMusic(input: { q?: string; genre?: string; sort?: string; page?: number; ids?: number[] | null }) {
  const page = Math.max(1, Math.min(500, Number(input.page) || 1))
  const q = String(input.q || '').trim().slice(0, 80)
  const where: any = { ...live() }
  if (input.genre) where.genre = { contains: String(input.genre).slice(0, 60) }
  if (input.ids) where.id = { in: input.ids.slice(0, 5000) }
  if (q) where.OR = [{ title: { contains: q } }, { titleEn: { contains: q } }, { artist: { name: { contains: q } } }, { artist: { nameEn: { contains: q } } }]
  const orderBy = input.sort === 'popular' ? [{ plays: 'desc' as const }] : [{ publishedAt: 'desc' as const }]
  const [rows, total] = await Promise.all([
    db.musicTrack.findMany({ where, include: trackInclude, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.musicTrack.count({ where }),
  ]).catch(() => [[], 0] as [any[], number])
  return { tracks: rows.map(toTrack), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

/** Albums filed under a music category (and its sub-categories). */
export async function albumsByIds(ids: number[], page = 1) {
  const current = Math.max(1, Math.min(500, Number(page) || 1))
  const where = { ...live(), id: { in: ids.slice(0, 5000) } }
  const [rows, total] = await Promise.all([
    db.musicAlbum.findMany({ where, include: albumInclude, orderBy: { publishedAt: 'desc' }, skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.musicAlbum.count({ where }),
  ]).catch(() => [[], 0] as [any[], number])
  return { albums: rows.map(toAlbum), total, page: current, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

/** Published songs among these ids, newest first: the archive of a language or dialect. */
export async function tracksByIds(ids: number[], page = 1) {
  const current = Math.max(1, Math.min(500, Number(page) || 1))
  const where = { ...live(), id: { in: ids.slice(0, 5000) } }
  const [rows, total] = await Promise.all([
    db.musicTrack.findMany({ where, include: trackInclude, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.musicTrack.count({ where }),
  ]).catch(() => [[], 0] as [any[], number])
  return { tracks: rows.map(toTrack), total, page: current, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

export async function getMusicGenres(): Promise<string[]> {
  const rows = await db.musicTrack.findMany({ where: live(), select: { genre: true }, take: 800, orderBy: { publishedAt: 'desc' } }).catch(() => [])
  return countList(rows.map((row) => row.genre)).slice(0, 24)
}

export async function getTrack(slug: string, options: { recommendations?: boolean } = {}) {
  const row = await db.musicTrack.findFirst({ where: { slug, ...live() }, include: trackInclude }).catch(() => null)
  if (!row) return null
  const [albumTracks, artistTracks] = await Promise.all([
    row.albumId ? db.musicTrack.findMany({ where: { albumId: row.albumId, ...live() }, include: trackInclude, orderBy: [{ trackNo: 'asc' }, { id: 'asc' }], take: 50 }) : Promise.resolve([]),
    db.musicTrack.findMany({ where: { artistId: row.artistId, id: { not: row.id }, ...live() }, include: trackInclude, orderBy: { plays: 'desc' }, take: 8 }),
  ])
  const recommendations = options.recommendations ? await relatedTracks(row, 8, albumTracks.map(track => track.id)) : []
  const relatedRows = recommendations.length ? await db.musicTrack.findMany({ where: { ...live(), id: { in: recommendations.map(result => result.item.id) } }, include: trackInclude }) : []
  const relatedById = new Map(relatedRows.map(item => [item.id, item]))
  return { track: { ...toTrack(row), lyrics: row.lyrics, downloads: row.downloads }, albumTracks: albumTracks.map(toTrack), moreFromArtist: artistTracks.map(toTrack), relatedTracks: recommendations.flatMap(result => { const item = relatedById.get(result.item.id); return item ? [{ ...toTrack(item), recommendationReason: result.reason }] : [] }) }
}

export async function getAlbum(slug: string) {
  const row = await db.musicAlbum.findFirst({ where: { slug, ...live() }, include: albumInclude }).catch(() => null)
  if (!row) return null
  await db.musicAlbum.update({ where: { id: row.id }, data: { views: { increment: 1 } } }).catch(() => undefined)
  const [tracks, recommendations] = await Promise.all([
    db.musicTrack.findMany({ where: { albumId: row.id, ...live() }, include: trackInclude, orderBy: [{ trackNo: 'asc' }, { id: 'asc' }] }),
    relatedAlbums(row),
  ])
  const relatedRows = recommendations.length ? await db.musicAlbum.findMany({ where: { ...live(), id: { in: recommendations.map((result) => result.item.id) } }, include: albumInclude }) : []
  const relatedById = new Map(relatedRows.map((item) => [item.id, item]))
  return { album: { ...toAlbum(row), description: cleanRichText(row.description), publishedAt: row.publishedAt }, tracks: tracks.map(toTrack), related: recommendations.flatMap((result) => { const item = relatedById.get(result.item.id); return item ? [{ ...toAlbum(item), recommendationReason: result.reason }] : [] }) }
}

export async function getArtist(slug: string) {
  const row = await db.musicArtist.findUnique({ where: { slug } }).catch(() => null)
  if (!row) return null
  const [albums, tracks] = await Promise.all([
    db.musicAlbum.findMany({ where: { artistId: row.id, ...live() }, include: albumInclude, orderBy: { publishedAt: 'desc' } }),
    db.musicTrack.findMany({ where: { artistId: row.id, ...live() }, include: trackInclude, orderBy: [{ plays: 'desc' }, { publishedAt: 'desc' }], take: 30 }),
  ])
  return { artist: { ...row, bio: cleanRichText(row.bio) }, albums: albums.map(toAlbum), tracks: tracks.map(toTrack) }
}

export async function getPlaylist(slug: string) {
  const row = await db.musicPlaylist.findFirst({ where: { slug, status: 'PUBLISHED' } }).catch(() => null)
  if (!row) return null
  const ids = parseJsonList<number>(row.trackIds).map(Number).filter(Number.isSafeInteger)
  const rows = ids.length ? await db.musicTrack.findMany({ where: { id: { in: ids }, ...live() }, include: trackInclude }) : []
  const byId = new Map(rows.map((r) => [r.id, r]))
  return { playlist: toPlaylist(row), tracks: ids.flatMap((id) => (byId.has(id) ? [toTrack(byId.get(id))] : [])) }
}

// ------------------------------------------------------------------ cinema

export type TitleCard = {
  id: number; slug: string; kind: string; title: string; titleEn: string; originalTitle: string; poster: string; backdrop: string
  year: number | null; imdbRating: number | null; genres: string[]; quality: string; dubbed: boolean; subtitle: boolean
  access: string; runtime: number; summary: string; summaryEn: string; ageRating: string; seasonsCount: number
  recommendationReason?: string
}
export type PublicLink = { id: number; label: string; kind: string; quality: string; size: string; platform: string; architecture: string; checksum: string; audio: string; subtitle: boolean; access: string }

function toTitle(row: any): TitleCard {
  return {
    id: row.id, slug: row.slug, kind: row.kind, title: row.title, titleEn: row.titleEn, originalTitle: row.originalTitle, poster: row.poster, backdrop: row.backdrop || row.poster,
    year: row.year, imdbRating: row.imdbRating, genres: splitList(row.genres, 6), quality: row.quality, dubbed: row.dubbed, subtitle: row.subtitle,
    access: row.access, runtime: row.runtime, summary: plainText(row.summary), summaryEn: plainText(row.summaryEn), ageRating: row.ageRating, seasonsCount: row._count?.seasons ?? 0,
  }
}
const titleInclude = { _count: { select: { seasons: true } } } as const

export async function publicLinks(ownerType: string, ids: number[]): Promise<Map<number, PublicLink[]>> {
  const map = new Map<number, PublicLink[]>()
  if (!ids.length) return map
  const rows = await db.mediaLink.findMany({ where: { ownerType, ownerId: { in: ids }, disabled: false }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, ownerId: true, label: true, kind: true, quality: true, size: true, platform: true, architecture: true, checksum: true, audio: true, subtitle: true, access: true } }).catch(() => [])
  for (const { ownerId, ...link } of rows) map.set(ownerId, [...(map.get(ownerId) || []), link])
  return map
}

/** Cinema home read model; layout options come from the cinema section settings. */
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
  const genreShelves = await Promise.all(genres.slice(0, shelves).map(async (genre) => ({
    genre,
    titles: (await db.cinemaTitle.findMany({ where: { ...live(), genres: { contains: genre } }, include: titleInclude, orderBy: { publishedAt: 'desc' }, take }).catch(() => [])).map(toTitle),
  })))
  const byId = new Map(picked.map((row: any) => [row.id, row]))
  const chosen = heroIds.map((id) => byId.get(id)).filter(Boolean)
  const hero = chosen.length ? chosen : featured.length ? featured : [...movies, ...series].sort((a: any, b: any) => +b.publishedAt - +a.publishedAt).slice(0, 5)
  return {
    hero: hero.map(toTitle), movies: movies.map(toTitle), series: series.map(toTitle), topRated: topRated.map(toTitle),
    members: members.map(toTitle), dubbed: dubbed.map(toTitle), genres, genreShelves,
  }
}

export async function browseCinema(input: { kind?: string; genre?: string; year?: string; country?: string; dubbed?: string; sort?: string; q?: string; page?: number; ids?: number[] }) {
  const page = Math.max(1, Math.min(500, Number(input.page) || 1))
  const where: any = { ...live() }
  if (input.ids) where.id = { in: input.ids.slice(0, 5000) }
  if (input.kind === 'MOVIE' || input.kind === 'SERIES') where.kind = input.kind
  if (input.genre) where.genres = { contains: String(input.genre).slice(0, 60) }
  if (input.country) where.countries = { contains: String(input.country).slice(0, 60) }
  if (input.dubbed === '1') where.dubbed = true
  const year = Number(input.year)
  if (Number.isSafeInteger(year) && year > 1880) where.year = year
  const q = String(input.q || '').trim().slice(0, 80)
  if (q) where.OR = [{ title: { contains: q } }, { titleEn: { contains: q } }, { originalTitle: { contains: q } }, { director: { contains: q } }]
  const orderBy = input.sort === 'imdb' ? [{ imdbRating: 'desc' as const }] : input.sort === 'year' ? [{ year: 'desc' as const }] : input.sort === 'popular' ? [{ views: 'desc' as const }] : [{ publishedAt: 'desc' as const }]
  const [rows, total, facets] = await Promise.all([
    db.cinemaTitle.findMany({ where, include: titleInclude, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.cinemaTitle.count({ where }),
    db.cinemaTitle.findMany({ where: live(), select: { genres: true, countries: true, year: true }, take: 1500 }),
  ]).catch(() => [[], 0, []] as [any[], number, any[]])
  return {
    titles: rows.map(toTitle), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    genres: countList(facets.map((f: any) => f.genres)).slice(0, 40),
    countries: countList(facets.map((f: any) => f.countries)).slice(0, 40),
    years: [...new Set(facets.map((f: any) => f.year).filter(Boolean) as number[])].sort((a, b) => b - a).slice(0, 60),
  }
}

export async function getTitle(slug: string) {
  const row = await db.cinemaTitle.findFirst({ where: { slug, ...live() }, include: { ...titleInclude, seasons: { orderBy: { number: 'asc' }, include: { episodes: { orderBy: { number: 'asc' } } } } } }).catch(() => null)
  if (!row) return null
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
      ...toTitle(row), endYear: row.endYear, imdbId: row.imdbId, countries: splitList(row.countries), languages: splitList(row.languages), director: row.director,
      cast: parseJsonList<{ name: string; role?: string; image?: string }>(row.cast), trailerUrl: row.trailerUrl, seriesStatus: row.seriesStatus, views: row.views, publishedAt: row.publishedAt,
    },
    links: titleLinks.get(row.id) || [],
    seasons: row.seasons.map((season) => ({
      id: season.id, number: season.number, name: season.name, poster: season.poster,
      episodes: season.episodes.map((episode) => ({ id: episode.id, number: episode.number, title: episode.title, titleEn: episode.titleEn, summary: plainText(episode.summary), still: episode.still, runtime: episode.runtime, airDate: episode.airDate, access: episode.access, links: episodeLinks.get(episode.id) || [] })),
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
  const series = { season: { title: { status: 'PUBLISHED', publishedAt: { lte: now }, kind: 'SERIES' } } }
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

// ------------------------------------------------------------------ games

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
  if (input.lang && /^FA_(SUB|DUB|UI)$/.test(input.lang)) where.localization = { contains: input.lang }
  if (input.mode && /^(SINGLE|MULTI|COOP|ONLINE)$/.test(input.mode)) where.modes = { contains: input.mode }
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

// ------------------------------------------------------------------ software

export type SoftwareCard = {
  id: number; slug: string; title: string; titleEn: string; icon: string; cover: string; version: string; developer: string
  license: string; platforms: string[]; category: string; size: string; access: string; summary: string; downloads: number; views: number; publishedAt: Date; updatedAt: Date
  recommendationReason?: string
}
function toSoftware(source: any, versions: VersionProjection): SoftwareCard {
  const row = projectSoftwareVersion(source, versions)
  return {
    id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn, icon: row.icon, cover: row.cover || row.icon, version: row.version, developer: row.developer,
    license: row.license, platforms: splitList(row.platforms, 6), category: row.category, size: row.size, access: row.access, summary: plainText(row.summary), downloads: row.downloads,
    views: row.views ?? 0, publishedAt: row.publishedAt, updatedAt: row.updatedAt ?? row.publishedAt,
  }
}

const FEED_SIZE = 12

/** Paginated release archive. Only due versions of live parent titles qualify. */
export async function softwareReleaseFeed(input: { software?: string; channel?: string; platform?: string; architecture?: string; q?: string; page?: number }) {
  const now = new Date()
  const page = Math.max(1, Math.min(500, Number(input.page) || 1))
  const channel = ['STABLE', 'BETA', 'NIGHTLY'].includes(String(input.channel)) ? String(input.channel) : ''
  const platform = String(input.platform || '').trim().slice(0, 60)
  const architecture = String(input.architecture || '').trim().slice(0, 40)
  const q = String(input.q || '').trim().slice(0, 80)
  const where: Prisma.SoftwareReleaseWhereInput = {
    status: 'PUBLISHED', releasedAt: { lte: now },
    software: { status: 'PUBLISHED', publishedAt: { lte: now }, ...(input.software ? { slug: String(input.software).slice(0, 120) } : {}) },
    ...(channel ? { channel } : {}),
    ...(platform || architecture ? { targets: { some: { ...(platform ? { platform } : {}), ...(architecture ? { architecture } : {}) } } } : {}),
    ...(q ? { OR: [{ version: { contains: q } }, { software: { title: { contains: q } } }, { software: { titleEn: { contains: q } } }, { software: { developer: { contains: q } } }] } : {}),
  }
  const total = await db.softwareRelease.count({ where })
  const pages = Math.max(1, Math.ceil(total / 20))
  const currentPage = Math.min(page, pages)
  const rows = await db.softwareRelease.findMany({ where, include: { software: { select: { slug: true, title: true, titleEn: true, icon: true, summary: true, developer: true } }, targets: { orderBy: { id: 'asc' } } }, orderBy: [{ releasedAt: 'desc' }, { id: 'desc' }], skip: (currentPage - 1) * 20, take: 20 })
  return { items: rows.map((row) => ({ id: row.id, version: row.version, channel: row.channel, releasedAt: row.releasedAt, changelog: plainText(row.changelog).slice(0, 220), size: row.size, targets: row.targets.map(({ platform, architecture, minVersion }) => ({ platform, architecture, minVersion })), software: { ...row.software, summary: plainText(row.software.summary).slice(0, 160) } })), total, page: currentPage, pages }
}

/** One historical version, including protected file handles but never raw URLs. */
export async function getSoftwareRelease(slug: string, releaseId: number) {
  if (!Number.isSafeInteger(releaseId) || releaseId < 1) return null
  const now = new Date()
  const release = await db.softwareRelease.findFirst({
    where: { id: releaseId, status: 'PUBLISHED', releasedAt: { lte: now }, software: { slug, status: 'PUBLISHED', publishedAt: { lte: now } } },
    include: { software: { select: { id: true, slug: true, title: true, titleEn: true, icon: true, access: true, developer: true, developerStudioId: true, summary: true } }, targets: { orderBy: { id: 'asc' } } },
  })
  if (!release) return null
  const links = await publicLinks('softwarerelease', [release.id])
  return { id: release.id, version: release.version, channel: release.channel, changelog: release.changelog, requirements: release.requirements, screenshots: parseJsonList<{ src: string }>(release.screenshots).map((shot) => shot.src).filter(Boolean), size: release.size, checksum: release.checksum, releasedAt: release.releasedAt, targets: release.targets, software: { ...release.software, summary: plainText(release.software.summary) }, links: links.get(release.id) || [] }
}

/** Softgozar-style feed: newest updates first, filterable by platform, category, license and search. */
export async function softwareFeed(input: { platform?: string; category?: string; license?: string; developer?: string; publisher?: string; developerStudioId?: number; publisherStudioId?: number; sort?: string; q?: string; page?: number; ids?: number[] }) {
  const page = Math.max(1, Math.min(500, Number(input.page) || 1))
  const where: any = { ...live() }
  /** Items filed under a taxonomy term (and its sub-terms). */
  if (input.ids) where.id = { in: input.ids.slice(0, 5000) }
  if (input.platform) where.platforms = { contains: String(input.platform).slice(0, 40) }
  if (input.category) where.category = String(input.category).slice(0, 60)
  if (input.license) where.license = String(input.license).slice(0, 20)
  if (input.developerStudioId && Number.isSafeInteger(input.developerStudioId) && input.developerStudioId > 0) where.developerStudioId = input.developerStudioId
  else if (input.developer) where.developer = String(input.developer).slice(0, 160)
  if (input.publisherStudioId && Number.isSafeInteger(input.publisherStudioId) && input.publisherStudioId > 0) where.publisherStudioId = input.publisherStudioId
  else if (input.publisher) where.publisher = String(input.publisher).slice(0, 160)
  const q = String(input.q || '').trim().slice(0, 80)
  if (q) where.OR = [{ title: { contains: q } }, { titleEn: { contains: q } }, { developer: { contains: q } }, { category: { contains: q } }, { summary: { contains: q } }]
  const orderBy = input.sort === 'popular' ? [{ downloads: 'desc' as const }] : input.sort === 'views' ? [{ views: 'desc' as const }] : input.sort === 'name' ? [{ title: 'asc' as const }] : [{ updatedAt: 'desc' as const }]
  const [rows, total] = await Promise.all([
    db.softwareTitle.findMany({ where, orderBy, skip: (page - 1) * FEED_SIZE, take: FEED_SIZE }),
    db.softwareTitle.count({ where }),
  ]).catch(() => [[], 0] as [any[], number])
  const versions = await currentSoftwareVersions(rows.map((row) => row.id))
  return { items: rows.map((row) => toSoftware(row, versions)), total, page, pages: Math.max(1, Math.ceil(total / FEED_SIZE)) }
}

export type SoftwareTree = { platform: string; count: number; categories: { name: string; count: number }[] }[]

/** Sidebar: platform → category tree with counts, most viewed, most downloaded and today's updates. */
export async function softwareSidebar() {
  const since = new Date(Date.now() - 24 * 3600_000)
  const [facets, viewed, downloaded, today, total] = await allOrEmpty([
    db.softwareTitle.findMany({ where: live(), select: { platforms: true, category: true }, take: 5000 }),
    db.softwareTitle.findMany({ where: live(), orderBy: [{ views: 'desc' }], take: 8 }),
    db.softwareTitle.findMany({ where: live(), orderBy: [{ downloads: 'desc' }], take: 8 }),
    db.softwareTitle.findMany({ where: { ...live(), updatedAt: { gt: since } }, orderBy: [{ updatedAt: 'desc' }], take: 8 }),
    db.softwareTitle.count({ where: live() }),
  ])
  const tree = new Map<string, { count: number; categories: Map<string, number> }>()
  for (const row of facets as { platforms: string; category: string }[]) {
    for (const platform of splitList(row.platforms, 8)) {
      const node = tree.get(platform) || { count: 0, categories: new Map<string, number>() }
      node.count++
      if (row.category) node.categories.set(row.category, (node.categories.get(row.category) || 0) + 1)
      tree.set(platform, node)
    }
  }
  const order = ['Windows', 'macOS', 'Linux', 'Android', 'iOS']
  const platforms: SoftwareTree = [...tree.entries()]
    .sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99) || b[1].count - a[1].count)
    .map(([platform, node]) => ({ platform, count: node.count, categories: [...node.categories.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })) }))
  const versions = await currentSoftwareVersions([...viewed, ...downloaded, ...today].map((row) => row.id))
  return { tree: platforms, viewed: viewed.map((row) => toSoftware(row, versions)), downloaded: downloaded.map((row) => toSoftware(row, versions)), today: today.map((row) => toSoftware(row, versions)), total: Number(total) || 0 }
}

export async function getSoftwareHome() {
  const [featured, latest, popular, facetRows] = await allOrEmpty([
    db.softwareTitle.findMany({ where: { ...live(), featured: true }, orderBy: { publishedAt: 'desc' }, take: 6 }),
    db.softwareTitle.findMany({ where: live(), orderBy: [{ updatedAt: 'desc' }], take: 18 }),
    db.softwareTitle.findMany({ where: live(), orderBy: [{ downloads: 'desc' }, { publishedAt: 'desc' }], take: 10 }),
    db.softwareTitle.findMany({ where: live(), select: { platforms: true, category: true }, take: 1000 }),
  ])
  const versions = await currentSoftwareVersions([...featured, ...latest, ...popular].map((row) => row.id))
  return {
    featured: featured.map((row) => toSoftware(row, versions)), latest: latest.map((row) => toSoftware(row, versions)), popular: popular.map((row) => toSoftware(row, versions)),
    platforms: countList(facetRows.map((row: { platforms: string }) => row.platforms)).slice(0, 8),
    categories: countList(facetRows.map((row: { category: string }) => row.category)).slice(0, 16),
  }
}

export async function browseSoftware(input: { platform?: string; category?: string; license?: string; sort?: string; q?: string; page?: number }) {
  const page = Math.max(1, Math.min(500, Number(input.page) || 1))
  const where: any = { ...live() }
  if (input.platform) where.platforms = { contains: String(input.platform).slice(0, 40) }
  if (input.category) where.category = String(input.category).slice(0, 60)
  if (input.license) where.license = String(input.license).slice(0, 20)
  const q = String(input.q || '').trim().slice(0, 80)
  if (q) where.OR = [{ title: { contains: q } }, { titleEn: { contains: q } }, { developer: { contains: q } }, { category: { contains: q } }]
  const orderBy = input.sort === 'popular' ? [{ downloads: 'desc' as const }] : input.sort === 'name' ? [{ title: 'asc' as const }] : [{ updatedAt: 'desc' as const }]
  const [rows, total] = await Promise.all([
    db.softwareTitle.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.softwareTitle.count({ where }),
  ]).catch(() => [[], 0] as [any[], number])
  const versions = await currentSoftwareVersions(rows.map((row) => row.id))
  return { items: rows.map((row) => toSoftware(row, versions)), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

/** Header strip of the software portal: catalogue size, traffic, freshness and community. */
export async function softwareStats() {
  const [count, sums, last, reviews] = await allOrEmpty([
    db.softwareTitle.count({ where: live() }),
    db.softwareTitle.aggregate({ where: live(), _sum: { views: true, downloads: true } }),
    db.softwareTitle.findFirst({ where: live(), orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    db.itemReview.count({ where: { itemType: 'software', status: 'APPROVED' } }),
  ])
  const sum = (sums as { _sum?: { views: number | null; downloads: number | null } } | null)?._sum
  return {
    count: Number(count) || 0,
    traffic: (sum?.views || 0) + (sum?.downloads || 0),
    downloads: sum?.downloads || 0,
    updatedAt: (last as { updatedAt: Date } | null)?.updatedAt || null,
    reviews: Number(reviews) || 0,
  }
}

/** Editor picks for the “suggested” sidebar list (featured first, then most downloaded). */
export async function softwareSuggestions(take = 10, pickedIds: number[] = []) {
  if (pickedIds.length) {
    // Editor-picked list, in the admin's order; unpublished picks drop out.
    const picked = await db.softwareTitle.findMany({ where: { ...live(), id: { in: pickedIds.slice(0, take) } } }).catch(() => [])
    const byId = new Map(picked.map((row) => [row.id, row]))
    const ordered = pickedIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => !!row)
    if (ordered.length) { const versions = await currentSoftwareVersions(ordered.map((row) => row.id)); return ordered.map((row) => toSoftware(row, versions)) }
  }
  const rows = await db.softwareTitle.findMany({ where: live(), orderBy: [{ featured: 'desc' }, { downloads: 'desc' }], take }).catch(() => [])
  const versions = await currentSoftwareVersions(rows.map((row) => row.id))
  return rows.map((row) => toSoftware(row, versions))
}

/** Latest journal posts with a cover (the portal's “tech news” box). */
export async function techNews(take = 5) {
  return db.post.findMany({ where: { status: 'PUBLISHED', publishedAt: { lte: new Date() }, cover: { not: '' } }, orderBy: { publishedAt: 'desc' }, take, select: { slug: true, title: true, excerpt: true, cover: true, publishedAt: true, category: { select: { name: true } } } }).catch(() => [])
}

/** Newest software filed under the given ids (one home-page shelf per main category). */
export async function softwareShelf(ids: number[] | null, take = 8) {
  const rows = await db.softwareTitle.findMany({ where: { ...live(), ...(ids ? { id: { in: ids.slice(0, 5000) } } : {}) }, orderBy: { updatedAt: 'desc' }, take }).catch(() => [])
  const versions = await currentSoftwareVersions(rows.map((row) => row.id))
  return rows.map((row) => toSoftware(row, versions))
}

export async function getSoftware(slug: string) {
  const now = new Date()
  const row = await db.softwareTitle.findFirst({ where: { slug, ...live() } }).catch(() => null)
  if (!row) return null
  await db.softwareTitle.update({ where: { id: row.id }, data: { views: { increment: 1 } } }).catch(() => undefined)
  const [links, recommendations, releases] = await Promise.all([
    publicLinks('software', [row.id]),
    relatedSoftware(row),
    db.softwareRelease.findMany({ where: { softwareId: row.id, status: 'PUBLISHED', releasedAt: { lte: now } }, include: { targets: { orderBy: { id: 'asc' } } }, orderBy: [{ releasedAt: 'desc' }, { id: 'desc' }], take: 30 }).catch(() => []),
  ])
  const related = recommendations.length ? await db.softwareTitle.findMany({ where: { ...live(), id: { in: recommendations.map((result) => result.item.id) } } }) : []
  const versions = await currentSoftwareVersions([row.id, ...related.map((item) => item.id)], now)
  const relatedById = new Map(related.map((item) => [item.id, item]))
  const projected = projectSoftwareVersion(row, versions)
  const releaseLinks = await publicLinks('softwarerelease', releases.map((release) => release.id))
  return {
    software: {
      ...toSoftware(row, versions), publisher: row.publisher, developerStudioId: row.developerStudioId, publisherStudioId: row.publisherStudioId, website: row.website, requirements: row.requirements, content: row.content,
      changelog: projected.changelog, views: row.views,
      releasedAt: projected.releasedAt, updatedAt: projected.updatedAt,
      features: row.features || '', installGuide: row.installGuide || '', archivePassword: row.archivePassword || '',
      screenshots: parseJsonList<{ src: string }>(row.screenshots).map((shot) => shot.src).filter(Boolean),
    },
    links: links.get(row.id) || [],
    releases: releases.map((release) => ({ id: release.id, version: release.version, channel: release.channel, changelog: release.changelog, size: release.size, checksum: release.checksum, requirements: release.requirements, screenshots: parseJsonList<{ src: string }>(release.screenshots).map((shot) => shot.src).filter(Boolean), targets: release.targets, releasedAt: release.releasedAt, links: releaseLinks.get(release.id) || [] })),
    related: recommendations.flatMap((result) => { const item = relatedById.get(result.item.id); return item ? [{ ...toSoftware(item, versions), recommendationReason: result.reason }] : [] }),
  }
}

// ------------------------------------------------------------------ shared

/** "a, b" strings → distinct values ordered by frequency. */
function countMap(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const value of values) for (const part of splitList(value)) counts[part] = (counts[part] || 0) + 1
  return counts
}

function countList(values: string[]): string[] {
  const counts = new Map<string, number>()
  for (const value of values) for (const part of splitList(value)) counts.set(part, (counts.get(part) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

export { published as PUBLISHED_FILTER }

// ------------------------------------------------------------------ page builder feed

export type BuilderMediaFeed =
  | { kind: 'tracks'; items: TrackCard[] }
  | { kind: 'albums'; items: AlbumCard[] }
  | { kind: 'titles'; items: TitleCard[] }
  | { kind: 'games'; items: GameCard[] }

/** Data for the page-builder `media` widget. */
export async function getBuilderMedia(source: string, limit: number): Promise<BuilderMediaFeed> {
  const take = Math.max(1, Math.min(16, Math.round(limit) || 6))
  try {
    switch (source) {
      case 'music-new':
      case 'music-top':
        return { kind: 'tracks', items: (await db.musicTrack.findMany({ where: live(), include: trackInclude, orderBy: source === 'music-top' ? [{ plays: 'desc' }, { publishedAt: 'desc' }] : { publishedAt: 'desc' }, take })).map(toTrack) }
      case 'music-albums':
        return { kind: 'albums', items: (await db.musicAlbum.findMany({ where: live(), include: albumInclude, orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }], take })).map(toAlbum) }
      case 'cinema-movies':
      case 'cinema-series':
      case 'cinema-top':
      case 'cinema-dubbed':
      case 'cinema-vip': {
        const where: any = { ...live() }
        if (source === 'cinema-movies') where.kind = 'MOVIE'
        if (source === 'cinema-series') where.kind = 'SERIES'
        if (source === 'cinema-dubbed') where.dubbed = true
        if (source === 'cinema-vip') where.access = 'MEMBERS'
        if (source === 'cinema-top') where.imdbRating = { not: null }
        return { kind: 'titles', items: (await db.cinemaTitle.findMany({ where, include: titleInclude, orderBy: source === 'cinema-top' ? { imdbRating: 'desc' } : { publishedAt: 'desc' }, take })).map(toTitle) }
      }
      case 'games-new':
      case 'games-top':
        return { kind: 'games', items: (await db.gameTitle.findMany({ where: source === 'games-top' ? { ...live(), score: { not: null } } : live(), orderBy: source === 'games-top' ? { score: 'desc' } : { publishedAt: 'desc' }, take })).map(toGame) }
      default:
        return { kind: 'tracks', items: [] }
    }
  } catch {
    return { kind: 'tracks', items: [] }
  }
}
