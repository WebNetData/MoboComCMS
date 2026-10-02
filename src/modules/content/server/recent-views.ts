import { db } from '@/platform/database/prisma'
import { itemCards, itemCard } from '@/modules/content/server/registry'
import { parseItemKey, type ItemRef } from '@/modules/content/domain/items'

const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000

/** Records an actual signed-in detail view only while the item is public. */
export async function recordRecentView(userId: number, rawItem: unknown) {
  const ref = parseItemKey(rawItem)
  if (!ref || !await itemCard(ref)) return false
  await db.$executeRaw`INSERT INTO "UserRecentView" ("userId", "itemType", "itemId") VALUES (${userId}, ${ref.type}, ${ref.id}) ON CONFLICT ("userId", "itemType", "itemId") DO UPDATE SET "lastViewedAt" = CURRENT_TIMESTAMP`
  await db.userRecentView.deleteMany({ where: { userId, lastViewedAt: { lt: new Date(Date.now() - MAX_AGE_MS) } } })
  return true
}

async function resolve(rows: { itemType: string; itemId: number; lastViewedAt: Date }[], take: number) {
  const refs = rows.map((row) => parseItemKey(`${row.itemType}:${row.itemId}`)).filter((ref): ref is ItemRef => !!ref)
  const cards = await itemCards(refs)
  return rows.flatMap((row) => {
    const card = cards.get(`${row.itemType}:${row.itemId}`)
    return card ? [{ ...card, viewedAt: row.lastViewedAt }] : []
  }).slice(0, take)
}

export async function recentViewPreview(userId: number, take = 6) {
  const size = Math.min(12, Math.max(1, Math.trunc(take) || 6))
  const where = { userId, lastViewedAt: { gte: new Date(Date.now() - MAX_AGE_MS) } }
  const [total, rows] = await Promise.all([
    db.userRecentView.count({ where }),
    db.userRecentView.findMany({ where, orderBy: { lastViewedAt: 'desc' }, take: size * 4 }),
  ])
  return { total, items: await resolve(rows, size) }
}

export async function recentViewPage(userId: number, rawPage: number) {
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1000) : 1
  const size = 24
  const where = { userId, lastViewedAt: { gte: new Date(Date.now() - MAX_AGE_MS) } }
  const [total, rows] = await Promise.all([
    db.userRecentView.count({ where }),
    db.userRecentView.findMany({ where, orderBy: { lastViewedAt: 'desc' }, skip: (page - 1) * size, take: size }),
  ])
  return { total, page, pages: Math.max(1, Math.ceil(total / size)), items: await resolve(rows, size) }
}

export async function clearRecentViews(userId: number) {
  const removed = await db.userRecentView.deleteMany({ where: { userId } })
  return { removed: removed.count }
}
