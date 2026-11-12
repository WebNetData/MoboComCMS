import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { LocationError, recomputeOnline, transferStock, itemKey } from '@/modules/catalog/server/locations'
import { lockProduct } from '@/modules/catalog/server/code-stock'

// Admin reads and settings for stock locations (owner: catalog/server/locations for every quantity change).

const KINDS = ['WAREHOUSE', 'SHOP'] as const
const text = (value: unknown, limit: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
const positiveId = (value: unknown, label: string) => { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) throw new LocationError(`${label} معتبر نیست`); return id }

export async function listLocations() {
  const [rows, totals] = await Promise.all([
    db.stockLocation.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { _count: { select: { registers: { where: { status: 'OPEN' } } } } } }),
    db.locationStock.groupBy({ by: ['locationId'], _sum: { quantity: true }, _count: { _all: true }, where: { quantity: { gt: 0 } } }),
  ])
  const byId = new Map(totals.map((row) => [row.locationId, row]))
  return rows.map(({ _count, ...row }) => ({ ...row, units: byId.get(row.id)?._sum.quantity || 0, items: byId.get(row.id)?._count._all || 0, openRegisters: _count.registers }))
}

/** Creates or edits a location; changing what sells online rewrites the site counts of every product held there. */
export async function saveLocation(input: Record<string, unknown>, id?: number) {
  const name = text(input.name, 60)
  if (name.length < 2) throw new LocationError('نام محل را بنویسید')
  const kind = KINDS.includes(input.kind as typeof KINDS[number]) ? input.kind as typeof KINDS[number] : 'WAREHOUSE'
  const sortOrder = Math.max(0, Math.min(1000, Math.floor(Number(input.sortOrder) || 0)))
  const data = { name, kind, sellsOnline: input.sellsOnline !== false, active: input.active !== false, sortOrder, address: text(input.address, 300) }
  return db.$transaction(async (tx) => {
    const before = id ? await tx.stockLocation.findUnique({ where: { id } }) : null
    if (id && !before) throw new LocationError('محل موجودی پیدا نشد', 404)
    if (before?.isDefault && !data.active) throw new LocationError('انبار پیش‌فرض را نمی‌توان غیرفعال کرد؛ ابتدا محل دیگری را پیش‌فرض کنید')
    if (id && !data.active && await tx.storeRegisterSession.count({ where: { locationId: id, status: 'OPEN' } })) throw new LocationError('صندوق بازی از این محل می‌فروشد؛ ابتدا آن را ببندید', 409)
    const saved = id ? await tx.stockLocation.update({ where: { id }, data }) : await tx.stockLocation.create({ data })
    if (input.isDefault === true && !saved.isDefault) {
      if (!saved.active) throw new LocationError('محل غیرفعال نمی‌تواند پیش‌فرض باشد')
      await tx.stockLocation.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
      await tx.stockLocation.update({ where: { id: saved.id }, data: { isDefault: true } })
    }
    if (before && (before.sellsOnline !== saved.sellsOnline || before.active !== saved.active)) {
      const products = await tx.locationStock.findMany({ where: { locationId: saved.id }, distinct: ['productId'], select: { productId: true } })
      for (const { productId } of products) { await lockProduct(tx, productId); await recomputeOnline(tx, productId) }
    }
    return saved
  }, { timeout: 60_000 })
}

/** Stock matrix: tracked items with their units per location, held units and the site's sellable count. */
export async function locationStockView(input: { q?: unknown; locationId?: unknown; page?: unknown; filter?: unknown }) {
  const q = text(input.q, 80), page = Math.max(1, Math.floor(Number(input.page) || 1)), size = 40
  const locationId = input.locationId ? positiveId(input.locationId, 'محل') : null
  const where: Prisma.LocationStockWhereInput = {
    ...(locationId ? { locationId } : {}),
    ...(q ? { OR: [{ product: { name: { contains: q } } }, { product: { sku: { contains: q } } }, { product: { barcode: { contains: q } } }, { variant: { sku: { contains: q } } }, { variant: { barcode: { contains: q } } }] } : {}),
    ...(input.filter === 'empty' ? { quantity: 0 } : {}),
  }
  const keys = await db.locationStock.findMany({ where, distinct: ['itemKey'], orderBy: { itemKey: 'asc' }, select: { itemKey: true }, skip: (page - 1) * size, take: size })
  const total = (await db.locationStock.findMany({ where, distinct: ['itemKey'], select: { itemKey: true } })).length
  const rows = await db.locationStock.findMany({ where: { itemKey: { in: keys.map((row) => row.itemKey) } }, include: { product: { select: { id: true, name: true, sku: true, barcode: true, image: true, stock: true, onlineReserve: true, lowStockAt: true } }, variant: { select: { id: true, name: true, sku: true, barcode: true, stock: true } } } })
  const held = await db.inventoryReservation.groupBy({ by: ['productId', 'variantId'], where: { status: 'HELD', productId: { in: [...new Set(rows.map((row) => row.productId))] } }, _sum: { quantity: true } })
  const items = new Map<string, { key: string; productId: number; variantId: number | null; name: string; sku: string; barcode: string; image: string; online: number; reserve: number; lowStockAt: number; held: number; at: Record<number, number> }>()
  for (const row of rows) {
    const item = items.get(row.itemKey) || {
      key: row.itemKey, productId: row.productId, variantId: row.variantId, name: row.variant ? `${row.product.name} · ${row.variant.name}` : row.product.name,
      sku: row.variant?.sku || row.product.sku, barcode: row.variant?.barcode || row.product.barcode || (row.variantId ? `MC-V-${row.variantId}` : `MC-P-${row.productId}`),
      image: row.product.image, online: row.variant ? row.variant.stock : row.product.stock, reserve: row.product.onlineReserve, lowStockAt: row.product.lowStockAt,
      held: held.find((entry) => entry.productId === row.productId && entry.variantId === row.variantId)?._sum.quantity || 0, at: {},
    }
    item.at[row.locationId] = row.quantity
    items.set(row.itemKey, item)
  }
  return { page, pages: Math.max(1, Math.ceil(total / size)), total, items: keys.map((row) => items.get(row.itemKey)!).filter(Boolean) }
}

/** The ledger of one item (newest first). */
export async function itemLedger(productId: unknown, variantId: unknown) {
  const pid = positiveId(productId, 'کالا'), vid = variantId ? positiveId(variantId, 'گونه') : null
  const rows = await db.stockMovement.findMany({ where: { productId: pid, variantId: vid }, orderBy: { id: 'desc' }, take: 60, include: { location: { select: { name: true } } } })
  const actors = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.actorId).filter((id): id is number => !!id))] } }, select: { id: true, name: true } })
  return rows.map((row) => ({ id: row.id, location: row.location.name, delta: row.delta, balance: row.balance, reason: row.reason, orderId: row.orderId, refType: row.refType, refId: row.refId, note: row.note, actor: actors.find((actor) => actor.id === row.actorId)?.name || '', createdAt: row.createdAt.toISOString() }))
}

export async function transferItem(input: Record<string, unknown>, actorId: number) {
  const productId = positiveId(input.productId, 'کالا'), variantId = input.variantId ? positiveId(input.variantId, 'گونه') : null
  await db.$transaction((tx) => transferStock(tx, { productId, variantId, from: positiveId(input.from, 'مبدأ'), to: positiveId(input.to, 'مقصد'), quantity: Math.floor(Number(input.quantity)) }, { actorId, refType: 'transfer', note: text(input.note, 200) }))
  return { ok: true }
}

/** Units kept back from online sale for one product (per tracked item); rewrites its site count. */
export async function setOnlineReserve(input: Record<string, unknown>) {
  const productId = positiveId(input.productId, 'کالا'), reserve = Math.floor(Number(input.reserve))
  if (!Number.isSafeInteger(reserve) || reserve < 0 || reserve > 1_000_000) throw new LocationError('حاشیهٔ فروش آنلاین معتبر نیست')
  await db.$transaction(async (tx) => {
    await lockProduct(tx, productId)
    const changed = await tx.product.updateMany({ where: { id: productId, sellerId: null }, data: { onlineReserve: reserve } })
    if (changed.count !== 1) throw new LocationError('کالا پیدا نشد', 404)
    await recomputeOnline(tx, productId)
  })
  return { reserve }
}

/** Units of each counter product at one location (the register's), keyed like LocationStock. */
export async function unitsAt(locationId: number, productIds: number[]) {
  const rows = await db.locationStock.findMany({ where: { locationId, productId: { in: productIds } }, select: { itemKey: true, quantity: true } })
  const tracked = await db.locationStock.findMany({ where: { productId: { in: productIds } }, distinct: ['itemKey'], select: { itemKey: true } })
  return { at: new Map(rows.map((row) => [row.itemKey, row.quantity])), tracked: new Set(tracked.map((row) => row.itemKey)), key: itemKey }
}
