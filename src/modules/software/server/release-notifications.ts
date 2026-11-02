import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { contentChanged } from '@/modules/content/server/events'

type Release = { id: number; status: string; releasedAt: Date }

/** Keep publication and its follower cursor in the same transaction. */
export async function scheduleSoftwareRelease(tx: Prisma.TransactionClient, release: Release, before: Release | null) {
  if (release.status !== 'PUBLISHED') return
  if (before?.status === 'PUBLISHED' && before.releasedAt.getTime() === release.releasedAt.getTime()) return
  const now = new Date()
  await tx.softwareReleaseNotification.upsert({
    where: { releaseId: release.id },
    create: { releaseId: release.id, dueAt: release.releasedAt > now ? release.releasedAt : now },
    update: { dueAt: release.releasedAt > now ? release.releasedAt : now, lastUserId: 0, completedAt: null },
  })
}

export async function processSoftwareReleaseNotifications(now = new Date()) {
  const pending = await db.softwareReleaseNotification.findMany({
    where: { completedAt: null, dueAt: { lte: now }, release: { is: { status: 'PUBLISHED', releasedAt: { lte: now }, software: { is: { status: 'PUBLISHED', publishedAt: { lte: now }, audienceGroups: '' } } } } },
    orderBy: [{ dueAt: 'asc' }, { releaseId: 'asc' }], take: 10,
    include: { release: { include: { software: { select: { id: true, slug: true, title: true, status: true, publishedAt: true, version: true } } } } },
  })
  let sent = 0
  for (const cursor of pending) {
    const { release } = cursor
    await db.softwareTitle.updateMany({ where: { id: release.softwareId, updatedAt: { lt: release.releasedAt } }, data: { updatedAt: new Date() } })
    contentChanged({ type: 'software', id: release.softwareId }, release.software, release.software)
    const followers = await db.itemFavorite.findMany({
      where: { itemType: 'software', itemId: release.softwareId, notify: true, userId: { gt: cursor.lastUserId }, createdAt: { lte: cursor.dueAt } },
      orderBy: { userId: 'asc' }, select: { userId: true }, take: 50,
    })
    for (const follower of followers) {
      await createInboxEvent({
        userId: follower.userId, kind: 'FOLLOWED_UPDATE', dedupeKey: `software:release:${release.id}:${follower.userId}`,
        titleFa: `نسخهٔ تازهٔ ${release.software.title}`, titleEn: `New version of ${release.software.title}`,
        bodyFa: `نسخهٔ ${release.version} منتشر شد.`, bodyEn: `Version ${release.version} is available.`,
        href: `/software/${encodeURIComponent(release.software.slug)}`,
      })
      await db.softwareReleaseNotification.update({ where: { releaseId: release.id }, data: { lastUserId: follower.userId } })
      sent++
    }
    if (followers.length < 50) await db.softwareReleaseNotification.update({ where: { releaseId: release.id }, data: { completedAt: new Date() } })
  }
  return { checked: pending.length, sent }
}
