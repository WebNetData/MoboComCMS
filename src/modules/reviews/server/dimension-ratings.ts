import { db } from '@/platform/database/prisma'
import { Prisma } from '@prisma/client'
import { isModuleEnabled } from '@/extensions/server/modules'
import { dimensionsFor } from '@/modules/reviews/domain/dimensions'
import type { ItemRef } from '@/modules/content/domain/items'
import type { ItemRating } from '@/modules/reviews/server/ratings'

/** One bounded candidate batch; approved public review dimensions only, never a second aggregate store. */
export async function dimensionRatingsOfItems(refs: ItemRef[], key: string): Promise<Map<string, ItemRating>> {
  const out = new Map<string, ItemRating>()
  if (!refs.length || !await isModuleEnabled('reviews')) return out
  const supported = refs.filter(ref => dimensionsFor(ref.type).some(dimension => dimension.key === key))
  if (!supported.length) return out
  // SQL aggregates before retrieval: a popular item's million reviews still return one row.
  for (let offset = 0; offset < supported.length; offset += 500) {
    const groups = new Map<string, number[]>()
    for (const ref of supported.slice(offset, offset + 500)) groups.set(ref.type, [...(groups.get(ref.type) || []), ref.id])
    const owners = [...groups].map(([type, ids]) => Prisma.sql`(r."itemType" = ${type} AND r."itemId" IN (${Prisma.join(ids)}))`)
    const rows = await db.$queryRaw<Array<{ itemType: string; itemId: number; average: unknown; count: bigint | number }>>(Prisma.sql`
      SELECT r."itemType", r."itemId", AVG(s."score") AS "average", COUNT(*) AS "count"
      FROM "ItemReviewScore" s JOIN "ItemReview" r ON r."id" = s."reviewId"
      WHERE s."key" = ${key} AND r."status" = 'APPROVED' AND (${Prisma.join(owners, ' OR ')})
      GROUP BY r."itemType", r."itemId"`)
    for (const row of rows) out.set(`${row.itemType}:${row.itemId}`, { average: Number(row.average), count: Number(row.count) })
  }
  return out
}
