import { db } from '@/platform/database/prisma'

/** Aggregate purchase evidence in storage; never return buyer/order identifiers. */
export async function frequentlyBoughtProductIds(productId: number, options: { days: number; minimumBuyers: number; take?: number }, now = new Date()): Promise<number[]> {
  if (!Number.isSafeInteger(productId) || productId <= 0) return []
  if (!Number.isSafeInteger(options.days) || options.days < 30 || options.days > 365
    || !Number.isSafeInteger(options.minimumBuyers) || options.minimumBuyers < 3 || options.minimumBuyers > 100) return []
  const take = Math.max(1, Math.min(12, Math.trunc(options.take || 8)))
  const since = new Date(now.getTime() - options.days * 86_400_000)
  // Return lines are stored as JSON in the existing model. Conservatively omit an
  // entire order once a return/cancellation is approved, instead of counting a
  // potentially returned pair or introducing another purchase/return store.
  const rows = await db.$queryRaw<{ productId: number }[]>`
    SELECT candidate."productId" AS "productId"
    FROM "OrderLine" source
    JOIN "Order" paid ON paid."id" = source."orderId"
    JOIN "Invoice" invoice ON invoice."orderId" = paid."id"
    JOIN "OrderLine" candidate ON candidate."orderId" = paid."id"
    JOIN "Product" product ON product."id" = candidate."productId"
    WHERE source."productId" = ${productId}
      AND source."quantity" > 0 AND source."totalMinor" > 0 AND source."sellerStatus" <> 'CANCELLED'
      AND paid."status" = 'PAID' AND invoice."status" = 'PAID'
      AND paid."createdAt" >= ${since} AND paid."createdAt" <= ${now}
      AND candidate."productId" <> ${productId}
      AND candidate."quantity" > 0 AND candidate."totalMinor" > 0 AND candidate."sellerStatus" <> 'CANCELLED'
      AND product."active" = true AND product."approval" = 'APPROVED'
      AND NOT EXISTS (SELECT 1 FROM "ReturnRequest" returned WHERE returned."orderId" = paid."id" AND returned."status" IN ('APPROVED', 'REFUNDED'))
    GROUP BY candidate."productId"
    HAVING COUNT(DISTINCT paid."userId") >= ${options.minimumBuyers}
    ORDER BY COUNT(DISTINCT paid."userId") DESC, candidate."productId" ASC
    LIMIT ${take}
  `
  return rows.map(row => row.productId)
}
