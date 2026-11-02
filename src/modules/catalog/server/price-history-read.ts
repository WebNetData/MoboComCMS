import { db } from '@/platform/database/prisma'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { isPublicProduct } from '@/modules/catalog/domain/product-publication'
import { getStoreSettings } from '@/modules/store/server/catalog'
import { normalizeCurrency } from '@/shared/money'

export type ProductPriceHistory = {
  variantId: number
  currency: string
  days: number
  truncated: boolean
  items: { id: number; amountMinor: string; recordedAt: string }[]
}

/** Public regular-price observations only. Invalid, disabled and private owners share the same result. */
export async function readProductPriceHistory(productId: number, variantId = 0, now = new Date()): Promise<ProductPriceHistory | null> {
  if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(variantId) || variantId < 0) return null
  if (!await isStoreEnabled()) return null
  const settings = await getStoreSettings()
  if (!settings.showPriceHistory) return null
  const product = await db.product.findUnique({ where: { id: productId }, select: { active: true, approval: true, audienceGroups: true, currency: true } })
  if (!product || !isPublicProduct(product)) return null
  if (variantId) {
    const variant = await db.productVariant.findFirst({ where: { id: variantId, productId, active: true }, select: { id: true } })
    if (!variant) return null
  }
  const currency = normalizeCurrency(product.currency)
  const rows = await db.productPricePoint.findMany({
    where: { productId, variantId, currency, recordedAt: { gte: new Date(now.getTime() - settings.priceHistoryDays * 86_400_000), lte: now } },
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    take: 121,
    select: { id: true, amountMinor: true, recordedAt: true },
  })
  return { variantId, currency, days: settings.priceHistoryDays, truncated: rows.length > 120,
    items: rows.slice(0, 120).reverse().map(row => ({ id: row.id, amountMinor: row.amountMinor.toString(), recordedAt: row.recordedAt.toISOString() })) }
}
