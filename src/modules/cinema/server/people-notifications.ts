import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { enqueue } from '@/modules/operations/server/enqueue'
import { isModuleEnabled } from '@/extensions/server/modules'
import { getCinemaSettings } from '@/modules/cinema/server/admin'
import { createInboxEvent } from '@/modules/notifications/server/inbox'

type Title = { id: number; status: string; publishedAt: Date }
/** Durable first-publication jobs share the existing queue and transaction; ordinary edits do not announce old works. */
export async function schedulePeoplePublication(tx: Prisma.TransactionClient, title: Title, before: Title | null) {
  if (title.status !== 'PUBLISHED' || before?.status === 'PUBLISHED' && before.publishedAt.getTime() === title.publishedAt.getTime()) return
  const credits = await tx.cinemaCredit.findMany({ where: { titleId: title.id }, select: { personId: true }, distinct: ['personId'] })
  const due = new Date(Math.max(Date.now(), title.publishedAt.getTime()))
  for (const credit of credits) await enqueue('cinema.person-publication', { titleId: title.id, personId: credit.personId, dueAt: due.toISOString(), cursor: 0 }, { dedupeKey: `cinema-person:${credit.personId}:title:${title.id}`, runAt: due }, tx)
}

export async function deliverPeoplePublication(payload: Record<string, unknown>) {
  const titleId = Number(payload.titleId), requestedId = Number(payload.personId), cursor = Number(payload.cursor) || 0, dueAt = new Date(String(payload.dueAt))
  if (![titleId, requestedId].every(id => Number.isSafeInteger(id) && id > 0) || !Number.isSafeInteger(cursor) || cursor < 0 || !Number.isFinite(dueAt.getTime())) throw Error('Invalid people publication job')
  if (!await isModuleEnabled('cinema') || !await isModuleEnabled('reviews') || !(await getCinemaSettings(true)).personFollowEnabled) return { done: true, sent: 0, cursor }
  const identity = await db.cinemaPerson.findUnique({ where: { id: requestedId }, select: { mergedIntoId: true } }), personId = identity?.mergedIntoId || requestedId
  const title = await db.cinemaTitle.findFirst({ where: { id: titleId, status: 'PUBLISHED', publishedAt: { lte: new Date() }, credits: { some: { personId } } }, select: { title: true, slug: true } }), person = await db.cinemaPerson.findFirst({ where: { id: personId, mergedIntoId: null }, select: { name: true } })
  if (!title || !person || dueAt > new Date()) return { done: true, sent: 0, cursor }
  const followers = await db.itemFavorite.findMany({ where: { itemType: 'person', itemId: personId, notify: true, userId: { gt: cursor }, createdAt: { lte: dueAt } }, orderBy: { userId: 'asc' }, take: 100, select: { userId: true } })
  for (const follower of followers) await createInboxEvent({ userId: follower.userId, kind: 'FOLLOWED_UPDATE', dedupeKey: `cinema:person:${personId}:title:${titleId}:${follower.userId}`, titleFa: `اثر تازه با حضور ${person.name}`, titleEn: `New work featuring ${person.name}`, bodyFa: `«${title.title}» در موبوکام منتشر شد.`, bodyEn: title.title, href: `/cinema/${encodeURIComponent(title.slug)}` })
  return { done: followers.length < 100, sent: followers.length, cursor: followers.at(-1)?.userId || cursor }
}
