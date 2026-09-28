import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { MUSIC_HEALTH, normalizeMusicSettings, trackIssues, type MusicHealth, type MusicSettings } from '@/modules/music/domain/music'

// Music admin: home layout settings, catalogue dashboard and pickers.

const SETTINGS_KEY = 'music.portal.v1'
const DAY = 86_400_000
const tehranDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

export async function getMusicSettings(): Promise<MusicSettings> {
  return normalizeMusicSettings(await readJsonSetting(SETTINGS_KEY))
}

export async function saveMusicSettings(input: unknown): Promise<MusicSettings> {
  const next = normalizeMusicSettings(input)
  await writeJsonSetting(SETTINGS_KEY, next)
  return next
}

export async function musicDashboard(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY)
  const [tracks, albums, artists, playlists, downloads] = await Promise.all([
    db.musicTrack.findMany({ select: { id: true, slug: true, title: true, cover: true, audioUrl: true, audioHqUrl: true, duration: true, lyrics: true, genre: true, status: true, publishedAt: true, plays: true, downloads: true, access: true, artistId: true, album: { select: { cover: true } }, artist: { select: { name: true } } } }),
    db.musicAlbum.findMany({ select: { id: true, slug: true, title: true, cover: true, status: true, publishedAt: true, views: true, artist: { select: { name: true } }, _count: { select: { tracks: true } } } }),
    db.musicArtist.findMany({ select: { id: true, slug: true, name: true, image: true, _count: { select: { tracks: true, albums: true } } } }),
    db.musicPlaylist.count(),
    db.downloadLog.findMany({ where: { ownerType: 'track', createdAt: { gte: since } }, select: { createdAt: true } }).catch(() => []),
  ])
  const live = tracks.filter((track) => track.status === 'PUBLISHED' && track.publishedAt <= now)
  const health = Object.fromEntries(Object.keys(MUSIC_HEALTH).map((key) => [key, 0])) as Record<MusicHealth, number>
  const worst: { id: number; title: string; cover: string; artist: string; issues: MusicHealth[] }[] = []
  for (const track of live) {
    const issues = trackIssues({ ...track, albumCover: track.album?.cover || '' })
    for (const issue of issues) health[issue]++
    if (issues.some((issue) => issue === 'audio' || issue === 'cover' || issue === 'duration')) worst.push({ id: track.id, title: track.title, cover: track.cover || track.album?.cover || '', artist: track.artist.name, issues })
  }
  worst.sort((a, b) => b.issues.length - a.issues.length)
  const days = Array.from({ length: 30 }, (_, i) => tehranDay(new Date(now.getTime() - (29 - i) * DAY)))
  const counts = new Map(days.map((day) => [day, 0]))
  for (const row of downloads) { const key = tehranDay(row.createdAt); if (counts.has(key)) counts.set(key, counts.get(key)! + 1) }
  const artistPlays = new Map<number, number>()
  for (const track of live) artistPlays.set(track.artistId, (artistPlays.get(track.artistId) || 0) + track.plays)
  const card = (track: typeof tracks[number]) => ({ id: track.id, slug: track.slug, title: track.title, cover: track.cover || track.album?.cover || '', artist: track.artist.name, plays: track.plays, downloads: track.downloads })
  return {
    kpis: {
      tracks: live.length, albums: albums.filter((album) => album.status === 'PUBLISHED').length, artists: artists.length, playlists,
      drafts: tracks.filter((track) => track.status !== 'PUBLISHED').length + albums.filter((album) => album.status !== 'PUBLISHED').length,
      scheduled: tracks.filter((track) => track.status === 'PUBLISHED' && track.publishedAt > now).length,
      plays: live.reduce((sum, track) => sum + track.plays, 0), downloads: live.reduce((sum, track) => sum + track.downloads, 0), downloads30: downloads.length,
      vip: live.filter((track) => track.access === 'MEMBERS').length, hq: live.filter((track) => !!track.audioHqUrl.trim()).length,
      emptyAlbums: albums.filter((album) => album._count.tracks === 0).length, artistsWithoutPhoto: artists.filter((artist) => !artist.image.trim()).length,
    },
    series: days.map((day) => ({ day, downloads: counts.get(day)! })),
    health: Object.entries(health).map(([key, count]) => ({ key, label: MUSIC_HEALTH[key as MusicHealth], count })).filter((row) => row.count).sort((a, b) => b.count - a.count),
    worst: worst.slice(0, 8),
    topPlayed: [...live].sort((a, b) => b.plays - a.plays).slice(0, 8).map(card),
    topDownloaded: [...live].sort((a, b) => b.downloads - a.downloads).filter((track) => track.downloads > 0).slice(0, 8).map(card),
    topArtists: artists.map((artist) => ({ id: artist.id, slug: artist.slug, name: artist.name, image: artist.image, tracks: artist._count.tracks, albums: artist._count.albums, plays: artistPlays.get(artist.id) || 0 })).sort((a, b) => b.plays - a.plays).slice(0, 8),
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
