import { db } from '@/platform/database/prisma'

type Purchase = { userId: number; source: string; orderId: number | null; revokedAt: Date | null }
export async function purchaseIsLive(row: Purchase) {
  if (row.revokedAt) return false
  // Preserve old grants with no linked order, and explicit administrator gifts.
  if (row.source === 'ADMIN' || row.orderId === null) return true
  return !!await db.order.findFirst({ where: { id: row.orderId, userId: row.userId, status: 'PAID', invoice: { status: 'PAID' } }, select: { id: true } })
}

export async function livePurchases(userId: number, refs?: readonly { ownerType: string; ownerId: number }[], take = 500) {
  const rows = await db.contentPurchase.findMany({ where: { userId, revokedAt: null, ...(refs ? { OR: refs.map(ref => ({ ownerType: ref.ownerType, ownerId: ref.ownerId })) } : {}) }, orderBy: { createdAt: 'desc' }, take })
  const ids = [...new Set(rows.filter(row => row.source !== 'ADMIN' && row.orderId !== null).map(row => row.orderId!))]
  const paid = ids.length ? await db.order.findMany({ where: { id: { in: ids }, userId, status: 'PAID', invoice: { status: 'PAID' } }, select: { id: true } }) : []
  const active = new Set(paid.map(row => row.id))
  return rows.filter(row => row.source === 'ADMIN' || row.orderId === null || active.has(row.orderId))
}

export async function countLivePurchases(userId: number) {
  const rows = await db.$queryRaw<{ total: bigint | number }[]>`
    SELECT COUNT(*) AS total FROM "ContentPurchase" p
    WHERE p."userId" = ${userId} AND p."revokedAt" IS NULL
    AND (p."source" = 'ADMIN' OR p."orderId" IS NULL OR EXISTS (
      SELECT 1 FROM "Order" o JOIN "Invoice" i ON i."orderId" = o."id"
      WHERE o."id" = p."orderId" AND o."userId" = p."userId" AND o."status" = 'PAID' AND i."status" = 'PAID'
    ))`
  return Number(rows[0]?.total || 0)
}
