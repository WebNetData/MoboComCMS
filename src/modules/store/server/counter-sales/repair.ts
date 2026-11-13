import type { Prisma } from '@prisma/client'

export const REPAIR_WORK_SLUG = 'repair-work'

/**
 * Every store order names a product (lists, reports, returns and the order page find store orders by it). A repair
 * invoice of work only names this one catalogue item: inactive, so it is never sold online or picked at the counter,
 * made on first use and renamed freely in Admin. Its lines keep no product, so no stock is ever taken from it.
 */
export async function repairWorkProduct(tx: Prisma.TransactionClient, currency: string) {
  const found = await tx.product.findUnique({ where: { slug: REPAIR_WORK_SLUG }, select: { id: true } })
  if (found) return found.id
  // A concurrent first sale creates it too: the unique slug fails one transaction and the sale is retried.
  return (await tx.product.create({ data: { slug: REPAIR_WORK_SLUG, sku: 'REPAIR-WORK', name: 'خدمات و اجرت تعمیر', kind: 'VIRTUAL', digitalMode: 'MANUAL', active: false, stock: 0, price: 0, priceMinor: 0n, currency }, select: { id: true } })).id
}
