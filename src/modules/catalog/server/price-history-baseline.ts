import { db } from '@/platform/database/prisma'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'
import { capturePublicProductPrices, lockProductPricing } from '@/modules/catalog/server/price-history'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'

/** Restartable public-price observations, not reconstructed historical prices. */
export async function baselineProductPrices(cursorInput: unknown = 0) {
  const cursor = Number(cursorInput)
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('Invalid price history baseline cursor')
  if (!await isStoreEnabled()) return { cursor, scanned: 0, points: 0, done: true, skipped: true }
  const rows = await db.product.findMany({ where: { ...publicProductWhere, id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 20, select: { id: true } })
  let points = 0
  for (const row of rows) points += await db.$transaction(async tx => {
    await lockProductPricing(tx, row.id)
    return capturePublicProductPrices(tx, row.id, new Map())
  }, { timeout: 20000 })
  return { cursor: rows.at(-1)?.id ?? cursor, scanned: rows.length, points, done: rows.length < 20 }
}
