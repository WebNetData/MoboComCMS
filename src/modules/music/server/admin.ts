import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { MUSIC_HEALTH, normalizeMusicSettings, trackIssues, type MusicHealth, type MusicSettings } from '@/modules/music/domain/music'
import { parseSettingsInput } from '@/shared/section-layout'

// Music admin: home layout settings, catalogue dashboard and pickers.

const SETTINGS_KEY = 'music.portal.v1'
const DAY = 86_400_000
const DASHBOARD_PAGE = 500
const tehranDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

export async function getMusicSettings(): Promise<MusicSettings> {
  return normalizeMusicSettings(await readJsonSetting(SETTINGS_KEY))
}

export async function saveMusicSettings(input: unknown): Promise<MusicSettings> {
  const raw = parseSettingsInput(input)
  const current = await getMusicSettings()
  const next = normalizeMusicSettings({ ...raw, showRelatedTracks: raw.showRelatedTracks === undefined ? current.showRelatedTracks : raw.showRelatedTracks })
  await writeJsonSetting(SETTINGS_KEY, next)
  return next
}

export async function musicDashboard(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY)
  const [albums, trackDrafts, albumDrafts, scheduled, emptyAlbums, playlists] = await Promise.all([
    db.musicAlbum.count({ where: { status: 'PUBLISHED' } }),
    db.musicTrack.count({ where: { status: { not: 'PUBLISHED' } } }),
    db.musicAlbum.count({ where: { status: { not: 'PUBLISHED' } } }),
    db.musicTrack.count({ where: { status: 'PUBLISHED', publishedAt: { gt: now } } }),
    db.musicAlbum.count({ where: { tracks: { none: {} } } }),
    db.musicPlaylist.count(),
  ])
  const health = Object.fromEntries(Object.keys(MUSIC_HEALTH).map((key) => [key, 0])) as Record<MusicHealth, number>
  const worst: { id: number; title: string; cover: string; artist: string; issues: MusicHealth[] }[] = []
  type Card = { id: number; slug: string; title: string; cover: string; artist: string; plays: number; downloads: number }
  const topPlayed: Card[] = [], topDownloaded: Card[] = []
  const artistPlays = new Map<number, number>()
  let tracks = 0, plays = 0, downloads = 0, vip = 0, hq = 0, trackCursor = 0
  while (true) {
    const rows = await db.musicTrack.findMany({
      where: { status: 'PUBLISHED', publishedAt: { lte: now }, id: { gt: trackCursor } }, orderBy: { id: 'asc' }, take: DASHBOARD_PAGE,
      select: { id: true, slug: true, title: true, cover: true, audioUrl: true, audioHqUrl: true, duration: true, lyrics: true, genre: true, plays: true, downloads: true, access: true, artistId: true, album: { select: { cover: true } }, artist: { select: { name: true } } },
    })
    if (!rows.length) break
    for (const track of rows) {
      tracks++; plays += track.plays; downloads += track.downloads
      if (track.access === 'MEMBERS') vip++
      if (track.audioHqUrl.trim()) hq++
      artistPlays.set(track.artistId, (artistPlays.get(track.artistId) || 0) + track.plays)
      const issues = trackIssues({ ...track, albumCover: track.album?.cover || '' })
      for (const issue of issues) health[issue]++
      const cover = track.cover || track.album?.cover || ''
      if (issues.some(issue => issue === 'audio' || issue === 'cover' || issue === 'duration')) worst.push({ id: track.id, title: track.title, cover, artist: track.artist.name, issues })
      const card = { id: track.id, slug: track.slug, title: track.title, cover, artist: track.artist.name, plays: track.plays, downloads: track.downloads }
      topPlayed.push(card)
      if (track.downloads > 0) topDownloaded.push(card)
    }
    worst.sort((a, b) => b.issues.length - a.issues.length || a.id - b.id); worst.length = Math.min(worst.length, 8)
    topPlayed.sort((a, b) => b.plays - a.plays || a.id - b.id); topPlayed.length = Math.min(topPlayed.length, 8)
    topDownloaded.sort((a, b) => b.downloads - a.downloads || a.id - b.id); topDownloaded.length = Math.min(topDownloaded.length, 8)
    if (rows.length < DASHBOARD_PAGE) break
    trackCursor = rows[rows.length - 1].id
  }
  const days = Array.from({ length: 30 }, (_, i) => tehranDay(new Date(now.getTime() - (29 - i) * DAY)))
  const counts = new Map(days.map((day) => [day, 0]))
  let downloads30 = 0, downloadCursor = 0
  while (true) {
    const rows = await db.downloadLog.findMany({ where: { ownerType: 'track', createdAt: { gte: since }, id: { gt: downloadCursor } }, orderBy: { id: 'asc' }, take: DASHBOARD_PAGE, select: { id: true, createdAt: true } })
    if (!rows.length) break
    downloads30 += rows.length
    for (const row of rows) { const key = tehranDay(row.createdAt); if (counts.has(key)) counts.set(key, counts.get(key)! + 1) }
    if (rows.length < DASHBOARD_PAGE) break
    downloadCursor = rows[rows.length - 1].id
  }
  type ArtistCard = { id: number; slug: string; name: string; image: string; tracks: number; albums: number; plays: number }
  const topArtists: ArtistCard[] = []
  let artists = 0, artistsWithoutPhoto = 0, artistCursor = 0
  while (true) {
    const rows = await db.musicArtist.findMany({ where: { id: { gt: artistCursor } }, orderBy: { id: 'asc' }, take: DASHBOARD_PAGE, select: { id: true, slug: true, name: true, image: true, _count: { select: { tracks: true, albums: true } } } })
    if (!rows.length) break
    artists += rows.length
    for (const artist of rows) {
      if (!artist.image.trim()) artistsWithoutPhoto++
      topArtists.push({ id: artist.id, slug: artist.slug, name: artist.name, image: artist.image, tracks: artist._count.tracks, albums: artist._count.albums, plays: artistPlays.get(artist.id) || 0 })
    }
    topArtists.sort((a, b) => b.plays - a.plays || a.id - b.id); topArtists.length = Math.min(topArtists.length, 8)
    if (rows.length < DASHBOARD_PAGE) break
    artistCursor = rows[rows.length - 1].id
  }
  return {
    kpis: {
      tracks, albums, artists, playlists, drafts: trackDrafts + albumDrafts, scheduled,
      plays, downloads, downloads30, vip, hq, emptyAlbums, artistsWithoutPhoto,
    },
    series: days.map((day) => ({ day, downloads: counts.get(day)! })),
    health: Object.entries(health).map(([key, count]) => ({ key, label: MUSIC_HEALTH[key as MusicHealth], count })).filter((row) => row.count).sort((a, b) => b.count - a.count),
    worst, topPlayed, topDownloaded, topArtists,
  }
}

/** Published tracks and albums for the hero / featured pickers. */
export async function musicPickers() {
  const [tracks, albums] = await Promise.all([
    db.musicTrack.findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 800, select: { id: true, title: true, cover: true, artist: { select: { name: true } }, album: { select: { cover: true } } } }),
    db.musicAlbum.findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 500, select: { id: true, title: true, cover: true, artist: { select: { name: true } } } }),
  ])
  return {
    tracks: tracks.map((track) => ({ id: track.id, title: track.title, cover: track.cover || track.album?.cover || '', artist: track.artist.name })),
    albums: albums.map((album) => ({ id: album.id, title: album.title, cover: album.cover, artist: album.artist.name })),
  }
}
