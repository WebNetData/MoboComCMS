import { db } from '@/platform/database/prisma'
import { toTrack } from '@/modules/media/server/queries'

export class PlaylistError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export function playlistId(value: unknown) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new PlaylistError('شناسهٔ پلی‌لیست نامعتبر است')
  return id
}

function playlistTitle(value: unknown) {
  if (typeof value !== 'string') throw new PlaylistError('نام پلی‌لیست لازم است')
  const title = value.trim()
  if (title.length < 2 || title.length > 80 || /[<>\x00-\x1f]/.test(title)) throw new PlaylistError('نام پلی‌لیست باید بین ۲ تا ۸۰ نویسه باشد')
  return title
}

export async function listPersonalPlaylists(userId: number) {
  const rows = await db.userMusicPlaylist.findMany({ where: { userId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], select: { id: true, title: true, updatedAt: true, _count: { select: { tracks: true } } } })
  return rows.map(({ _count, ...row }) => ({ ...row, trackCount: _count.tracks }))
}

export async function getPersonalPlaylist(userId: number, id: number) {
  const row = await db.userMusicPlaylist.findFirst({ where: { id, userId }, select: {
    id: true, title: true, updatedAt: true,
    tracks: { orderBy: [{ position: 'asc' }, { addedAt: 'asc' }], include: { track: { include: { artist: { select: { id: true, slug: true, name: true, nameEn: true, image: true } }, album: { select: { id: true, slug: true, title: true, titleEn: true, cover: true } } } } } },
  } })
  if (!row) throw new PlaylistError('پلی‌لیست پیدا نشد', 404)
  return { id: row.id, title: row.title, updatedAt: row.updatedAt, tracks: row.tracks.filter(({ track }) => track.status === 'PUBLISHED' && track.publishedAt <= new Date()).map(({ track }) => toTrack(track)) }
}

export async function createPersonalPlaylist(userId: number, value: unknown) {
  const title = playlistTitle(value)
  if (await db.userMusicPlaylist.count({ where: { userId } }) >= 50) throw new PlaylistError('حداکثر ۵۰ پلی‌لیست می‌توانید بسازید')
  return db.userMusicPlaylist.create({ data: { userId, title }, select: { id: true, title: true } })
}

export async function renamePersonalPlaylist(userId: number, id: number, value: unknown) {
  const title = playlistTitle(value)
  const changed = await db.userMusicPlaylist.updateMany({ where: { id, userId }, data: { title } })
  if (!changed.count) throw new PlaylistError('پلی‌لیست پیدا نشد', 404)
  return { id, title }
}

export async function deletePersonalPlaylist(userId: number, id: number) {
  const changed = await db.userMusicPlaylist.deleteMany({ where: { id, userId } })
  if (!changed.count) throw new PlaylistError('پلی‌لیست پیدا نشد', 404)
  return { deleted: true }
}

export async function addPersonalTrack(userId: number, id: number, trackValue: unknown) {
  const trackId = playlistId(trackValue)
  return db.$transaction(async (tx) => {
    const playlist = await tx.userMusicPlaylist.findFirst({ where: { id, userId }, select: { id: true } })
    if (!playlist) throw new PlaylistError('پلی‌لیست پیدا نشد', 404)
    const track = await tx.musicTrack.findFirst({ where: { id: trackId, status: 'PUBLISHED', publishedAt: { lte: new Date() } }, select: { id: true } })
    if (!track) throw new PlaylistError('آهنگ منتشرشده پیدا نشد', 404)
    const existing = await tx.userMusicPlaylistTrack.findUnique({ where: { playlistId_trackId: { playlistId: id, trackId } }, select: { trackId: true } })
    if (existing) return { added: false }
    const count = await tx.userMusicPlaylistTrack.count({ where: { playlistId: id } })
    if (count >= 500) throw new PlaylistError('حداکثر ۵۰۰ آهنگ در هر پلی‌لیست مجاز است')
    const last = await tx.userMusicPlaylistTrack.findFirst({ where: { playlistId: id }, orderBy: { position: 'desc' }, select: { position: true } })
    await tx.userMusicPlaylistTrack.create({ data: { playlistId: id, trackId, position: (last?.position || 0) + 1 } })
    await tx.userMusicPlaylist.update({ where: { id }, data: { updatedAt: new Date() } })
    return { added: true }
  }).catch(async (error: unknown) => {
    if ((error as { code?: string })?.code === 'P2002' && await db.userMusicPlaylistTrack.findFirst({ where: { playlistId: id, trackId, playlist: { userId } }, select: { trackId: true } })) return { added: false }
    throw error
  })
}

export async function removePersonalTrack(userId: number, id: number, trackValue: unknown) {
  const trackId = playlistId(trackValue)
  const playlist = await db.userMusicPlaylist.findFirst({ where: { id, userId }, select: { id: true } })
  if (!playlist) throw new PlaylistError('پلی‌لیست پیدا نشد', 404)
  const removed = await db.userMusicPlaylistTrack.deleteMany({ where: { playlistId: id, trackId } })
  if (removed.count) await db.userMusicPlaylist.update({ where: { id }, data: { updatedAt: new Date() } })
  return { removed: !!removed.count }
}
