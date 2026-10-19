import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { ArtistProfileError } from '@/modules/music/domain/artist-profile'
import { mergeProfileFavorites } from '@/modules/reviews/server/reviews'

export async function artistMergePreview(sourceId: number, targetId: number) {
  if (![sourceId, targetId].every(id => Number.isSafeInteger(id) && id > 0) || sourceId === targetId) throw new ArtistProfileError('دو هنرمند متفاوت انتخاب کنید')
  const rows = await db.musicArtist.findMany({ where: { id: { in: [sourceId, targetId] } }, select: { id: true, name: true, slug: true, updatedAt: true, mergedIntoId: true, _count: { select: { tracks: true, albums: true } } } })
  const source = rows.find(row => row.id === sourceId), target = rows.find(row => row.id === targetId)
  if (!source || !target) throw new ArtistProfileError('هنرمند پیدا نشد', 404)
  if (source.mergedIntoId || target.mergedIntoId) throw new ArtistProfileError('پروفایل اصلی را انتخاب کنید؛ این هنرمند قبلاً ادغام شده است', 409)
  return { source, target, sourceVersion: source.updatedAt.toISOString(), targetVersion: target.updatedAt.toISOString() }
}

export async function mergeMusicArtists(input: Record<string, unknown>, audit: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  const sourceId = Number(input.sourceId), targetId = Number(input.targetId)
  await artistMergePreview(sourceId, targetId)
  const sourceVersion = new Date(String(input.sourceVersion)), targetVersion = new Date(String(input.targetVersion))
  if (![sourceVersion, targetVersion].every(date => Number.isFinite(date.getTime()))) throw new ArtistProfileError('پیش‌نمایش ادغام را دوباره دریافت کنید', 409)
  return db.$transaction(async tx => {
    for (const id of [sourceId, targetId].sort((a, b) => a - b)) {
      const expected = id === sourceId ? sourceVersion : targetVersion
      const claimed = await tx.musicArtist.updateMany({ where: { id, mergedIntoId: null, updatedAt: expected }, data: { updatedAt: new Date(Math.max(Date.now(), expected.getTime() + 1)) } })
      if (!claimed.count) throw new ArtistProfileError('هنرمند هم‌زمان تغییر کرده است؛ پیش‌نمایش را تازه کنید', 409)
    }
    const source = await tx.musicArtist.findUniqueOrThrow({ where: { id: sourceId } }), target = await tx.musicArtist.findUniqueOrThrow({ where: { id: targetId } })
    const tracks = await tx.musicTrack.updateMany({ where: { artistId: sourceId }, data: { artistId: targetId } }), albums = await tx.musicAlbum.updateMany({ where: { artistId: sourceId }, data: { artistId: targetId } })
    await tx.musicArtist.updateMany({ where: { mergedIntoId: sourceId }, data: { mergedIntoId: targetId } })
    await tx.musicArtist.update({ where: { id: sourceId }, data: { mergedIntoId: targetId } })
    await tx.musicArtist.update({ where: { id: targetId }, data: { ...(target.bio ? {} : { bio: source.bio }), ...(target.image ? {} : { image: source.image }), ...(target.cover ? {} : { cover: source.cover }) } })
    await mergeProfileFavorites(tx, 'artist', sourceId, targetId)
    await audit(tx)
    return { id: targetId, url: `/music/artist/${encodeURIComponent(target.slug)}`, movedTracks: tracks.count, movedAlbums: albums.count }
  }, { timeout: 30_000, isolationLevel: 'Serializable' })
}
