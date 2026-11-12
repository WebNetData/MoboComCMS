import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'

// Stock of a product that delivers codes from its own pool (Product.digitalMode = CODES). Nobody types
// that stock in: it is the codes on the shelf minus the units open orders already hold. Kept beside the
// inventory holds because every hold of such a product recomputes it first, under the product's row lock,
// so two buyers are never promised the last code whatever else wrote the stock column.

type Tx = Prisma.TransactionClient
const postgres = () => /^postgres/.test(process.env.DATABASE_URL || '')
/** Units of a line still without a code. */
const missingCodes = (quantity: number, assigned: number) => Math.max(0, Math.max(1, quantity) - assigned)

/** Locks the product row so a checkout cannot take stock between our count and our write. */
export async function lockProduct(tx: Tx, productId: number) {
  if (postgres()) await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`
}

/**
 * Writes the stock of a CODES product and of its variants: codes on the shelf minus the units that
 * orders hold (reserved or paid) and have not received yet. Does nothing for a MANUAL product.
 */
export async function syncCodeStock(tx: Tx, productId: number) {
  await lockProduct(tx, productId)
  const product = await tx.product.findUnique({ where: { id: productId }, select: { digitalMode: true, codesWhenEmpty: true, stock: true, variants: { select: { id: true, stock: true } } } })
  if (!product || product.digitalMode !== 'CODES') return null
  // Sold without limit: an order the shelf cannot serve goes to a specialist (store/domain/digital-codes CODES_WHEN_EMPTY).
  if (product.codesWhenEmpty === 'STAFF') {
    if (product.variants.some((variant) => variant.stock !== -1)) await tx.productVariant.updateMany({ where: { productId }, data: { stock: -1 } })
    if (product.stock !== -1) await tx.product.update({ where: { id: productId }, data: { stock: -1 } })
    return -1
  }
  const [shelf, held, given] = await Promise.all([
    tx.productDigitalCode.groupBy({ by: ['variantId'], where: { productId, orderId: null }, _count: { _all: true } }),
    tx.inventoryReservation.findMany({ where: { productId, status: { in: ['HELD', 'CONSUMED'] } }, select: { orderId: true, line: true, variantId: true, quantity: true, status: true } }),
    tx.productDigitalCode.groupBy({ by: ['orderId', 'orderLine'], where: { productId, orderId: { not: null }, returnedAt: null }, _count: { _all: true } }),
  ])
  const givenTo = new Map(given.map((row) => [`${row.orderId}:${row.orderLine}`, row._count._all]))
  const open = await openOrders(tx, held.filter((row) => row.status === 'CONSUMED').map((row) => row.orderId))
  const owed = new Map<number | null, number>()
  // A hold is an open checkout; a sold unit still counts while its paid order waits for delivery.
  for (const row of held) if (row.status === 'HELD' || open.has(row.orderId)) owed.set(row.variantId, (owed.get(row.variantId) || 0) + missingCodes(row.quantity, givenTo.get(`${row.orderId}:${row.line}`) || 0))
  const free = (variantId: number | null) => Math.max(0, (shelf.find((row) => row.variantId === variantId)?._count._all || 0) - (owed.get(variantId) || 0))
  let total = free(null)
  for (const variant of product.variants) {
    const stock = free(variant.id)
    total += stock
    if (variant.stock !== stock) await tx.productVariant.update({ where: { id: variant.id }, data: { stock } })
  }
  if (product.stock !== total) await tx.product.update({ where: { id: productId }, data: { stock: total } })
  return total
}

/**
 * Of these orders, the paid ones whose delivery is still open. An order staff delivered, cancelled or took
 * back is closed: it neither takes codes nor holds stock (orders delivered by hand before a product got its
 * pool would otherwise empty the pool).
 */
export async function openOrders(tx: Tx | typeof db, orderIds: number[]): Promise<Set<number>> {
  if (!orderIds.length) return new Set()
  const rows = await tx.order.findMany({ where: { id: { in: orderIds }, status: 'PAID' }, select: { id: true, productDelivery: { select: { status: true } } } })
  return new Set(rows.filter((row) => !row.productDelivery || !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(row.productDelivery.status)).map((row) => row.id))
}
