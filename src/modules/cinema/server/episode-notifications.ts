import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { episodeCode } from '@/modules/cinema/domain/calendar'

// "Tell me about new episodes": members who follow a series hear when an episode airs.

export type AiringEpisode = { season: number; number: number; airDate: Date | null }

const DAY = 86_400_000

/**
 * Register the airings of a series in the same transaction as its save. An episode is announced when
 * its air date is still ahead, or passed less than a day ago (the editor is adding an episode that has
 * just aired); older episodes of an imported or re-saved series are not announced. A changed date moves
 * an announcement that has not gone out; one that has is never repeated. Episodes that lost their date
 * or were removed lose their pending announcement.
 */
export async function scheduleEpisodeAirings(tx: Prisma.TransactionClient, titleId: number, episodes: readonly AiringEpisode[], now = new Date()) {
  const wanted = new Map<string, { season: number; episode: number; dueAt: Date }>()
  for (const item of episodes) {
    if (!item.airDate || item.airDate.getTime() <= now.getTime() - DAY) continue
    wanted.set(`${item.season}:${item.number}`, { season: item.season, episode: item.number, dueAt: item.airDate })
  }
  const existing = await tx.cinemaEpisodeAirNotification.findMany({ where: { titleId }, select: { id: true, season: true, episode: true, dueAt: true, completedAt: true } })
  const stale: number[] = []
  for (const row of existing) {
    const key = `${row.season}:${row.episode}`
    const next = wanted.get(key)
    wanted.delete(key)
    if (row.completedAt) continue
    if (!next) stale.push(row.id)
    else if (next.dueAt.getTime() !== row.dueAt.getTime()) await tx.cinemaEpisodeAirNotification.update({ where: { id: row.id }, data: { dueAt: next.dueAt, lastUserId: 0 } })
  }
  if (stale.length) await tx.cinemaEpisodeAirNotification.deleteMany({ where: { id: { in: stale } } })
  if (wanted.size) await tx.cinemaEpisodeAirNotification.createMany({ data: [...wanted.values()].map((item) => ({ titleId, ...item })) })
}

/**
 * Engagement job step: a bounded page of followers per aired episode; the cursor moves only after the
 * inbox write, so a stopped run continues where it was. The series must be public and the episode must
 * still exist with an air date that has passed.
 */
export async function processEpisodeAirNotifications(now = new Date()) {
  const pending = await db.cinemaEpisodeAirNotification.findMany({
    where: { completedAt: null, dueAt: { lte: now }, title: { is: { kind: 'SERIES', status: 'PUBLISHED', publishedAt: { lte: now } } } },
    orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: 10,
    include: { title: { select: { id: true, slug: true, title: true, titleEn: true } } },
  })
  let sent = 0
  for (const airing of pending) {
    const episode = await db.cinemaEpisode.findFirst({
      where: { number: airing.episode, season: { titleId: airing.titleId, number: airing.season } },
      select: { title: true, titleEn: true, airDate: true },
    })
    // Removed, or its date taken away, after it was registered: nothing to announce.
    if (!episode?.airDate) { await db.cinemaEpisodeAirNotification.delete({ where: { id: airing.id } }); continue }
    // Postponed without the registration being moved: wait for the new date instead of blocking the queue.
    if (episode.airDate > now) { await db.cinemaEpisodeAirNotification.update({ where: { id: airing.id }, data: { dueAt: episode.airDate } }); continue }
    const followers = await db.itemFavorite.findMany({
      where: { itemType: 'title', itemId: airing.titleId, notify: true, userId: { gt: airing.lastUserId }, createdAt: { lte: airing.dueAt } },
      orderBy: { userId: 'asc' }, select: { userId: true }, take: 50,
    })
    const code = episodeCode(airing.season, airing.episode)
    const seriesEn = airing.title.titleEn || airing.title.title
    for (const follower of followers) {
      await createInboxEvent({
        userId: follower.userId, kind: 'FOLLOWED_UPDATE', dedupeKey: `title:${airing.titleId}:s${airing.season}e${airing.episode}:aired:${follower.userId}`,
        titleFa: `قسمت تازهٔ ${airing.title.title}`, titleEn: `New episode of ${seriesEn}`,
        bodyFa: `فصل ${airing.season.toLocaleString('fa-IR')} قسمت ${airing.episode.toLocaleString('fa-IR')}${episode.title ? ` «${episode.title}»` : ''} پخش شد.`,
        bodyEn: `${code}${episode.titleEn || episode.title ? ` “${episode.titleEn || episode.title}”` : ''} has aired.`,
        href: `/cinema/${encodeURIComponent(airing.title.slug)}`,
      })
      await db.cinemaEpisodeAirNotification.update({ where: { id: airing.id }, data: { lastUserId: follower.userId } })
      sent++
    }
    if (followers.length < 50) await db.cinemaEpisodeAirNotification.update({ where: { id: airing.id }, data: { completedAt: new Date() } })
  }
  return { checked: pending.length, sent }
}
