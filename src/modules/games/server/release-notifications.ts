import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { createInboxEvent } from '@/modules/notifications/server/inbox'

type UpdateRelease = { id: number; releasedAt: Date }

/** Register a new or rescheduled update in the same transaction as its save. */
export async function scheduleGameUpdateRelease(tx: Prisma.TransactionClient, update: UpdateRelease, before: UpdateRelease | null = null) {
  if (before?.releasedAt.getTime() === update.releasedAt.getTime()) return
  const now = new Date()
  await tx.gameUpdateReleaseNotification.upsert({
    where: { updateId: update.id },
    create: { updateId: update.id, dueAt: update.releasedAt > now ? update.releasedAt : now },
    update: { dueAt: update.releasedAt > now ? update.releasedAt : now },
  })
}

/** A bounded follower page per release; the cursor moves only after the inbox write. */
export async function processGameUpdateReleaseNotifications(now = new Date()) {
  const pending = await db.gameUpdateReleaseNotification.findMany({
    where: { completedAt: null, dueAt: { lte: now }, update: { is: { releasedAt: { lte: now }, game: { is: { status: 'PUBLISHED', audienceGroups: '', publishedAt: { lte: now } } } } } },
    orderBy: [{ dueAt: 'asc' }, { updateId: 'asc' }], take: 10,
    include: { update: { include: { game: { select: { id: true, slug: true, title: true } } } } },
  })
  let sent = 0
  for (const release of pending) {
    const { update } = release
    const followers = await db.itemFavorite.findMany({
      where: { itemType: 'game', itemId: update.gameId, notify: true, userId: { gt: release.lastUserId }, createdAt: { lte: release.dueAt } },
      orderBy: { userId: 'asc' }, select: { userId: true }, take: 50,
    })
    for (const follower of followers) {
      await createInboxEvent({
        userId: follower.userId, kind: 'FOLLOWED_UPDATE', dedupeKey: `game:update:${update.id}:release:${follower.userId}`,
        titleFa: `آپدیت تازهٔ ${update.game.title}`, titleEn: `New update for ${update.game.title}`,
        bodyFa: `«${update.title}» منتشر شد.`, bodyEn: `${update.title} is now available.`,
        href: `/games/${encodeURIComponent(update.game.slug)}`,
      })
      await db.gameUpdateReleaseNotification.update({ where: { updateId: update.id }, data: { lastUserId: follower.userId } })
      sent++
    }
    if (followers.length < 50) await db.gameUpdateReleaseNotification.update({ where: { updateId: update.id }, data: { completedAt: new Date() } })
  }
  return { checked: pending.length, sent }
}
