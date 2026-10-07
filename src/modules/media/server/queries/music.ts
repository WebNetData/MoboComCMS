import { db } from '@/platform/database/prisma'
import { parseJsonList } from '@/modules/media/domain/media'
import { plainText } from '@/shared/text/plain'
import { cleanRichText } from '@/shared/content/sanitize'
import { relatedAlbums, relatedTracks } from '@/modules/recommendations/server/contextual'
import { PAGE_SIZE, live } from '@/modules/media/server/queries/core'
import { countList } from '@/modules/media/server/queries/shared'

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

export const trackInclude = { artist: { select: artistSelect }, album: { select: { id: true, slug: true, title: true, titleEn: true, cover: true } } } as const

export function toTrack(row: any): TrackCard {
  return {
    id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn,
    cover: row.cover || row.album?.cover || row.artist?.image || '',
    duration: row.duration, genre: row.genre, access: row.access, plays: row.plays,
    hasAudio: !!row.audioUrl, hasHq: !!row.audioHqUrl, publishedAt: row.publishedAt,
    artist: row.artist, album: row.album ? { id: row.album.id, slug: row.album.slug, title: row.album.title, titleEn: row.album.titleEn } : null,
  }
}

export function toAlbum(row: any): AlbumCard {
  return { id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn, cover: row.cover || row.artist?.image || '', year: row.year, genre: row.genre, access: row.access, artist: row.artist, trackCount: row._count?.tracks ?? 0 }
}

function toPlaylist(row: any): PlaylistCard {
  return { id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn, cover: row.cover, description: plainText(row.description), access: row.access, trackCount: parseJsonList<number>(row.trackIds).length }
}

export const albumInclude = { artist: { select: artistSelect }, _count: { select: { tracks: true } } } as const

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
export function allOrEmpty<P extends readonly Promise<unknown>[]>(queries: [...P]): Promise<{ [K in keyof P]: Awaited<P[K]> }> {
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
