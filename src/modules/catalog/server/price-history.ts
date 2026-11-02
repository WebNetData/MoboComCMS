import type { Prisma } from '@prisma/client'
import { publicPriceObservations, priceObservationChanged, type PriceObservation } from '@/modules/catalog/domain/price-history'

type PricingTransaction = Pick<Prisma.TransactionClient, 'product' | 'productVariant' | 'productPricePoint' | 'backgroundJob' | '$queryRaw'>

/** Call before price writes in the same transaction, in product ID order for multi-product work. */
export async function lockProductPricing(tx: PricingTransaction, productId: number) {
  if (!Number.isSafeInteger(productId) || productId <= 0) throw new Error('Invalid product price owner')
  if (/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL || '')) {
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`
  }
  // SQLite serializes writes through its existing transaction/file lock.
}

async function publicProductPrices(tx: PricingTransaction, productId: number) {
  const product = await tx.product.findUnique({ where: { id: productId }, select: { active: true, approval: true, audienceGroups: true, price: true, priceMinor: true, currency: true } })
  const points = new Map<number, PriceObservation>()
  if (!product || !product.active || product.approval !== 'APPROVED') return points
  for (const point of publicPriceObservations(product, [])) points.set(point.variantId, point)
  let cursor = 0
  while (true) {
    const rows = await tx.productVariant.findMany({ where: { productId, active: true, id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 200, select: { id: true, active: true, price: true, priceMinor: true } })
    if (!rows.length) break
    for (const point of publicPriceObservations(product, rows)) points.set(point.variantId, point)
    if (rows.length < 200) break
    cursor = rows[rows.length - 1].id
  }
  return points
}

/** Capture the public state after acquiring the product lock and before any price writes. */
export async function prepareProductPriceCapture(tx: PricingTransaction, productId: number) {
  await lockProductPricing(tx, productId)
  return publicProductPrices(tx, productId)
}

/** Append only actual price/publication changes in the same transaction; empty before establishes a baseline. */
export async function capturePublicProductPrices(tx: PricingTransaction, productId: number, before: ReadonlyMap<number, PriceObservation>, now = new Date()) {
  const after = await publicProductPrices(tx, productId)
  let changed = 0
  for (const point of after.values()) {
    if (!priceObservationChanged(before.get(point.variantId) || null, point)) continue
    const previous = await tx.productPricePoint.findFirst({ where: { productId, variantId: point.variantId }, orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }], select: { amountMinor: true, currency: true } })
    if (!priceObservationChanged(previous, point)) continue
    const recorded = await tx.productPricePoint.create({ data: { productId, ...point, recordedAt: now }, select: { id: true } })
    const priorOffer = before.get(point.variantId)
    if (point.variantId === 0 && priorOffer && priorOffer.currency === point.currency && point.amountMinor < priorOffer.amountMinor) {
      // Same durable queue/transaction pattern as central Inbox, with no queue registry dependency.
      await tx.backgroundJob.create({ data: { kind: 'store.price-drop', dedupeKey: `product-price-drop:${recorded.id}`, payload: JSON.stringify({ pointId: recorded.id, previousMinor: priorOffer.amountMinor.toString(), currency: point.currency, cursor: 0 }) } })
    }
    changed++
  }
  return changed
}
