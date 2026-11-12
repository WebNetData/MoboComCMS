import { db } from '@/platform/database/prisma'
import { toMinor } from '@/shared/money'
import { LocationError, addAtLocation, setLocationQuantity, itemKey } from '@/modules/catalog/server/locations'
import { lockProduct } from '@/modules/catalog/server/code-stock'

// Goods receiving (StockReceipt) and stock counts (StockCount). Every quantity change goes through the location owner,
// so the ledger, the site count and concurrent sales stay consistent.

const text = (value: unknown, limit: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
const id = (value: unknown, label: string) => { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) throw new LocationError(`${label} معتبر نیست`); return n }
const optionalId = (value: unknown, label: string) => value === undefined || value === null || value === '' || value === 0 ? null : id(value, label)

async function ownItem(productId: number, variantId: number | null) {
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, name: true, currency: true, sellerId: true, digitalMode: true, variants: { where: { active: true }, select: { id: true, name: true } } } })
  if (!product || product.sellerId || product.digitalMode === 'CODES') throw new LocationError('این کالا موجودی انبار ندارد (انبار کد یا کالای فروشنده)')
  const variant = variantId ? product.variants.find((row) => row.id === variantId) : null
  if (variantId && !variant) throw new LocationError(`گونهٔ «${product.name}» پیدا نشد`)
  if (!variantId && product.variants.length) throw new LocationError(`گونهٔ «${product.name}» را انتخاب کنید`)
  return { product, variant: variant || null, name: variant ? `${product.name} · ${variant.name}` : product.name }
}

// ------------------------------------------------------------------ receiving

/**
 * Posts received goods: units are added at the location and, when a unit cost is given, the item's acquisition cost
 * becomes the moving average of what was on hand and what arrived. Same requestId = same receipt (safe retry).
 */
export async function createReceipt(input: Record<string, unknown>, actorId: number) {
  const requestId = text(input.requestId, 80)
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new LocationError('شناسهٔ ثبت معتبر نیست؛ صفحه را تازه کنید')
  const existing = await db.stockReceipt.findUnique({ where: { requestId }, select: { id: true } })
  if (existing) return { id: existing.id, replayed: true }
  const locationId = id(input.locationId, 'محل دریافت')
  const raw = Array.isArray(input.lines) ? input.lines : []
  if (!raw.length || raw.length > 200) throw new LocationError('از ۱ تا ۲۰۰ ردیف کالا ثبت کنید')
  const lines = []
  for (const value of raw) {
    const row = (value || {}) as Record<string, unknown>
    const productId = id(row.productId, 'کالا'), variantId = optionalId(row.variantId, 'گونه'), quantity = Math.floor(Number(row.quantity))
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1_000_000) throw new LocationError('تعداد دریافتی معتبر نیست')
    const owned = await ownItem(productId, variantId)
    const cost = String(row.unitCost ?? '').trim()
    let unitCostMinor: bigint | null = null
    if (cost) { try { unitCostMinor = toMinor(cost, owned.product.currency) } catch { throw new LocationError(`بهای خرید «${owned.name}» معتبر نیست`) } if (unitCostMinor < 0n) throw new LocationError('بهای خرید منفی نمی‌شود') }
    lines.push({ productId, variantId, quantity, unitCostMinor, name: owned.name, currency: owned.product.currency })
  }
  const currency = lines[0].currency
  if (lines.some((line) => line.currency !== currency)) throw new LocationError('کالاهای یک رسید باید یک واحد پول داشته باشند')
  if (new Set(lines.map((line) => itemKey(line.productId, line.variantId))).size !== lines.length) throw new LocationError('هر کالا را یک بار با تعداد کل بنویسید')
  return db.$transaction(async (tx) => {
    const receipt = await tx.stockReceipt.create({ data: { number: `pending:${requestId}`, requestId, locationId, supplier: text(input.supplier, 120), reference: text(input.reference, 80), note: text(input.note, 500), currency, actorId, totalCostMinor: lines.reduce((sum, line) => sum + (line.unitCostMinor ?? 0n) * BigInt(line.quantity), 0n), lines: { create: lines.map(({ currency: _, ...line }) => line) } } })
    await tx.stockReceipt.update({ where: { id: receipt.id }, data: { number: `GR-${new Date().getFullYear()}-${String(receipt.id).padStart(5, '0')}` } })
    for (const line of lines) {
      await lockProduct(tx, line.productId)
      if (line.unitCostMinor !== null) {
        const onHand = (await tx.locationStock.aggregate({ where: { productId: line.productId, variantId: line.variantId }, _sum: { quantity: true } }))._sum.quantity || 0
        const current = line.variantId ? (await tx.productVariant.findUnique({ where: { id: line.variantId }, select: { costMinor: true } }))?.costMinor : (await tx.product.findUnique({ where: { id: line.productId }, select: { costMinor: true } }))?.costMinor
        const average = current === null || current === undefined || onHand <= 0 ? line.unitCostMinor : (current * BigInt(onHand) + line.unitCostMinor * BigInt(line.quantity)) / BigInt(onHand + line.quantity)
        if (line.variantId) await tx.productVariant.update({ where: { id: line.variantId }, data: { costMinor: average } })
        else await tx.product.update({ where: { id: line.productId }, data: { costMinor: average } })
      }
      await addAtLocation(tx, { productId: line.productId, variantId: line.variantId, locationId, quantity: line.quantity }, 'RECEIPT', { actorId, refType: 'receipt', refId: receipt.id })
    }
    return { id: receipt.id, replayed: false }
  }, { timeout: 60_000 })
}

export async function listReceipts(page = 1) {
  const size = 30, skip = (Math.max(1, page) - 1) * size
  const [rows, total] = await Promise.all([db.stockReceipt.findMany({ orderBy: { id: 'desc' }, skip, take: size, include: { location: { select: { name: true } }, _count: { select: { lines: true } } } }), db.stockReceipt.count()])
  const units = await db.stockReceiptLine.groupBy({ by: ['receiptId'], where: { receiptId: { in: rows.map((row) => row.id) } }, _sum: { quantity: true } })
  return { pages: Math.max(1, Math.ceil(total / size)), receipts: rows.map(({ _count, location, ...row }) => ({ ...row, totalCostMinor: row.totalCostMinor.toString(), location: location.name, lines: _count.lines, units: units.find((entry) => entry.receiptId === row.id)?._sum.quantity || 0, createdAt: row.createdAt.toISOString() })) }
}

export async function receiptDetail(receiptId: unknown) {
  const row = await db.stockReceipt.findUnique({ where: { id: id(receiptId, 'رسید') }, include: { location: { select: { name: true } }, lines: { orderBy: { id: 'asc' } } } })
  if (!row) throw new LocationError('رسید پیدا نشد', 404)
  const actor = row.actorId ? await db.user.findUnique({ where: { id: row.actorId }, select: { name: true } }) : null
  return { ...row, location: row.location.name, actor: actor?.name || '', totalCostMinor: row.totalCostMinor.toString(), createdAt: row.createdAt.toISOString(), lines: row.lines.map((line) => ({ ...line, unitCostMinor: line.unitCostMinor?.toString() ?? null })) }
}

// ------------------------------------------------------------------ counting

export async function startCount(input: Record<string, unknown>, actorId: number) {
  const locationId = id(input.locationId, 'محل شمارش')
  if (!await db.stockLocation.findFirst({ where: { id: locationId, active: true } })) throw new LocationError('محل شمارش پیدا نشد', 404)
  try { return await db.stockCount.create({ data: { locationId, actorId, note: text(input.note, 300) } }) }
  catch { throw new LocationError('این محل شمارش باز دیگری دارد؛ همان را ادامه دهید یا لغو کنید', 409) }
}

async function openCount(countId: number) {
  const count = await db.stockCount.findUnique({ where: { id: countId } })
  if (!count) throw new LocationError('شمارش پیدا نشد', 404)
  if (count.status !== 'OPEN') throw new LocationError('این شمارش بسته شده است', 409)
  return count
}

/** Records a counted item: an absolute count, or one more unit for each scan. */
export async function countLine(input: Record<string, unknown>) {
  const countId = id(input.countId, 'شمارش'), productId = id(input.productId, 'کالا'), variantId = optionalId(input.variantId, 'گونه')
  await openCount(countId)
  const owned = await ownItem(productId, variantId), key = itemKey(productId, variantId)
  if (input.counted !== undefined) {
    const counted = Math.floor(Number(input.counted))
    if (!Number.isSafeInteger(counted) || counted < 0 || counted > 10_000_000) throw new LocationError('تعداد شمارش معتبر نیست')
    return db.stockCountLine.upsert({ where: { countId_itemKey: { countId, itemKey: key } }, create: { countId, productId, variantId, itemKey: key, name: owned.name, counted }, update: { counted } })
  }
  return db.stockCountLine.upsert({ where: { countId_itemKey: { countId, itemKey: key } }, create: { countId, productId, variantId, itemKey: key, name: owned.name, counted: 1 }, update: { counted: { increment: 1 } } })
}

export async function removeCountLine(input: Record<string, unknown>) {
  const countId = id(input.countId, 'شمارش'), lineId = id(input.lineId, 'ردیف')
  await openCount(countId)
  await db.stockCountLine.deleteMany({ where: { id: lineId, countId } })
  return { ok: true }
}

/** The count with each line's current location units, so the variance is visible before posting. */
export async function countDetail(countId: unknown) {
  const count = await db.stockCount.findUnique({ where: { id: id(countId, 'شمارش') }, include: { location: { select: { id: true, name: true } }, lines: { orderBy: { updatedAt: 'desc' } } } })
  if (!count) throw new LocationError('شمارش پیدا نشد', 404)
  const now = await db.locationStock.findMany({ where: { locationId: count.locationId }, include: { product: { select: { name: true } }, variant: { select: { name: true } } } })
  const units = new Map(now.map((row) => [row.itemKey, row.quantity]))
  const missing = count.status === 'OPEN' ? now.filter((row) => row.quantity > 0 && !count.lines.some((line) => line.itemKey === row.itemKey)).map((row) => ({ itemKey: row.itemKey, name: row.variant ? `${row.product.name} · ${row.variant.name}` : row.product.name, quantity: row.quantity })) : []
  return { ...count, createdAt: count.createdAt.toISOString(), postedAt: count.postedAt?.toISOString() || null, lines: count.lines.map((line) => ({ ...line, current: units.get(line.itemKey) ?? 0, updatedAt: line.updatedAt.toISOString() })), missing }
}

/**
 * Posts the count: every counted item is set to its count (ledger reason COUNT). With a full count, items held at
 * the location but not counted are set to zero too.
 */
export async function postCount(input: Record<string, unknown>, actorId: number) {
  const countId = id(input.countId, 'شمارش'), full = input.full === true
  return db.$transaction(async (tx) => {
    const claimed = await tx.stockCount.updateMany({ where: { id: countId, status: 'OPEN' }, data: { status: 'POSTED', postedAt: new Date(), postedById: actorId } })
    if (claimed.count !== 1) throw new LocationError('این شمارش قبلاً ثبت یا لغو شده است', 409)
    const count = await tx.stockCount.findUniqueOrThrow({ where: { id: countId }, include: { lines: true } })
    let changed = 0
    for (const line of count.lines) {
      const result = await setLocationQuantity(tx, { productId: line.productId, variantId: line.variantId, locationId: count.locationId, quantity: line.counted }, 'COUNT', { actorId, refType: 'count', refId: count.id })
      await tx.stockCountLine.update({ where: { id: line.id }, data: { expected: result.before, delta: result.delta } })
      if (result.delta) changed++
    }
    if (full) {
      const missing = await tx.locationStock.findMany({ where: { locationId: count.locationId, quantity: { gt: 0 }, itemKey: { notIn: count.lines.map((line) => line.itemKey) } }, include: { product: { select: { name: true } }, variant: { select: { name: true } } } })
      for (const row of missing) {
        const result = await setLocationQuantity(tx, { productId: row.productId, variantId: row.variantId, locationId: count.locationId, quantity: 0 }, 'COUNT', { actorId, refType: 'count', refId: count.id, note: 'در شمارش کامل دیده نشد' })
        await tx.stockCountLine.create({ data: { countId, productId: row.productId, variantId: row.variantId, itemKey: row.itemKey, name: row.variant ? `${row.product.name} · ${row.variant.name}` : row.product.name, counted: 0, expected: result.before, delta: result.delta } })
        changed++
      }
    }
    return { changed }
  }, { timeout: 120_000 })
}

export async function cancelCount(input: Record<string, unknown>) {
  const changed = await db.stockCount.updateMany({ where: { id: id(input.countId, 'شمارش'), status: 'OPEN' }, data: { status: 'CANCELLED' } })
  if (changed.count !== 1) throw new LocationError('شمارش باز پیدا نشد', 409)
  return { ok: true }
}

export async function listCounts() {
  const rows = await db.stockCount.findMany({ orderBy: { id: 'desc' }, take: 40, include: { location: { select: { name: true } }, _count: { select: { lines: true } } } })
  return rows.map(({ _count, location, ...row }) => ({ ...row, location: location.name, lines: _count.lines, createdAt: row.createdAt.toISOString(), postedAt: row.postedAt?.toISOString() || null }))
}
