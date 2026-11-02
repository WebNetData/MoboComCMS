import { db } from '@/platform/database/prisma'
import { parseJsonList } from '@/modules/media/domain/media'
import { plainText } from '@/shared/text/plain'
import { cleanRichText, renderEditorialText } from '@/shared/content/sanitize'
import { relatedAlbums, relatedTracks } from '@/modules/recommendations/server/contextual'
import { PAGE_SIZE, live, publishedNow, liveTrack } from '@/modules/media/server/queries/core'
import { countList } from '@/modules/media/server/queries/shared'
import { listLabels } from '@/modules/vocabulary/server/vocabulary'
import { audienceClause, opensAudience, opensItem } from '@/modules/account/server/item-audience'

export type CreditGroup = { role: string; name: string; artists: ArtistRef[] }
const ARTIST_REF = { id: true, slug: true, name: true, nameEn: true, image: true } as const

/** Credits grouped by role, in the CREDIT_ROLE list's order (a role no longer listed keeps its code as its name). */
async function creditGroups(trackId: number): Promise<CreditGroup[]> {
  const [credits, labels] = await Promise.all([
    db.musicCredit.findMany({ where: { trackId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { role: true, artist: { select: ARTIST_REF } } }).catch(() => []),
    listLabels('music'),
  ])
  const names = labels.CREDIT_ROLE ?? {}, order = Object.keys(names)
  const groups = new Map<string, CreditGroup>()
  for (const credit of credits) {
    const group = groups.get(credit.role) || { role: credit.role, name: names[credit.role] || credit.role, artists: [] }
    group.artists.push(credit.artist); groups.set(credit.role, group)
  }
  return [...groups.values()].sort((a, b) => (order.indexOf(a.role) + 1 || 99) - (order.indexOf(b.role) + 1 || 99))
}

export type ArtistRef = { id: number; slug: string; name: string; nameEn: string; image: string }

export type TrackCard = {
  id: number; slug: string; title: string; titleEn: string; cover: string; duration: number; genre: string
  access: string; plays: number; hasAudio: boolean; hasHq: boolean; publishedAt: Date
  artist: ArtistRef; album: { id: number; slug: string; title: string; titleEn: string } | null
  recommendationReason?: string
}

export type AlbumCard = { id: number; slug: string; title: string; titleEn: string; cover: string; year: number | null; genre: string; albumType: string; access: string; artist: ArtistRef; trackCount: number; recommendationReason?: string }

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
  return { id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn, cover: row.cover || row.artist?.image || '', year: row.year, genre: row.genre, albumType: row.albumType || 'ALBUM', access: row.access, artist: row.artist, trackCount: row._count?.tracks ?? 0 }
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
  const where = { mergedIntoId: null, ...(q ? { OR: [{ name: { contains: q } }, { nameEn: { contains: q } }, { slug: { contains: q.toLowerCase() } }, { aliases: { some: { OR: [{ name: { contains: q } }, { nameEn: { contains: q } }] } } }] } : {}) }
  const [rows, total] = await Promise.all([
    db.musicArtist.findMany({ where, select: artistSelect, orderBy: [{ featured: 'desc' }, { name: 'asc' }, { id: 'asc' }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.musicArtist.count({ where }),
  ])
  return { artists: rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

export async function browseMusicAlbums(input: { q?: string; page?: number }) {
  const page = musicPage(input.page)
  const q = musicSearch(input.q)
  const where = { ...live(), ...(await audienceClause('album')), ...(q ? { OR: [{ title: { contains: q } }, { titleEn: { contains: q } }, { slug: { contains: q.toLowerCase() } }, { artist: { OR: [{ name: { contains: q } }, { nameEn: { contains: q } }] } }] } : {}) }
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
    db.musicTrack.findMany({ where: liveTrack(), include: trackInclude, orderBy: { publishedAt: 'desc' }, take: Math.max(20, latestTake) }),
    db.musicTrack.findMany({ where: liveTrack(), include: trackInclude, orderBy: chartOrder, take: chartTake }),
    db.musicAlbum.findMany({ where: live(), include: albumInclude, orderBy: { publishedAt: 'desc' }, take: 12 }),
    // Everyone in «چهره‌ها» has a music artist (one profile for the site); the shelf shows those with music out.
    db.musicArtist.findMany({ where: { mergedIntoId: null, OR: [{ tracks: { some: liveTrack() } }, { albums: { some: live() } }, { credits: { some: { track: liveTrack() } } }] }, orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }], select: artistSelect, take: 14 }),
    db.musicPlaylist.findMany({ where: { status: 'PUBLISHED' }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }], take: 8 }),
    db.musicTrack.findMany({ where: liveTrack(), select: { genre: true }, take: 500, orderBy: { publishedAt: 'desc' } }),
    db.musicTrack.findMany({ where: { ...liveTrack(), featured: true }, include: trackInclude, orderBy: { publishedAt: 'desc' }, take: 8 }),
    heroIds.length ? db.musicTrack.findMany({ where: { ...liveTrack(), id: { in: heroIds } }, include: trackInclude }) : Promise.resolve([]),
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
  const where: any = { ...live(), ...(await audienceClause('track')) }
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
  const where = { ...live(), ...(await audienceClause('album')), id: { in: ids.slice(0, 5000) } }
  const [rows, total] = await Promise.all([
    db.musicAlbum.findMany({ where, include: albumInclude, orderBy: { publishedAt: 'desc' }, skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.musicAlbum.count({ where }),
  ]).catch(() => [[], 0] as [any[], number])
  return { albums: rows.map(toAlbum), total, page: current, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

/** Published songs among these ids, newest first: the archive of a language or dialect. */
export async function tracksByIds(ids: number[], page = 1) {
  const current = Math.max(1, Math.min(500, Number(page) || 1))
  const where = { ...liveTrack(), ...(await audienceClause('track')), id: { in: ids.slice(0, 5000) } }
  const [rows, total] = await Promise.all([
    db.musicTrack.findMany({ where, include: trackInclude, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.musicTrack.count({ where }),
  ]).catch(() => [[], 0] as [any[], number])
  return { tracks: rows.map(toTrack), total, page: current, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

export async function getMusicGenres(): Promise<string[]> {
  const rows = await db.musicTrack.findMany({ where: liveTrack(), select: { genre: true }, take: 800, orderBy: { publishedAt: 'desc' } }).catch(() => [])
  return countList(rows.map((row) => row.genre)).slice(0, 24)
}

export async function getTrack(slug: string, options: { recommendations?: boolean } = {}) {
  const row = await db.musicTrack.findFirst({ where: { slug, ...publishedNow() }, include: trackInclude }).catch(() => null)
  if (row && !await opensItem('track', row.id)) return null
  if (!row) return null
  const [albumTracks, artistTracks] = await Promise.all([
    row.albumId ? db.musicTrack.findMany({ where: { albumId: row.albumId, ...liveTrack() }, include: trackInclude, orderBy: [{ trackNo: 'asc' }, { id: 'asc' }], take: 50 }) : Promise.resolve([]),
    db.musicTrack.findMany({ where: { artistId: row.artistId, id: { not: row.id }, ...liveTrack() }, include: trackInclude, orderBy: { plays: 'desc' }, take: 8 }),
  ])
  const recommendations = options.recommendations ? await relatedTracks(row, 8, albumTracks.map(track => track.id)) : []
  const relatedRows = recommendations.length ? await db.musicTrack.findMany({ where: { ...liveTrack(), id: { in: recommendations.map(result => result.item.id) } }, include: trackInclude }) : []
  const relatedById = new Map(relatedRows.map(item => [item.id, item]))
  const credits = await creditGroups(row.id)
  return { track: { ...toTrack(row), lyrics: row.lyrics, downloads: row.downloads }, credits, albumTracks: albumTracks.map(toTrack), moreFromArtist: artistTracks.map(toTrack), relatedTracks: recommendations.flatMap(result => { const item = relatedById.get(result.item.id); return item ? [{ ...toTrack(item), recommendationReason: result.reason }] : [] }) }
}

export async function getAlbum(slug: string) {
  const row = await db.musicAlbum.findFirst({ where: { slug, ...publishedNow() }, include: albumInclude }).catch(() => null)
  if (row && !await opensAudience(row.audienceGroups, 'album')) return null
  if (!row) return null
  await db.musicAlbum.update({ where: { id: row.id }, data: { views: { increment: 1 } } }).catch(() => undefined)
  const [tracks, recommendations] = await Promise.all([
    db.musicTrack.findMany({ where: { albumId: row.id, ...liveTrack(), ...(await audienceClause('track')) }, include: trackInclude, orderBy: [{ trackNo: 'asc' }, { id: 'asc' }] }),
    relatedAlbums(row),
  ])
  const relatedRows = recommendations.length ? await db.musicAlbum.findMany({ where: { ...live(), id: { in: recommendations.map((result) => result.item.id) } }, include: albumInclude }) : []
  const relatedById = new Map(relatedRows.map((item) => [item.id, item]))
  const typeName = (await listLabels('music')).ALBUM_TYPE?.[row.albumType] || ''
  return { album: { ...toAlbum(row), albumTypeName: typeName, description: cleanRichText(row.description), publishedAt: row.publishedAt }, tracks: tracks.map(toTrack), related: recommendations.flatMap((result) => { const item = relatedById.get(result.item.id); return item ? [{ ...toAlbum(item), recommendationReason: result.reason }] : [] }) }
}

export async function getArtist(slug: string) {
  const matched = await db.musicArtist.findUnique({ where: { slug } }).catch(() => null)
  const row = matched?.mergedIntoId ? await db.musicArtist.findUnique({ where: { id: matched.mergedIntoId } }) : matched
  if (!row) return null
  const [albums, tracks, creditRows, labels] = await Promise.all([
    db.musicAlbum.findMany({ where: { artistId: row.id, ...live() }, include: albumInclude, orderBy: { publishedAt: 'desc' } }),
    db.musicTrack.findMany({ where: { artistId: row.id, ...liveTrack() }, include: trackInclude, orderBy: [{ plays: 'desc' }, { publishedAt: 'desc' }], take: 30 }),
    // Songs of others this artist is credited on (composer, lyricist, featured…), published ones only.
    db.musicCredit.findMany({ where: { artistId: row.id, track: liveTrack() }, orderBy: [{ track: { publishedAt: 'desc' } }], take: 120, select: { role: true, track: { include: trackInclude } } }).catch(() => []),
    listLabels('music'),
  ])
  const names = labels.CREDIT_ROLE ?? {}, order = Object.keys(names)
  const credited = new Map<string, { role: string; name: string; tracks: TrackCard[] }>()
  for (const credit of creditRows) {
    const group = credited.get(credit.role) || { role: credit.role, name: names[credit.role] || credit.role, tracks: [] }
    if (group.tracks.length < 20) group.tracks.push(toTrack(credit.track))
    credited.set(credit.role, group)
  }
  return { artist: { ...row, bio: renderEditorialText(row.bio) }, albums: albums.map(toAlbum), tracks: tracks.map(toTrack), credited: [...credited.values()].sort((a, b) => (order.indexOf(a.role) + 1 || 99) - (order.indexOf(b.role) + 1 || 99)) }
}

export async function getPlaylist(slug: string) {
  const row = await db.musicPlaylist.findFirst({ where: { slug, status: 'PUBLISHED' } }).catch(() => null)
  if (!row) return null
  const ids = parseJsonList<number>(row.trackIds).map(Number).filter(Number.isSafeInteger)
  const rows = ids.length ? await db.musicTrack.findMany({ where: { id: { in: ids }, ...liveTrack() }, include: trackInclude }) : []
  const byId = new Map(rows.map((r) => [r.id, r]))
  return { playlist: { ...toPlaylist(row), descriptionHtml: renderEditorialText(row.description) }, tracks: ids.flatMap((id) => (byId.has(id) ? [toTrack(byId.get(id))] : [])) }
}
