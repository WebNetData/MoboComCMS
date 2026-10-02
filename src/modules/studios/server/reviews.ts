import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { itemCards, type ItemCard } from '@/modules/content/server/registry'
import type { ItemRef } from '@/modules/content/domain/items'

type ReviewRow = { id: number; itemType: string; itemId: number; userId: number; rating: number; body: string; createdAt: Date }

/** Approved text reviews across every public product of one studio. */
export async function studioProductReviews(studioId: number, enabled: { games: boolean; software: boolean }, input: { page?: number; size?: number } = {}) {
  const empty = { items: [], total: 0, page: 1, pages: 1 }
  if (!Number.isSafeInteger(studioId) || studioId < 1) return empty
  const now = new Date()
  const sources: Prisma.Sql[] = []
  if (enabled.games) sources.push(Prisma.sql`
    SELECT r."id", r."itemType", r."itemId", r."userId", r."rating", r."body", r."createdAt"
    FROM "ItemReview" AS r JOIN "GameTitle" AS g ON g."id" = r."itemId"
    WHERE r."itemType" = 'game' AND r."status" = 'APPROVED' AND r."body" <> ''
      AND g."status" = 'PUBLISHED' AND g."publishedAt" <= ${now}
      AND (g."developerStudioId" = ${studioId} OR g."publisherStudioId" = ${studioId})
  `)
  if (enabled.software) sources.push(Prisma.sql`
    SELECT r."id", r."itemType", r."itemId", r."userId", r."rating", r."body", r."createdAt"
    FROM "ItemReview" AS r JOIN "SoftwareTitle" AS s ON s."id" = r."itemId"
    WHERE r."itemType" = 'software' AND r."status" = 'APPROVED' AND r."body" <> ''
      AND s."status" = 'PUBLISHED' AND s."publishedAt" <= ${now}
      AND (s."developerStudioId" = ${studioId} OR s."publisherStudioId" = ${studioId})
  `)
  if (!sources.length) return empty
  const size = Math.max(1, Math.min(20, Math.trunc(input.size || 8)))
  const totalRows = await db.$queryRaw<{ total: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS total FROM (${Prisma.join(sources, ' UNION ALL ')}) AS related
  `)
  const total = Number(totalRows[0]?.total || 0)
  const pages = Math.max(1, Math.ceil(total / size))
  const page = Math.min(pages, Math.max(1, Math.min(500, Math.trunc(input.page || 1))))
  const rows = await db.$queryRaw<ReviewRow[]>(Prisma.sql`
    SELECT related.* FROM (${Prisma.join(sources, ' UNION ALL ')}) AS related
    ORDER BY related."createdAt" DESC, related."id" DESC LIMIT ${size} OFFSET ${(page - 1) * size}
  `)
  const refs = rows.map((row): ItemRef => ({ type: row.itemType === 'game' ? 'game' : 'software', id: row.itemId }))
  const [cards, users] = await Promise.all([
    itemCards(refs),
    db.user.findMany({ where: { id: { in: rows.map((row) => row.userId) } }, select: { id: true, name: true } }),
  ])
  const names = new Map(users.map((user) => [user.id, user.name || 'کاربر موبوکام']))
  const items = rows.flatMap((row): { id: number; item: ItemCard; body: string; rating: number; author: string; createdAt: Date }[] => {
    const item = cards.get(`${row.itemType}:${row.itemId}`)
    return item ? [{ id: row.id, item, body: row.body, rating: row.rating, author: names.get(row.userId) || 'کاربر موبوکام', createdAt: new Date(row.createdAt) }] : []
  })
  return { items, total, page, pages }
}
