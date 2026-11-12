import { createInboxEvent } from '@/modules/notifications/server/inbox'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import type { LineChoice, RefundLine } from '@/modules/store/domain/returns'
const parseJson = <T>(raw: string, fallback: T): T => { try { return JSON.parse(raw) as T } catch { return fallback } }
const minorOf = (value: unknown) => { try { return BigInt(String(value ?? '0')) } catch { return 0n } }
export async function lockOrder(tx: Prisma.TransactionClient, orderId: number) {
  if (/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL || '')) await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
  // SQLite serializes writes through its existing transaction/file lock.
}
export function loadOrder(orderId: number, userId?: number, client: Prisma.TransactionClient = db) {
  return client.order.findFirst({
    where: { id: orderId, productId: { not: null }, ...(userId ? { userId } : {}) },
    include: {
      lines: { orderBy: { line: 'asc' }, include: { product: { select: { slug: true } } } },
      productDelivery: { select: { status: true, deliveredAt: true } },
      invoice: { select: { id: true, number: true, status: true } },
      returns: { orderBy: { createdAt: 'desc' } },
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  })
}
export type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>

/** How much of the order has already gone back, and which quantities are taken by other requests. */
export function ledger(order: LoadedOrder) {
  const refunded = order.returns.filter((row) => row.status === 'REFUNDED').reduce((sum, row) => sum + row.refundMinor, 0n)
  const taken = new Map<number, number>()
  for (const row of order.returns) {
    if (!['REQUESTED', 'APPROVED', 'REFUNDED'].includes(row.status)) continue
    if (row.kind === 'CANCEL') { for (const line of order.lines) taken.set(line.line, line.quantity); continue }
    for (const choice of parseJson<LineChoice[]>(row.lines, [])) taken.set(choice.line, (taken.get(choice.line) || 0) + choice.quantity)
  }
  const lines: RefundLine[] = order.lines.map((line) => ({ line: line.line, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, totalMinor: line.totalMinor, returnedQuantity: Math.min(line.quantity, taken.get(line.line) || 0) }))
  const meta = parseJson<Record<string, unknown>>(order.meta, {})
  const itemsMinor = order.lines.reduce((sum, line) => sum + line.totalMinor, 0n)
  return { refunded, remaining: order.totalMinor - refunded, lines, itemsMinor, discountMinor: minorOf(meta.discountMinor) }
}

export async function notifyCustomer(row: { id: number; number: string; orderId: number; userId: number | null }, status: string, title: string, body: string) {
  // A guest bought at the counter has no account to notify; their durable return record stays linked to the original order.
  if (!row.userId) return
  await createInboxEvent({
    userId: row.userId, kind: 'ORDER_REFUND', dedupeKey: `return:${row.id}:${status}`,
    titleEn: `Request ${row.number}: ${status.toLowerCase()}`, titleFa: title, bodyEn: body, bodyFa: body, href: `/dashboard/orders/${row.orderId}`,
  }).catch(() => {})
}
