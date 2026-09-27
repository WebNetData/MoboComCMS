import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'

// Stock is held per order line while an invoice is open, so concurrent
// checkouts cannot oversell the last unit. Store orders list their lines in
// OrderLine; older single-item orders (and manual invoices) fall back to
// Order.productId + meta.variantId as line 0.

type Tx = Prisma.TransactionClient
type StockLine = { line: number; productId: number; variantId: number | null; quantity: number }

class OutOfStock extends Error {}

const holdFor = (minutes: number | undefined) => new Date(Date.now() + Math.max(5, Math.min(24 * 60, Math.floor(minutes || 30))) * 60_000)

async function orderStockLines(tx: Tx, orderId: number): Promise<StockLine[]> {
  const lines = await tx.orderLine.findMany({ where: { orderId, productId: { not: null } }, orderBy: { line: 'asc' }, select: { line: true, productId: true, variantId: true, quantity: true } })
  if (lines.length) return lines.map((row) => ({ line: row.line, productId: row.productId!, variantId: row.variantId, quantity: Math.max(1, row.quantity) }))
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { productId: true, meta: true } })
  if (!order?.productId) return []
  let meta: Record<string, unknown> = {}
  try { meta = JSON.parse(order.meta || '{}') } catch { /* legacy row */ }
  return [{ line: 0, productId: order.productId, variantId: Number(meta.variantId) || null, quantity: 1 }]
}

/** Takes stock for one line; throws OutOfStock when it cannot. */
async function takeStock(tx: Tx, item: StockLine) {
  const product = await tx.product.findUnique({ where: { id: item.productId }, select: { id: true, active: true, stock: true } })
  if (!product || !product.active) throw new OutOfStock('product unavailable')
  const variant = item.variantId ? await tx.productVariant.findFirst({ where: { id: item.variantId, productId: product.id, active: true }, select: { id: true, stock: true } }) : null
  if (item.variantId && !variant) throw new OutOfStock('variant unavailable')
  const finite = product.stock >= 0
  const variantFinite = Boolean(variant && variant.stock >= 0)
  if (variantFinite) {
    const changed = await tx.productVariant.updateMany({ where: { id: variant!.id, stock: { gte: item.quantity } }, data: { stock: { decrement: item.quantity } } })
    if (changed.count !== 1) throw new OutOfStock('out of stock')
  }
  if (finite) {
    const changed = await tx.product.updateMany({ where: { id: product.id, stock: { gte: item.quantity } }, data: { stock: { decrement: item.quantity } } })
    if (changed.count !== 1) throw new OutOfStock('out of stock')
  }
  return { finite, variantFinite, variantId: variant?.id ?? null }
}

async function run(work: (tx: Tx) => Promise<number>) {
  try {
    return { ok: true as const, lines: await db.$transaction(work) }
  } catch (error) {
    if (error instanceof OutOfStock) return { ok: false as const, message: error.message }
    throw error
  }
}

/**
 * Reserves every line of an order in one transaction (all or nothing).
 * Lines that already have a reservation are left as they are.
 */
export function reserveInventory(input: { orderId: number; holdMinutes?: number }) {
  return run(async (tx) => {
    const lines = await orderStockLines(tx, input.orderId)
    const existing = await tx.inventoryReservation.findMany({ where: { orderId: input.orderId } })
    if (existing.some((row) => row.status === 'RELEASED')) throw new OutOfStock('inventory reservation was released')
    for (const item of lines) {
      if (existing.some((row) => row.line === item.line)) continue
      const taken = await takeStock(tx, item)
      await tx.inventoryReservation.create({ data: { orderId: input.orderId, line: item.line, productId: item.productId, variantId: taken.variantId, quantity: item.quantity, finite: taken.finite, variantFinite: taken.variantFinite, status: 'HELD', expiresAt: holdFor(input.holdMinutes) } })
    }
    return lines.length
  })
}

/**
 * Makes sure the order's stock is held (before a late or manual settlement):
 * live holds are kept, expired-but-unreleased holds are extended and released
 * lines are taken again when stock allows.
 */
export function ensureInventoryReservation(input: { orderId: number; holdMinutes?: number }) {
  return run(async (tx) => {
    const lines = await orderStockLines(tx, input.orderId)
    const existing = await tx.inventoryReservation.findMany({ where: { orderId: input.orderId } })
    const now = new Date()
    for (const item of lines) {
      const row = existing.find((reservation) => reservation.line === item.line)
      if (row?.status === 'CONSUMED') continue
      if (row?.status === 'HELD') {
        // Past its lease but not yet released: the stock is still ours, extend it.
        if (row.expiresAt <= now) await tx.inventoryReservation.update({ where: { id: row.id }, data: { expiresAt: holdFor(input.holdMinutes) } })
        continue
      }
      const taken = await takeStock(tx, item)
      const data = { productId: item.productId, variantId: taken.variantId, quantity: item.quantity, finite: taken.finite, variantFinite: taken.variantFinite, status: 'HELD', expiresAt: holdFor(input.holdMinutes) }
      if (row) await tx.inventoryReservation.update({ where: { id: row.id }, data })
      else await tx.inventoryReservation.create({ data: { ...data, orderId: input.orderId, line: item.line } })
    }
    return lines.length
  })
}

/** Marks the held stock as sold (after payment). */
export async function consumeInventoryReservation(orderId: number) {
  const rows = await db.inventoryReservation.findMany({ where: { orderId } })
  if (!rows.length) return { ok: true as const, consumed: false }
  if (rows.some((row) => row.status === 'RELEASED')) return { ok: false as const, message: 'inventory reservation was released' }
  await db.inventoryReservation.updateMany({ where: { orderId, status: 'HELD' }, data: { status: 'CONSUMED' } })
  return { ok: true as const, consumed: true }
}

async function returnStock(orderId: number, from: 'HELD' | 'CONSUMED') {
  return db.$transaction(async (tx) => {
    const rows = await tx.inventoryReservation.findMany({ where: { orderId, status: from } })
    let count = 0
    for (const row of rows) {
      const changed = await tx.inventoryReservation.updateMany({ where: { id: row.id, status: from }, data: { status: 'RELEASED' } })
      if (changed.count !== 1) continue
      count++
      if (row.finite) await tx.product.updateMany({ where: { id: row.productId }, data: { stock: { increment: row.quantity } } })
      if (row.variantFinite && row.variantId) await tx.productVariant.updateMany({ where: { id: row.variantId }, data: { stock: { increment: row.quantity } } })
    }
    return count
  })
}

/** Returns held stock of an unpaid order to the shelf. */
export async function releaseInventoryReservation(orderId: number) {
  return { ok: true as const, released: (await returnStock(orderId, 'HELD')) > 0 }
}

/** Returns sold stock to the shelf (a paid order cancelled or returned by staff). */
export function restockConsumedInventory(orderId: number) {
  return returnStock(orderId, 'CONSUMED')
}

export async function releaseExpiredReservations(limit = 100) {
  const rows = await db.inventoryReservation.findMany({
    where: { status: 'HELD', expiresAt: { lt: new Date() } },
    orderBy: { expiresAt: 'asc' },
    distinct: ['orderId'],
    select: { orderId: true },
    take: Math.max(1, Math.min(500, limit)),
  })
  let released = 0
  for (const row of rows) if ((await releaseInventoryReservation(row.orderId)).released) released++
  return released
}
