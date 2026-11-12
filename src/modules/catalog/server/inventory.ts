import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { syncCodeStock } from '@/modules/catalog/server/code-stock'
import { OutOfStock, takeFromLocations, returnToLocations, readAllocation, trackedItem } from '@/modules/catalog/server/locations'
export { OutOfStock }

// Stock is held per order line while an invoice is open, so concurrent
// checkouts cannot oversell the last unit. Store orders list their lines in
// OrderLine; older single-item orders (and manual invoices) fall back to
// Order.productId + meta.variantId as line 0.

type Tx = Prisma.TransactionClient
type StockLine = { line: number; productId: number; variantId: number | null; quantity: number }


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

/**
 * Takes stock for one line; throws OutOfStock when it cannot. Location-tracked items take from stock locations
 * (the given one for the counter, online locations otherwise); untracked items keep the plain counters.
 */
async function takeStock(tx: Tx, item: StockLine, place: { locationId?: number | null; orderId?: number } = {}) {
  let product = await tx.product.findUnique({ where: { id: item.productId }, select: { id: true, active: true, stock: true, digitalMode: true } })
  if (!product || !product.active) throw new OutOfStock('product unavailable')
  // A product that delivers codes sells what its pool holds: its stock is recomputed, under its row lock, before it is taken from.
  if (product.digitalMode === 'CODES') {
    await syncCodeStock(tx, product.id)
    product = (await tx.product.findUnique({ where: { id: item.productId }, select: { id: true, active: true, stock: true, digitalMode: true } }))!
  }
  const variant = item.variantId ? await tx.productVariant.findFirst({ where: { id: item.variantId, productId: product.id, active: true }, select: { id: true, stock: true } }) : null
  if (item.variantId && !variant) throw new OutOfStock('variant unavailable')
  if (product.digitalMode !== 'CODES') {
    const allocation = await takeFromLocations(tx, { productId: product.id, variantId: variant?.id ?? null, quantity: item.quantity }, place)
    if (allocation) return { finite: product.stock >= 0, variantFinite: Boolean(variant && variant.stock >= 0), variantId: variant?.id ?? null, allocation: JSON.stringify(allocation) }
  }
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
  return { finite, variantFinite, variantId: variant?.id ?? null, allocation: '' }
}

/** Puts one reservation's units back: to its stock locations when tracked, otherwise to the plain counters. */
async function giveBack(tx: Tx, row: { orderId: number; productId: number; variantId: number | null; quantity: number; finite: boolean; variantFinite: boolean; allocation: string }, reason: 'RELEASE' | 'RESTOCK', toLocationId?: number | null) {
  if (row.allocation || await trackedItem(tx, row.productId, row.variantId)) {
    if (await returnToLocations(tx, row, readAllocation(row.allocation), reason, { orderId: row.orderId }, toLocationId)) return
  }
  if (row.finite) await tx.product.updateMany({ where: { id: row.productId, stock: { gte: 0 } }, data: { stock: { increment: row.quantity } } })
  if (row.variantFinite && row.variantId) await tx.productVariant.updateMany({ where: { id: row.variantId, stock: { gte: 0 } }, data: { stock: { increment: row.quantity } } })
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
  return run((tx) => reserveInventoryInTransaction(tx, input))
}

/** The same reservation owner inside a larger atomic sale; the counter passes its register's stock location. */
export async function reserveInventoryInTransaction(tx: Tx, input: { orderId: number; holdMinutes?: number; locationId?: number | null }) {
    const lines = await orderStockLines(tx, input.orderId)
    const existing = await tx.inventoryReservation.findMany({ where: { orderId: input.orderId } })
    if (existing.some((row) => row.status === 'RELEASED')) throw new OutOfStock('inventory reservation was released')
    for (const item of lines) {
      if (existing.some((row) => row.line === item.line)) continue
      const taken = await takeStock(tx, item, { locationId: input.locationId, orderId: input.orderId })
      await tx.inventoryReservation.create({ data: { orderId: input.orderId, line: item.line, productId: item.productId, variantId: taken.variantId, quantity: item.quantity, finite: taken.finite, variantFinite: taken.variantFinite, allocation: taken.allocation, status: 'HELD', expiresAt: holdFor(input.holdMinutes) } })
    }
    return lines.length
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
        if (row.expiresAt > now) continue
        // Past its lease but not yet released: the stock is still ours, extend it. If the expiry
        // job released it at this very moment, the line is taken again below.
        const extended = await tx.inventoryReservation.updateMany({ where: { id: row.id, status: 'HELD' }, data: { expiresAt: holdFor(input.holdMinutes) } })
        if (extended.count) continue
      }
      const taken = await takeStock(tx, item, { orderId: input.orderId })
      const data = { productId: item.productId, variantId: taken.variantId, quantity: item.quantity, finite: taken.finite, variantFinite: taken.variantFinite, allocation: taken.allocation, status: 'HELD', expiresAt: holdFor(input.holdMinutes) }
      if (row) await tx.inventoryReservation.update({ where: { id: row.id }, data })
      else await tx.inventoryReservation.create({ data: { ...data, orderId: input.orderId, line: item.line } })
    }
    return lines.length
  })
}

/** Marks the held stock as sold (after payment). */
export async function consumeInventoryReservation(orderId: number, client: Tx | typeof db = db) {
  const rows = await client.inventoryReservation.findMany({ where: { orderId } })
  if (!rows.length) return { ok: true as const, consumed: false }
  if (rows.some((row) => row.status === 'RELEASED')) return { ok: false as const, message: 'inventory reservation was released' }
  await client.inventoryReservation.updateMany({ where: { orderId, status: 'HELD' }, data: { status: 'CONSUMED' } })
  return { ok: true as const, consumed: true }
}

async function returnStock(orderId: number, from: 'HELD' | 'CONSUMED', toLocationId?: number | null, transaction?: Tx) {
  const work = async (tx: Tx) => {
    const rows = await tx.inventoryReservation.findMany({ where: { orderId, status: from } })
    let count = 0
    for (const row of rows) {
      const changed = await tx.inventoryReservation.updateMany({ where: { id: row.id, status: from }, data: { status: 'RELEASED' } })
      if (changed.count !== 1) continue
      count++
      await giveBack(tx, row, from === 'HELD' ? 'RELEASE' : 'RESTOCK', toLocationId)
    }
    // A product that sells from its code pool has no stock of its own: what came back is whatever its pool says now
    // (a code already given to the buyer does not return to the shelf with the order).
    for (const productId of new Set(rows.map((row) => row.productId))) await syncCodeStock(tx, productId)
    return count
  }
  return transaction ? work(transaction) : db.$transaction(work)
}

/** Returns held stock of an unpaid order to the shelf. */
export async function releaseInventoryReservation(orderId: number, transaction?: Tx) {
  return { ok: true as const, released: (await returnStock(orderId, 'HELD', null, transaction)) > 0 }
}

/** Returns sold stock to the shelf (a paid order cancelled or returned by staff), optionally into one stock location. */
export function restockConsumedInventory(orderId: number, toLocationId?: number | null, transaction?: Tx) {
  return returnStock(orderId, 'CONSUMED', toLocationId, transaction)
}

/** Order states whose stock is sold: the hold waits for delivery and must not expire. */
const PAID_ORDER = ['PAID', 'COMPLETED']

/**
 * Returns the stock of unpaid orders whose hold has run out. A paid order keeps its
 * hold until delivery consumes it, however long delivery is delayed; and a hold that
 * was extended (a payment arriving) after it was listed here is left alone.
 */
export async function releaseExpiredReservations(limit = 100) {
  const now = new Date()
  const rows = await db.inventoryReservation.findMany({
    where: { status: 'HELD', expiresAt: { lt: now } },
    orderBy: { expiresAt: 'asc' },
    distinct: ['orderId'],
    select: { orderId: true },
    take: Math.max(1, Math.min(500, limit)),
  })
  let released = 0
  for (const { orderId } of rows) {
    released += await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } })
      const expired = { orderId, status: 'HELD', expiresAt: { lt: now } }
      if (order && PAID_ORDER.includes(order.status)) {
        // Keeps the paid hold and moves it out of this job's window.
        await tx.inventoryReservation.updateMany({ where: expired, data: { expiresAt: holdFor(60) } })
        return 0
      }
      let count = 0
      for (const row of await tx.inventoryReservation.findMany({ where: expired })) {
        const changed = await tx.inventoryReservation.updateMany({ where: { id: row.id, status: 'HELD', expiresAt: { lt: now } }, data: { status: 'RELEASED' } })
        if (changed.count !== 1) continue
        count++
        await giveBack(tx, row, 'RELEASE')
      }
      return count ? 1 : 0
    })
  }
  return released
}
