import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { createInboxEvent } from '@/modules/notifications/server/inbox'

type TrackRelease = { id: number; status: string; publishedAt: Date }

/** Register the first publication in the same transaction as the track write. */
export async function scheduleTrackRelease(tx: Prisma.TransactionClient, track: TrackRelease, before: TrackRelease | null = null) {
  if (track.status !== 'PUBLISHED') return
  if (before?.status === 'PUBLISHED' && before.publishedAt.getTime() === track.publishedAt.getTime()) return
  const now = new Date()
  const dueAt = track.publishedAt > now ? track.publishedAt : now
  await tx.musicTrackReleaseNotification.upsert({
    where: { trackId: track.id },
    create: { trackId: track.id, dueAt },
    update: { dueAt },
  })
}

/** Deliver one small follower page per release. The cursor advances after the inbox write. */
export async function processTrackReleaseNotifications(now = new Date()) {
  const pending = await db.musicTrackReleaseNotification.findMany({
    where: { completedAt: null, dueAt: { lte: now }, track: { is: { status: 'PUBLISHED', publishedAt: { lte: now } } } },
    orderBy: [{ dueAt: 'asc' }, { trackId: 'asc' }],
    take: 20,
    include: { track: { include: { artist: { select: { name: true, nameEn: true } } } } },
  })
  let sent = 0
  for (const release of pending) {
    const track = release.track
    if (track.status !== 'PUBLISHED' || track.publishedAt > now) continue
    const followers = await db.itemFavorite.findMany({
      where: { itemType: 'artist', itemId: track.artistId, notify: true, userId: { gt: release.lastUserId }, createdAt: { lte: release.dueAt } },
      orderBy: { userId: 'asc' }, select: { userId: true }, take: 100,
    })
    for (const follower of followers) {
      await createInboxEvent({
        userId: follower.userId,
        kind: 'FOLLOWED_UPDATE',
        dedupeKey: `music:track:${track.id}:release:${follower.userId}`,
        titleFa: `آهنگ تازه از ${track.artist.name}`,
        titleEn: `New track by ${track.artist.nameEn || track.artist.name}`,
        bodyFa: `«${track.title}» منتشر شد.`,
        bodyEn: `${track.titleEn || track.title} is now available.`,
        href: `/music/track/${encodeURIComponent(track.slug)}`,
      })
      await db.musicTrackReleaseNotification.update({ where: { trackId: track.id }, data: { lastUserId: follower.userId } })
      sent++
    }
    if (followers.length < 100) await db.musicTrackReleaseNotification.update({ where: { trackId: track.id }, data: { completedAt: new Date() } })
  }
  return { checked: pending.length, sent }
}
