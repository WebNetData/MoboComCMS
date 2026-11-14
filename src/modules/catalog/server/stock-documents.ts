import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { toMinor } from '@/shared/money'
import { LocationError, addAtLocation, setLocationQuantity, itemKey } from '@/modules/catalog/server/locations'
import { lockProduct } from '@/modules/catalog/server/code-stock'

// Goods receiving (StockReceipt) and stock counts (StockCount). Every quantity change goes through the location owner,
// so the ledger, the site count and concurrent sales stay consistent.

type Audit = (tx: Prisma.TransactionClient, id: number) => Promise<void>
const noAudit: Audit = async () => {}

const text = (value: unknown, limit: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
const id = (value: unknown, label: string) => { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) throw new LocationError(`${label} معتبر نیست`); return n }
const optionalId = (value: unknown, label: string) => value === undefined || value === null || value === '' || value === 0 ? null : id(value, label)

export async function ownItem(productId: number, variantId: number | null, client: Prisma.TransactionClient = db) {
  const product = await client.product.findUnique({ where: { id: productId }, select: { id: true, name: true, currency: true, sellerId: true, digitalMode: true, variants: { where: { active: true }, select: { id: true, name: true } } } })
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
export async function createReceipt(input: Record<string, unknown>, actorId: number | null, audit: Audit = noAudit, client?: Prisma.TransactionClient) {
  const requestId = text(input.requestId, 80)
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new LocationError('شناسهٔ ثبت معتبر نیست؛ صفحه را تازه کنید')
  const locationId = id(input.locationId, 'محل دریافت')
  const raw = Array.isArray(input.lines) ? input.lines : []
  if (!raw.length || raw.length > 200) throw new LocationError('از ۱ تا ۲۰۰ ردیف کالا ثبت کنید')
  const requestLines = raw.map(value => { const row = (value || {}) as Record<string, unknown>; return { productId: id(row.productId, 'کالا'), variantId: optionalId(row.variantId, 'گونه'), quantity: Number(row.quantity), unitCost: String(row.unitCost ?? '').trim() } })
  const fingerprint = createHash('sha256').update(JSON.stringify({ locationId, supplier: text(input.supplier, 120), reference: text(input.reference, 80), note: text(input.note, 500), lines: requestLines })).digest('hex')
  const previous = await (client || db).stockReceipt.findUnique({ where: { requestId } })
  if (previous) {
    if (previous.actorId !== actorId || previous.fingerprint !== fingerprint) throw new LocationError('شناسهٔ رسید قبلاً با اطلاعات دیگری ثبت شده است', 409)
    return { id: previous.id, replayed: true }
  }
  const lines: { productId: number; variantId: number | null; quantity: number; unitCostMinor: bigint | null; name: string; currency: string }[] = []
  for (const value of requestLines) {
    const row = (value || {}) as Record<string, unknown>
    const productId = id(row.productId, 'کالا'), variantId = optionalId(row.variantId, 'گونه'), quantity = Number(row.quantity)
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1_000_000) throw new LocationError('تعداد دریافتی معتبر نیست')
    const owned = await ownItem(productId, variantId, client || db)
    const cost = String(row.unitCost ?? '').trim()
    let unitCostMinor: bigint | null = null
    if (cost) { try { unitCostMinor = toMinor(cost, owned.product.currency) } catch { throw new LocationError(`بهای خرید «${owned.name}» معتبر نیست`) } if (unitCostMinor < 0n) throw new LocationError('بهای خرید منفی نمی‌شود') }
    lines.push({ productId, variantId, quantity, unitCostMinor, name: owned.name, currency: owned.product.currency })
  }
  const currency = lines[0].currency
  if (lines.some((line) => line.currency !== currency)) throw new LocationError('کالاهای یک رسید باید یک واحد پول داشته باشند')
  if (new Set(lines.map((line) => itemKey(line.productId, line.variantId))).size !== lines.length) throw new LocationError('هر کالا را یک بار با تعداد کل بنویسید')
  const write = async (tx: Prisma.TransactionClient) => {
    const existing = await tx.stockReceipt.findUnique({ where: { requestId } })
    if (existing) {
      if (existing.actorId !== actorId || existing.fingerprint !== fingerprint) throw new LocationError('شناسهٔ رسید قبلاً با اطلاعات دیگری ثبت شده است', 409)
      return { id: existing.id, replayed: true }
    }
    const receipt = await tx.stockReceipt.create({ data: { number: `pending:${requestId}`, requestId, fingerprint, locationId, supplier: text(input.supplier, 120), reference: text(input.reference, 80), note: text(input.note, 500), currency, actorId, totalCostMinor: lines.reduce((sum, line) => sum + (line.unitCostMinor ?? 0n) * BigInt(line.quantity), 0n), lines: { create: lines.map(({ currency: _, ...line }) => line) } } })
    await tx.stockReceipt.update({ where: { id: receipt.id }, data: { number: `GR-${new Date().getFullYear()}-${String(receipt.id).padStart(5, '0')}` } })
    for (const line of [...lines].sort((a, b) => a.productId - b.productId || (a.variantId || 0) - (b.variantId || 0))) {
      await lockProduct(tx, line.productId)
      if (line.unitCostMinor !== null) {
        const onHand = (await tx.locationStock.aggregate({ where: { productId: line.productId, variantId: line.variantId }, _sum: { quantity: true } }))._sum.quantity || 0
        const variantCost = line.variantId ? await tx.productVariant.findUnique({ where: { id: line.variantId }, select: { costMinor: true, product: { select: { costMinor: true } } } }) : null
        const current = line.variantId ? variantCost?.costMinor ?? variantCost?.product.costMinor : (await tx.product.findUnique({ where: { id: line.productId }, select: { costMinor: true } }))?.costMinor
        const average = onHand <= 0 ? line.unitCostMinor : current === null || current === undefined ? null : (current * BigInt(onHand) + line.unitCostMinor * BigInt(line.quantity)) / BigInt(onHand + line.quantity)
        if (line.variantId) await tx.productVariant.update({ where: { id: line.variantId }, data: { costMinor: average } })
        else await tx.product.update({ where: { id: line.productId }, data: { costMinor: average } })
      }
      await addAtLocation(tx, { productId: line.productId, variantId: line.variantId, locationId, quantity: line.quantity }, 'RECEIPT', { actorId, refType: 'receipt', refId: receipt.id })
    }
    await audit(tx, receipt.id)
    return { id: receipt.id, replayed: false }
  }
  if (client) return write(client)
  try { return await db.$transaction(write, { timeout: 60_000 }) }
  catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error
    return db.$transaction(write, { timeout: 60_000 })
  }
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

export async function startCount(input: Record<string, unknown>, actorId: number | null, audit: Audit = noAudit) {
  const locationId = id(input.locationId, 'محل شمارش')
  if (!await db.stockLocation.findFirst({ where: { id: locationId, active: true } })) throw new LocationError('محل شمارش پیدا نشد', 404)
  try { return await db.$transaction(async tx => {
    const movementCursor = (await tx.stockMovement.aggregate({ where: { locationId }, _max: { id: true } }))._max.id || 0
    const row = await tx.stockCount.create({ data: { locationId, actorId, movementCursor, note: text(input.note, 300) || 'انبارگردانی' } })
    await audit(tx, row.id)
    return row
  }) }
  catch (error) { if ((error as { code?: string }).code === 'P2002') throw new LocationError('این محل شمارش باز دیگری دارد؛ همان را ادامه دهید یا لغو کنید', 409); throw error }
}

async function openCount(countId: number, tx: Prisma.TransactionClient) {
  if (/^postgres/.test(process.env.DATABASE_URL || '')) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StockCount" WHERE "id" = ${countId} FOR UPDATE`)
  const count = await tx.stockCount.findUnique({ where: { id: countId } })
  if (!count) throw new LocationError('شمارش پیدا نشد', 404)
  if (count.status !== 'OPEN') throw new LocationError('این شمارش بسته شده است', 409)
  return count
}

/** Records a counted item: an absolute count, or one more unit for each scan. */
export async function countLine(input: Record<string, unknown>, audit: Audit = noAudit) {
  const countId = id(input.countId, 'شمارش'), productId = id(input.productId, 'کالا'), variantId = optionalId(input.variantId, 'گونه')
  return db.$transaction(async tx => {
  await openCount(countId, tx)
  await audit(tx, countId)
  await lockProduct(tx, productId)
  const owned = await ownItem(productId, variantId, tx), key = itemKey(productId, variantId)
  const count = await tx.stockCount.findUniqueOrThrow({ where: { id: countId }, select: { locationId: true } })
  const movementCursor = (await tx.stockMovement.aggregate({ where: { locationId: count.locationId, productId, variantId }, _max: { id: true } }))._max.id || 0
  if (input.counted !== undefined) {
    const counted = Number(input.counted)
    if (!Number.isSafeInteger(counted) || counted < 0 || counted > 10_000_000) throw new LocationError('تعداد شمارش معتبر نیست')
    return tx.stockCountLine.upsert({ where: { countId_itemKey: { countId, itemKey: key } }, create: { countId, productId, variantId, itemKey: key, name: owned.name, counted, movementCursor }, update: { counted, movementCursor } })
  }
  return tx.stockCountLine.upsert({ where: { countId_itemKey: { countId, itemKey: key } }, create: { countId, productId, variantId, itemKey: key, name: owned.name, counted: 1, movementCursor }, update: { counted: { increment: 1 }, movementCursor } })
  })
}

export async function removeCountLine(input: Record<string, unknown>, audit: Audit = noAudit) {
  const countId = id(input.countId, 'شمارش'), lineId = id(input.lineId, 'ردیف')
  return db.$transaction(async tx => {
  await openCount(countId, tx)
  await audit(tx, countId)
  await tx.stockCountLine.deleteMany({ where: { id: lineId, countId } })
  return { ok: true }
  })
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
export async function postCount(input: Record<string, unknown>, actorId: number | null, audit: Audit = noAudit) {
  const countId = id(input.countId, 'شمارش'), full = input.full === true
  return db.$transaction(async (tx) => {
    await openCount(countId, tx)
    const count = await tx.stockCount.findUniqueOrThrow({ where: { id: countId }, include: { lines: true } })
    let changed = 0
    const ordered = [...count.lines].sort((a, b) => a.productId - b.productId || (a.variantId || 0) - (b.variantId || 0))
    for (const line of ordered) {
      await lockProduct(tx, line.productId)
      if (((await tx.stockMovement.aggregate({ where: { locationId: count.locationId, productId: line.productId, variantId: line.variantId }, _max: { id: true } }))._max.id || 0) !== line.movementCursor) throw new LocationError(`موجودی «${line.name}» پس از شمارش تغییر کرده است؛ دوباره بشمارید`, 409)
      const result = await setLocationQuantity(tx, { productId: line.productId, variantId: line.variantId, locationId: count.locationId, quantity: line.counted }, 'COUNT', { actorId, refType: 'count', refId: count.id })
      await tx.stockCountLine.update({ where: { id: line.id }, data: { expected: result.before, delta: result.delta } })
      if (result.delta) changed++
    }
    if (full) {
      const missing = await tx.locationStock.findMany({ where: { locationId: count.locationId, quantity: { gt: 0 }, itemKey: { notIn: count.lines.map((line) => line.itemKey) } }, include: { product: { select: { name: true } }, variant: { select: { name: true } } } })
      for (const row of missing.sort((a, b) => a.productId - b.productId)) {
        await lockProduct(tx, row.productId)
        if (await tx.stockMovement.count({ where: { locationId: count.locationId, productId: row.productId, variantId: row.variantId, id: { gt: count.movementCursor } } })) throw new LocationError('موجودی پس از شروع شمارش کامل تغییر کرده است؛ کالاهای تغییرکرده را بشمارید', 409)
        const result = await setLocationQuantity(tx, { productId: row.productId, variantId: row.variantId, locationId: count.locationId, quantity: 0 }, 'COUNT', { actorId, refType: 'count', refId: count.id, note: 'در شمارش کامل دیده نشد' })
        await tx.stockCountLine.create({ data: { countId, productId: row.productId, variantId: row.variantId, itemKey: row.itemKey, name: row.variant ? `${row.product.name} · ${row.variant.name}` : row.product.name, counted: 0, expected: result.before, delta: result.delta } })
        changed++
      }
    }
    const claimed = await tx.stockCount.updateMany({ where: { id: countId, status: 'OPEN' }, data: { status: 'POSTED', postedAt: new Date(), postedById: actorId } })
    if (claimed.count !== 1) throw new LocationError('این شمارش قبلاً ثبت یا لغو شده است', 409)
    await audit(tx, countId)
    return { changed }
  }, { timeout: 120_000 })
}

export async function cancelCount(input: Record<string, unknown>, audit: Audit = noAudit) {
  return db.$transaction(async tx => {
  const changed = await tx.stockCount.updateMany({ where: { id: id(input.countId, 'شمارش'), status: 'OPEN' }, data: { status: 'CANCELLED' } })
  if (changed.count !== 1) throw new LocationError('شمارش باز پیدا نشد', 409)
  await audit(tx, Number(input.countId))
  return { ok: true }
  })
}

export async function listCounts() {
  const rows = await db.stockCount.findMany({ orderBy: { id: 'desc' }, take: 40, include: { location: { select: { name: true } }, _count: { select: { lines: true } } } })
  return rows.map(({ _count, location, ...row }) => ({ ...row, location: location.name, lines: _count.lines, createdAt: row.createdAt.toISOString(), postedAt: row.postedAt?.toISOString() || null }))
}
