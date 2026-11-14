import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { minorToDecimal, toMinor } from '@/shared/money'
import { LocationError, itemKey } from '@/modules/catalog/server/locations'
import { ownItem, createReceipt } from '@/modules/catalog/server/stock-documents'

type Audit = (tx: Prisma.TransactionClient, id: number) => Promise<void>
const noAudit: Audit = async () => {}
const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const positive = (value: unknown, label: string) => { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0 || n > 2_147_483_647) throw new LocationError(`${label} معتبر نیست`); return n }
const version = (value: unknown) => { const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) throw new LocationError('نسخهٔ سفارش معتبر نیست'); return n }
const requestKey = (value: unknown) => { const key = clean(value, 80); if (!/^[0-9a-f-]{36}$/i.test(key)) throw new LocationError('شناسهٔ ثبت معتبر نیست؛ صفحه را تازه کنید'); return key }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const numberFor = (id: number) => `PO-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`
const isUnique = (error: unknown) => (error as { code?: string })?.code === 'P2002'
/** Upper bound for an order total in minor units: a clear validation error well before BIGINT/moving-average overflow. */
const MAX_PURCHASE_MINOR = 10n ** 15n
type PurchaseWithLines = Prisma.StockPurchaseGetPayload<{ include: { location: { select: { name: true } }; lines: { orderBy: { id: 'asc' } } } }>

function normalizeLines(input: unknown) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 200) throw new LocationError('از ۱ تا ۲۰۰ ردیف کالا ثبت کنید')
  return input.map((value) => {
    const row = (value || {}) as Record<string, unknown>
    const productId = positive(row.productId, 'کالا'), variantId = row.variantId === undefined || row.variantId === null || row.variantId === '' ? null : positive(row.variantId, 'گونه')
    const quantity = Number(row.quantity), cost = clean(row.unitCost, 40)
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) throw new LocationError('تعداد سفارش معتبر نیست')
    if (!cost) throw new LocationError('بهای خرید باید صفر یا بیشتر باشد')
    return { productId, variantId, quantity, cost }
  })
}

async function createWrite(input: Record<string, unknown>, actorId: number | null, audit: Audit, tx: Prisma.TransactionClient) {
  const requestId = requestKey(input.requestId), locationId = positive(input.locationId, 'محل دریافت')
  const supplier = clean(input.supplier, 120), note = clean(input.note, 500), expectedAtRaw = clean(input.expectedAt, 40)
  if (!supplier) throw new LocationError('نام تأمین‌کننده را وارد کنید')
  const expectedAt = expectedAtRaw ? new Date(expectedAtRaw) : null
  if (expectedAt && Number.isNaN(expectedAt.getTime())) throw new LocationError('تاریخ پیش‌بینی‌شده معتبر نیست')
  const normalized = normalizeLines(input.lines)
  if (new Set(normalized.map((line) => itemKey(line.productId, line.variantId))).size !== normalized.length) throw new LocationError('هر کالا و گونه را فقط یک بار وارد کنید')
  const fingerprint = digest({ locationId, supplier, note, expectedAt: expectedAt?.toISOString() ?? null, lines: normalized.map(({ productId, variantId, quantity, cost }) => ({ productId, variantId, quantity, cost })) })
  const replay = async () => {
    const prior = await tx.stockPurchase.findUnique({ where: { requestId }, include: { lines: true } })
    if (!prior) return null
    if (prior.actorId !== actorId || prior.fingerprint !== fingerprint) throw new LocationError('شناسهٔ سفارش قبلاً با اطلاعات دیگری ثبت شده است', 409)
    return { id: prior.id, number: prior.number, replayed: true }
  }
  const before = await replay(); if (before) return before
  const location = await tx.stockLocation.findFirst({ where: { id: locationId, active: true }, select: { id: true } })
  if (!location) throw new LocationError('محل دریافت فعال پیدا نشد', 404)
  const lines = []
  let currency: string | null = null
  for (const row of normalized) {
    const owned = await ownItem(row.productId, row.variantId, tx)
    if (currency && currency !== owned.product.currency) throw new LocationError('کالاهای یک سفارش باید یک واحد پول داشته باشند')
    currency = owned.product.currency
    let unitCostMinor: bigint
    try { unitCostMinor = toMinor(row.cost, currency) } catch { throw new LocationError(`بهای خرید «${owned.name}» معتبر نیست`) }
    if (unitCostMinor < 0n) throw new LocationError('بهای خرید منفی نمی‌شود')
    lines.push({ ...row, itemKey: itemKey(row.productId, row.variantId), name: owned.name, unitCostMinor })
  }
  const totalCostMinor = lines.reduce((sum, line) => sum + line.unitCostMinor * BigInt(line.quantity), 0n)
  if (totalCostMinor > MAX_PURCHASE_MINOR) throw new LocationError('جمع بهای سفارش خرید بیش از حد مجاز است')
  const purchase = await tx.stockPurchase.create({ data: { number: `pending:${requestId}`, requestId, fingerprint, supplier, note, expectedAt, locationId, currency: currency!, totalCostMinor, actorId, lines: { create: lines.map((line) => ({ productId: line.productId, variantId: line.variantId, itemKey: line.itemKey, name: line.name, quantity: line.quantity, unitCostMinor: line.unitCostMinor })) } } })
  await tx.stockPurchase.update({ where: { id: purchase.id }, data: { number: numberFor(purchase.id) } })
  await audit(tx, purchase.id)
  return { id: purchase.id, number: numberFor(purchase.id), replayed: false }
}

export async function createPurchase(input: Record<string, unknown>, actorId: number | null, audit: Audit = noAudit) {
  try { return await db.$transaction((tx) => createWrite(input, actorId, audit, tx), { timeout: 60_000 }) }
  catch (error) { if (!isUnique(error)) throw error; return db.$transaction((tx) => createWrite(input, actorId, audit, tx), { timeout: 60_000 }) }
}

const publicPurchase = (row: PurchaseWithLines) => ({
  id: row.id, number: row.number, supplier: row.supplier, locationId: row.locationId, location: row.location?.name || '',
  status: row.status, version: row.version, currency: row.currency, totalCostMinor: row.totalCostMinor.toString(),
  expectedAt: row.expectedAt?.toISOString() || null, note: row.note, createdAt: row.createdAt.toISOString(),
  lines: row.lines.map((line) => ({ id: line.id, itemKey: line.itemKey, productId: line.productId, variantId: line.variantId, name: line.name, quantity: line.quantity, receivedQuantity: line.receivedQuantity, outstanding: line.quantity - line.receivedQuantity, unitCostMinor: line.unitCostMinor.toString() })),
})

export async function listPurchases(page = 1) {
  const size = 30, requested = Number(page) || 1, safePage = Number.isSafeInteger(requested) ? Math.max(1, Math.min(100_000, requested)) : 1, skip = (safePage - 1) * size
  const [rows, total] = await Promise.all([db.stockPurchase.findMany({ orderBy: { id: 'desc' }, skip, take: size, include: { location: { select: { name: true } }, lines: { orderBy: { id: 'asc' } } } }), db.stockPurchase.count()])
  return { pages: Math.max(1, Math.ceil(total / size)), purchases: rows.map(publicPurchase) }
}

export async function purchaseDetail(purchaseId: unknown) {
  const row = await db.stockPurchase.findUnique({ where: { id: positive(purchaseId, 'سفارش خرید') }, include: { location: { select: { name: true } }, lines: { orderBy: { id: 'asc' } }, receipts: { include: { receipt: { select: { id: true, number: true, requestId: true, createdAt: true } } } } } })
  if (!row) throw new LocationError('سفارش خرید پیدا نشد', 404)
  return { purchase: { ...publicPurchase(row), receipts: row.receipts.map(({ receipt }) => ({ id: receipt.id, number: receipt.number, createdAt: receipt.createdAt.toISOString() })) } }
}

export async function purchasableItem(productId: unknown, variantId: unknown) {
  const owned = await ownItem(positive(productId, 'کالا'), variantId === undefined || variantId === null || variantId === '' ? null : positive(variantId, 'گونه'))
  return { productId: owned.product.id, variantId: owned.variant?.id ?? null, name: owned.name, currency: owned.product.currency }
}

async function lockPurchase(tx: Prisma.TransactionClient, purchaseId: number) {
  if (/^postgres/.test(process.env.DATABASE_URL || '')) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StockPurchase" WHERE "id" = ${purchaseId} FOR UPDATE`)
  const row = await tx.stockPurchase.findUnique({ where: { id: purchaseId }, include: { lines: { orderBy: { id: 'asc' } } } })
  if (!row) throw new LocationError('سفارش خرید پیدا نشد', 404)
  return row
}

export async function receivePurchase(input: Record<string, unknown>, actorId: number | null, audit: Audit = noAudit) {
  const purchaseId = positive(input.purchaseId, 'سفارش خرید'), requestId = requestKey(input.requestId), expectedVersion = version(input.version)
  const raw = Array.isArray(input.lines) ? input.lines : []
  if (!raw.length || raw.length > 200) throw new LocationError('اقلام دریافت‌شده را مشخص کنید')
  const quantities = raw.map((value) => { const row = (value || {}) as Record<string, unknown>, lineId = positive(row.lineId, 'ردیف سفارش'), quantity = Number(row.quantity); if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) throw new LocationError('تعداد دریافتی معتبر نیست'); return { lineId, quantity } })
  if (new Set(quantities.map((line) => line.lineId)).size !== quantities.length) throw new LocationError('هر ردیف سفارش را فقط یک بار وارد کنید')
  return db.$transaction(async (tx) => {
    const purchase = await lockPurchase(tx, purchaseId)
    const requested = quantities.map((entry) => {
      const line = purchase.lines.find((candidate) => candidate.id === entry.lineId)
      if (!line) throw new LocationError('ردیف سفارش خرید پیدا نشد', 404)
      return { line, quantity: entry.quantity }
    })
    const receiptInput = { requestId, locationId: purchase.locationId, supplier: purchase.supplier, reference: purchase.number, note: `دریافت سفارش خرید ${purchase.number}`, lines: requested.map(({ line, quantity }) => ({ productId: line.productId, variantId: line.variantId, quantity, unitCost: minorToDecimal(line.unitCostMinor, purchase.currency) })) }
    const priorReceipt = await tx.stockReceipt.findUnique({ where: { requestId } })
    if (priorReceipt) {
      const link = await tx.stockPurchaseReceipt.findUnique({ where: { receiptId: priorReceipt.id } })
      if (!link || link.purchaseId !== purchase.id) throw new LocationError('شناسهٔ رسید قبلاً برای سفارش دیگری استفاده شده است', 409)
      const replay = await createReceipt(receiptInput, actorId, noAudit, tx)
      if (!replay.replayed) throw new LocationError('رسید تکراری قابل بازیابی نیست', 409)
      return { receiptId: replay.id, replayed: true, version: purchase.version, status: purchase.status }
    }
    if (purchase.status !== 'OPEN' && purchase.status !== 'PARTIAL') throw new LocationError('این سفارش خرید بسته شده است', 409)
    if (purchase.version !== expectedVersion) throw new LocationError('سفارش خرید تغییر کرده است؛ صفحه را تازه کنید', 409)
    for (const { line, quantity } of requested) if (quantity > line.quantity - line.receivedQuantity) throw new LocationError(`دریافت «${line.name}» از تعداد باقی‌مانده بیشتر است`, 409)
    // The frozen cost is in the purchase currency; receipt cost is read in the product's current currency.
    const currencies = await tx.product.findMany({ where: { id: { in: [...new Set(requested.map(({ line }) => line.productId))] } }, select: { id: true, currency: true } })
    if (currencies.some((product) => product.currency !== purchase.currency)) throw new LocationError('واحد پول کالا پس از ثبت سفارش خرید تغییر کرده است؛ این ردیف را با سفارش جدید دریافت کنید', 409)
    const allReceived = purchase.lines.every((line) => line.receivedQuantity + (requested.find((entry) => entry.line.id === line.id)?.quantity || 0) === line.quantity)
    const status = allReceived ? 'RECEIVED' : 'PARTIAL'
    const claim = await tx.stockPurchase.updateMany({ where: { id: purchase.id, status: purchase.status, version: expectedVersion }, data: { status, version: { increment: 1 } } })
    if (claim.count !== 1) throw new LocationError('سفارش خرید هم‌زمان تغییر کرده است؛ دوباره تلاش کنید', 409)
    const receipt = await createReceipt(receiptInput, actorId, audit, tx)
    for (const { line, quantity } of requested) await tx.stockPurchaseLine.updateMany({ where: { id: line.id, purchaseId: purchase.id, receivedQuantity: line.receivedQuantity }, data: { receivedQuantity: { increment: quantity } } }).then((result) => { if (result.count !== 1) throw new LocationError('مقدار دریافتی هم‌زمان تغییر کرده است؛ دوباره تلاش کنید', 409) })
    await tx.stockPurchaseReceipt.create({ data: { purchaseId: purchase.id, receiptId: receipt.id } })
    return { receiptId: receipt.id, replayed: false, version: expectedVersion + 1, status }
  }, { timeout: 60_000 })
}

export async function cancelPurchase(input: Record<string, unknown>, audit: Audit = noAudit) {
  const purchaseId = positive(input.purchaseId, 'سفارش خرید'), expectedVersion = version(input.version)
  return db.$transaction(async (tx) => {
    const purchase = await lockPurchase(tx, purchaseId)
    // A retried cancel whose first response was lost: the same version step already produced CANCELLED.
    if (purchase.status === 'CANCELLED' && purchase.version === expectedVersion + 1) return { id: purchase.id, status: 'CANCELLED', version: purchase.version, replayed: true }
    if (purchase.status !== 'OPEN' && purchase.status !== 'PARTIAL') throw new LocationError('این سفارش خرید بسته شده است', 409)
    if (purchase.version !== expectedVersion) throw new LocationError('سفارش خرید تغییر کرده است؛ صفحه را تازه کنید', 409)
    const claim = await tx.stockPurchase.updateMany({ where: { id: purchase.id, status: purchase.status, version: expectedVersion }, data: { status: 'CANCELLED', version: { increment: 1 } } })
    if (claim.count !== 1) throw new LocationError('سفارش خرید هم‌زمان تغییر کرده است؛ دوباره تلاش کنید', 409)
    await audit(tx, purchase.id)
    return { id: purchase.id, status: 'CANCELLED', version: expectedVersion + 1, replayed: false }
  }, { timeout: 60_000 })
}
