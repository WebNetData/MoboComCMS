import type { Prisma } from '@prisma/client'
import { lockProduct } from '@/modules/catalog/server/code-stock'

// Stock locations (warehouse / shop). An own-store product or variant with finite stock is "tracked": its units live
// in LocationStock rows, every change is written to the StockMovement ledger, and Product/ProductVariant.stock is a
// cache of what the site may sell = units in active locations that sell online, minus Product.onlineReserve.
// Code-pool products, unlimited stock (-1) and marketplace sellers' products stay untracked on the old fields.
// Every change locks the product row first, so concurrent sales, transfers and counts of one product serialize.

type Tx = Prisma.TransactionClient
export class OutOfStock extends Error {}
export class LocationError extends Error { constructor(message: string, readonly status = 400) { super(message) } }
export type Allocation = { l: number; q: number }[]
export type StockItem = { productId: number; variantId: number | null }
export type MovementReason = 'INIT' | 'HOLD' | 'RELEASE' | 'RESTOCK' | 'TRANSFER' | 'RECEIPT' | 'COUNT' | 'ADJUST'
type Ref = { orderId?: number | null; refType?: string; refId?: number | null; actorId?: number | null; note?: string }

export const itemKey = (productId: number, variantId: number | null) => `${productId}:${variantId || 0}`
export function readAllocation(raw: string | null | undefined): Allocation {
  try {
    const value = JSON.parse(raw || '[]')
    return Array.isArray(value) ? value.filter((row) => Number.isSafeInteger(row?.l) && Number.isSafeInteger(row?.q) && row.q > 0).map((row) => ({ l: row.l, q: row.q })) : []
  } catch { return [] }
}

/** The default location (the main warehouse); created once if a database has none. */
export async function defaultLocationId(tx: Tx) {
  const row = await tx.stockLocation.findFirst({ where: { isDefault: true }, select: { id: true } })
  if (row) return row.id
  try { return (await tx.stockLocation.create({ data: { name: 'انبار اصلی', kind: 'WAREHOUSE', sellsOnline: true, isDefault: true } })).id }
  catch { return (await tx.stockLocation.findFirstOrThrow({ where: { isDefault: true }, select: { id: true } })).id }
}

/** A single active, non-selling destination for physical returns awaiting inspection. */
export async function quarantineLocationId(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(72419031)`
  const row = await tx.stockLocation.findFirst({ where: { isQuarantine: true }, select: { id: true, active: true } })
  if (row?.active) return row.id
  if (row) return (await tx.stockLocation.update({ where: { id: row.id }, data: { active: true, sellsOnline: false, isDefault: false } })).id
  return (await tx.stockLocation.create({ data: { name: 'قرنطینهٔ کالای مرجوعی', kind: 'WAREHOUSE', sellsOnline: false, isDefault: false, active: true, isQuarantine: true } })).id
}

/** Which key an order line's units are kept under, or null when the item is not location-tracked. */
export async function trackedItem(tx: Tx, productId: number, variantId: number | null): Promise<StockItem | null> {
  if (variantId && await tx.locationStock.findFirst({ where: { productId, variantId, location: { isQuarantine: false } }, select: { id: true } })) return { productId, variantId }
  if (await tx.locationStock.findFirst({ where: { productId, variantId: null, location: { isQuarantine: false } }, select: { id: true } })) return { productId, variantId: null }
  return null
}

async function move(tx: Tx, locationId: number, item: StockItem, delta: number, reason: MovementReason, ref: Ref = {}) {
  const key = itemKey(item.productId, item.variantId)
  let row = await tx.locationStock.findUnique({ where: { locationId_itemKey: { locationId, itemKey: key } } })
  if (!row) {
    if (delta < 0) throw new OutOfStock('location has none of this item')
    row = await tx.locationStock.create({ data: { locationId, productId: item.productId, variantId: item.variantId, itemKey: key, quantity: 0 } })
  }
  if (delta !== 0) {
    const changed = await tx.locationStock.updateMany({ where: { id: row.id, ...(delta < 0 ? { quantity: { gte: -delta } } : {}) }, data: { quantity: { increment: delta } } })
    if (changed.count !== 1) throw new OutOfStock('not enough units at this location')
  }
  const balance = row.quantity + delta
  await tx.stockMovement.create({ data: { locationId, productId: item.productId, variantId: item.variantId, delta, balance, reason, orderId: ref.orderId ?? null, refType: ref.refType || '', refId: ref.refId ?? null, actorId: ref.actorId ?? null, note: (ref.note || '').slice(0, 300) } })
  return balance
}

/** Rewrites the site's sellable counts (Product/ProductVariant.stock) from online locations, minus the online reserve. */
export async function recomputeOnline(tx: Tx, productId: number, preserveUnlimited = false) {
  const product = await tx.product.findUnique({ where: { id: productId }, select: { stock: true, onlineReserve: true } })
  if (!product) return
  const rows = await tx.locationStock.findMany({ where: { productId }, select: { variantId: true, quantity: true, location: { select: { sellsOnline: true, active: true, isQuarantine: true } } } })
  if (!rows.length) return
  const online = new Map<number | null, number>()
  for (const row of rows) if (!row.location.isQuarantine) online.set(row.variantId, (online.get(row.variantId) || 0) + (row.location.active && row.location.sellsOnline ? row.quantity : 0))
  let variantTotal = 0, variantTracked = false
  for (const [variantId, units] of online) {
    const available = Math.max(0, units - product.onlineReserve)
    if (variantId === null) { if (!preserveUnlimited || product.stock >= 0) await tx.product.update({ where: { id: productId }, data: { stock: available } }) }
    else { variantTracked = true; variantTotal += available; await tx.productVariant.updateMany({ where: { id: variantId, productId, ...(preserveUnlimited ? { stock: { gte: 0 } } : {}) }, data: { stock: available } }) }
  }
  // A product whose variants are tracked and whose own count is finite caps at the sum of its variants.
  if (variantTracked && !online.has(null) && product.stock >= 0) await tx.product.update({ where: { id: productId }, data: { stock: variantTotal } })
}

/**
 * Takes units for an order line. With a location (the counter's register) the units must be there; otherwise
 * they come from active online locations in their order, as long as the online reserve stays untouched.
 * Returns null for untracked items (the caller keeps the old count path).
 */
export async function takeFromLocations(tx: Tx, item: StockItem & { quantity: number }, options: { locationId?: number | null; orderId?: number | null } = {}): Promise<Allocation | null> {
  await lockProduct(tx, item.productId)
  const tracked = await trackedItem(tx, item.productId, item.variantId)
  if (!tracked) return null
  const rows = await tx.locationStock.findMany({ where: { productId: tracked.productId, itemKey: itemKey(tracked.productId, tracked.variantId) }, include: { location: true }, orderBy: [{ location: { sortOrder: 'asc' } }, { locationId: 'asc' }] })
  const allocation: Allocation = []
  if (options.locationId) {
    const row = rows.find((candidate) => candidate.locationId === options.locationId && candidate.location.active && !candidate.location.isQuarantine)
    if (!row || row.quantity < item.quantity) throw new OutOfStock('not enough units at this location')
    allocation.push({ l: row.locationId, q: item.quantity })
  } else {
    const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { onlineReserve: true } })
    const sources = rows.filter((row) => row.location.active && row.location.sellsOnline && !row.location.isQuarantine && row.quantity > 0)
    if (sources.reduce((sum, row) => sum + row.quantity, 0) - product.onlineReserve < item.quantity) throw new OutOfStock('out of stock online')
    let left = item.quantity
    for (const row of sources) { if (!left) break; const take = Math.min(left, row.quantity); allocation.push({ l: row.locationId, q: take }); left -= take }
  }
  for (const part of allocation) await move(tx, part.l, tracked, -part.q, 'HOLD', { orderId: options.orderId })
  await recomputeOnline(tx, tracked.productId)
  return allocation
}

/** Puts an order line's units back where they were taken from (legacy holds go to the default location). */
export async function returnToLocations(tx: Tx, item: StockItem & { quantity: number }, allocation: Allocation, reason: 'RELEASE' | 'RESTOCK', ref: Ref = {}, toLocationId?: number | null) {
  await lockProduct(tx, item.productId)
  const tracked = await trackedItem(tx, item.productId, item.variantId)
  if (!tracked) return false
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new LocationError('تعداد برگشتی معتبر نیست')
  if (toLocationId) await activeLocation(tx, toLocationId)
  if (!toLocationId && allocation.length && allocation.reduce((sum, part) => sum + part.q, 0) !== item.quantity) throw new LocationError('سهم محل‌های رزرو با تعداد کالا تطبیق ندارد', 409)
  const parts = toLocationId ? [{ l: toLocationId, q: item.quantity }] : allocation.length ? allocation : [{ l: await defaultLocationId(tx), q: item.quantity }]
  for (const part of parts) await move(tx, part.l, tracked, part.q, reason, ref)
  await recomputeOnline(tx, tracked.productId)
  return true
}

/** Received physical returns enter quarantine even when this is the first location row for a legacy item. */
export async function receiveQuarantineStock(tx: Tx, item: StockItem & { quantity: number }, ref: Ref = {}) {
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new LocationError('تعداد کالای برگشتی معتبر نیست')
  await lockProduct(tx, item.productId)
  const { item: checked } = await itemOf(tx, item.productId, item.variantId)
  if (!await trackedItem(tx, checked.productId, checked.variantId)) await adoptEditorStock(tx, checked.productId, ref.actorId)
  const inventoryItem = await trackedItem(tx, checked.productId, checked.variantId) || checked
  const locationId = await quarantineLocationId(tx)
  await move(tx, locationId, inventoryItem, item.quantity, 'RESTOCK', { ...ref, refType: 'return' })
  await recomputeOnline(tx, checked.productId, true)
  return locationId
}

/** Records inspected non-sellable units while preserving physical custody in quarantine. */
export async function disposeQuarantineStock(tx: Tx, item: StockItem & { quantity: number }, ref: Ref = {}) {
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new LocationError('تعداد بررسی‌شده معتبر نیست')
  await lockProduct(tx, item.productId)
  const { item: checked } = await itemOf(tx, item.productId, item.variantId)
  const inventoryItem = await trackedItem(tx, checked.productId, checked.variantId) || checked
  const locationId = await quarantineLocationId(tx)
  const stored = await tx.locationStock.findUnique({ where: { locationId_itemKey: { locationId, itemKey: itemKey(inventoryItem.productId, inventoryItem.variantId) } } })
  if (!stored || stored.quantity < item.quantity) throw new LocationError('موجودی قرنطینه برای ثبت بررسی کافی نیست', 409)
  await move(tx, locationId, inventoryItem, 0, 'ADJUST', { ...ref, note: ref.note || 'ثبت وضعیت کالای غیرقابل‌فروش در قرنطینه' })
}

async function itemOf(tx: Tx, productId: number, variantId: number | null) {
  const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true, sellerId: true, digitalMode: true, name: true } })
  if (!product) throw new LocationError('کالا پیدا نشد', 404)
  if (product.sellerId || product.digitalMode === 'CODES') throw new LocationError('موجودی این کالا از انبار کد یا فروشنده مدیریت می‌شود')
  const variant = variantId ? await tx.productVariant.findFirst({ where: { id: variantId, productId }, select: { id: true, name: true } }) : null
  if (variantId && !variant) throw new LocationError('گونهٔ کالا پیدا نشد', 404)
  return { item: { productId, variantId: variant?.id ?? null }, name: variant ? `${product.name} · ${variant.name}` : product.name }
}

async function activeLocation(tx: Tx, locationId: number) {
  const location = await tx.stockLocation.findFirst({ where: { id: locationId, active: true }, select: { id: true, name: true, isQuarantine: true } })
  if (!location) throw new LocationError('محل موجودی پیدا نشد یا غیرفعال است', 404)
  return location
}

/** Sets the units of one item at one location (manual correction or a posted count); tracking starts if needed. */
export async function setLocationQuantity(tx: Tx, input: StockItem & { locationId: number; quantity: number }, reason: 'ADJUST' | 'COUNT' | 'INIT', ref: Ref = {}) {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 0 || input.quantity > 10_000_000) throw new LocationError('تعداد معتبر نیست')
  await lockProduct(tx, input.productId)
  const { item } = await itemOf(tx, input.productId, input.variantId)
  if ((await activeLocation(tx, input.locationId)).isQuarantine) throw new LocationError('موجودی قرنطینه فقط از مسیر دریافت مرجوعی و بررسی سلامت تغییر می‌کند', 409)
  const row = await tx.locationStock.findUnique({ where: { locationId_itemKey: { locationId: input.locationId, itemKey: itemKey(item.productId, item.variantId) } } })
  const before = row?.quantity || 0
  const balance = await move(tx, input.locationId, item, input.quantity - before, reason, ref)
  await recomputeOnline(tx, item.productId)
  return { before, after: balance, delta: input.quantity - before }
}

/** Adds received units at a location (goods receiving). */
export async function addAtLocation(tx: Tx, input: StockItem & { locationId: number; quantity: number }, reason: 'RECEIPT' | 'RESTOCK', ref: Ref = {}) {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0 || input.quantity > 1_000_000) throw new LocationError('تعداد معتبر نیست')
  await lockProduct(tx, input.productId)
  const { item } = await itemOf(tx, input.productId, input.variantId)
  if ((await activeLocation(tx, input.locationId)).isQuarantine) throw new LocationError('موجودی قرنطینه فقط از مسیر دریافت مرجوعی و بررسی سلامت تغییر می‌کند', 409)
  const balance = await move(tx, input.locationId, item, input.quantity, reason, ref)
  await recomputeOnline(tx, item.productId)
  return balance
}

/** Moves units between two locations as one audited pair of movements. */
export async function transferStock(tx: Tx, input: StockItem & { from: number; to: number; quantity: number }, ref: Ref = {}) {
  if (input.from === input.to) throw new LocationError('مبدأ و مقصد انتقال یکی است')
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0 || input.quantity > 1_000_000) throw new LocationError('تعداد انتقال معتبر نیست')
  await lockProduct(tx, input.productId)
  const checked = await itemOf(tx, input.productId, input.variantId)
  const item = ref.refType === 'return-inspection' ? await trackedItem(tx, input.productId, input.variantId) || checked.item : checked.item
  const name = checked.name
  const [from, to] = [await activeLocation(tx, input.from), await activeLocation(tx, input.to)]
  if (from.isQuarantine && ref.refType !== 'return-inspection') throw new LocationError('خروج از قرنطینه فقط پس از تأیید بررسی سلامت مجاز است', 409)
  if (to.isQuarantine) throw new LocationError('ورود به قرنطینه از مسیر دریافت کالای مرجوعی انجام می‌شود', 409)
  try { await move(tx, from.id, item, -input.quantity, 'TRANSFER', { ...ref, note: ref.note || `انتقال به ${to.name}` }) }
  catch (error) { if (error instanceof OutOfStock) throw new LocationError(`موجودی «${name}» در ${from.name} کافی نیست`, 409); throw error }
  await move(tx, to.id, item, input.quantity, 'TRANSFER', { ...ref, note: ref.note || `انتقال از ${from.name}` })
  await recomputeOnline(tx, item.productId, ref.refType === 'return-inspection')
}

/**
 * After a catalogue import wrote counts: a tracked item's imported count becomes its main-warehouse units (the
 * external source counts that warehouse); untracked items start or stop tracking like an editor save.
 */
export async function applyImportedStock(tx: Tx, productId: number, imported: { product?: number; variants: Map<number, number> }) {
  const product = await tx.product.findUnique({ where: { id: productId }, select: { sellerId: true, digitalMode: true } })
  if (!product || product.sellerId || product.digitalMode === 'CODES') return
  const entries: [number | null, number][] = [...(imported.product !== undefined ? [[null, imported.product] as [null, number]] : []), ...imported.variants]
  for (const [variantId, value] of entries) {
    if (value < 0) continue
    const tracked = await trackedItem(tx, productId, variantId)
    if (tracked && tracked.variantId === variantId) await setLocationQuantity(tx, { productId, variantId, locationId: await defaultLocationId(tx), quantity: value }, 'ADJUST', { note: 'همگام‌سازی درون‌ریزی' })
  }
  await adoptEditorStock(tx, productId)
}

/**
 * After the product editor saves: a tracked item keeps its location units (the editor's number is the site cache
 * and is rewritten); -1 stops tracking; a new finite count starts tracking in the default location.
 */
export async function adoptEditorStock(tx: Tx, productId: number, actorId?: number | null) {
  await lockProduct(tx, productId)
  const product = await tx.product.findUnique({ where: { id: productId }, select: { stock: true, sellerId: true, digitalMode: true, variants: { select: { id: true, stock: true } } } })
  if (!product || product.sellerId || product.digitalMode === 'CODES') return
  const finiteVariants = product.variants.filter((variant) => variant.stock >= 0)
  const wanted: (StockItem & { typed: number })[] = finiteVariants.length ? finiteVariants.map((variant) => ({ productId, variantId: variant.id, typed: variant.stock })) : product.stock >= 0 ? [{ productId, variantId: null, typed: product.stock }] : []
  const rows = await tx.locationStock.findMany({ where: { productId, location: { isQuarantine: false } }, select: { id: true, locationId: true, variantId: true, quantity: true } })
  // Items switched to unlimited (or no longer the tracked level) stop being tracked; their units leave the ledger.
  for (const row of rows) {
    if (wanted.some((item) => item.variantId === row.variantId)) continue
    if (row.quantity) await tx.stockMovement.create({ data: { locationId: row.locationId, productId, variantId: row.variantId, delta: -row.quantity, balance: 0, reason: 'ADJUST', actorId: actorId ?? null, note: 'موجودی نامحدود شد' } })
    await tx.locationStock.delete({ where: { id: row.id } })
  }
  const home = wanted.some((item) => !rows.some((row) => row.variantId === item.variantId)) ? await defaultLocationId(tx) : 0
  for (const item of wanted) {
    if (rows.some((row) => row.variantId === item.variantId)) continue
    await move(tx, home, item, item.typed, 'INIT', { actorId, note: 'ثبت در ویرایش محصول' })
  }
  await recomputeOnline(tx, productId)
}
