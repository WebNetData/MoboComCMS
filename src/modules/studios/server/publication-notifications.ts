import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { createInboxEvent } from '@/modules/notifications/server/inbox'

type ProductType = 'game' | 'software'
type Publication = { id: number; status: string; publishedAt: Date }

/** Register the first public appearance in the same transaction as the title. */
export async function scheduleStudioPublication(tx: Prisma.TransactionClient, type: ProductType, after: Publication, before: Publication | null) {
  const key = { itemType_itemId: { itemType: type, itemId: after.id } }
  if (after.status !== 'PUBLISHED') {
    await tx.studioPublicationNotification.deleteMany({ where: { itemType: type, itemId: after.id, completedAt: null } })
    return
  }
  if (before?.status === 'PUBLISHED' && before.publishedAt.getTime() === after.publishedAt.getTime()) return
  const now = new Date()
  const dueAt = after.publishedAt > now ? after.publishedAt : now
  if (before?.status === 'PUBLISHED') {
    // A date edit may reschedule an existing pending first publication, but
    // must not retroactively announce titles that predate this feature.
    await tx.studioPublicationNotification.updateMany({ where: { itemType: type, itemId: after.id, completedAt: null }, data: { dueAt } })
    return
  }
  await tx.studioPublicationNotification.upsert({
    where: key,
    create: { itemType: type, itemId: after.id, dueAt },
    update: { dueAt },
  })
}

/** A bounded, retryable follower page per newly published title. */
export async function processStudioPublicationNotifications(now = new Date()) {
  const pending = await db.studioPublicationNotification.findMany({
    where: { completedAt: null, dueAt: { lte: now } },
    orderBy: [{ dueAt: 'asc' }, { itemType: 'asc' }, { itemId: 'asc' }], take: 10,
  })
  let sent = 0
  for (const cursor of pending) {
    const key = { itemType_itemId: { itemType: cursor.itemType, itemId: cursor.itemId } }
    if (cursor.itemType !== 'game' && cursor.itemType !== 'software') {
      await db.studioPublicationNotification.delete({ where: key })
      continue
    }
    const product = cursor.itemType === 'game'
      ? await db.gameTitle.findUnique({ where: { id: cursor.itemId }, select: { id: true, slug: true, title: true, status: true, publishedAt: true, developerStudioId: true, publisherStudioId: true } })
      : await db.softwareTitle.findUnique({ where: { id: cursor.itemId }, select: { id: true, slug: true, title: true, status: true, publishedAt: true, developerStudioId: true, publisherStudioId: true } })
    if (!product || product.status !== 'PUBLISHED') {
      await db.studioPublicationNotification.deleteMany({ where: { itemType: cursor.itemType, itemId: cursor.itemId, completedAt: null } })
      continue
    }
    if (product.publishedAt > now) continue
    const studios = [...new Set([product.developerStudioId, product.publisherStudioId].filter((id): id is number => id !== null))]
    const followers = studios.length ? await db.itemFavorite.groupBy({
      by: ['userId'],
      where: { itemType: 'studio', itemId: { in: studios }, notify: true, userId: { gt: cursor.lastUserId }, createdAt: { lte: cursor.dueAt } },
      orderBy: { userId: 'asc' }, take: 50,
    }) : []
    for (const follower of followers) {
      await createInboxEvent({
        userId: follower.userId, kind: 'FOLLOWED_UPDATE', dedupeKey: `studio:${cursor.itemType}:${product.id}:published:${follower.userId}`,
        titleFa: `${cursor.itemType === 'game' ? 'بازی' : 'نرم‌افزار'} تازهٔ سازندهٔ دنبال‌شده`,
        titleEn: `New ${cursor.itemType} from a studio you follow`,
        bodyFa: `«${product.title}» منتشر شد.`, bodyEn: `${product.title} is now available.`,
        href: `/${cursor.itemType === 'game' ? 'games' : 'software'}/${encodeURIComponent(product.slug)}`,
      })
      await db.studioPublicationNotification.updateMany({ where: { itemType: cursor.itemType, itemId: cursor.itemId, lastUserId: { lt: follower.userId }, completedAt: null }, data: { lastUserId: follower.userId } })
      sent++
    }
    if (followers.length < 50) await db.studioPublicationNotification.update({ where: key, data: { completedAt: new Date() } })
  }
  return { checked: pending.length, sent }
}
