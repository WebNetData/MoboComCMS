import { db } from '@/platform/database/prisma'
import { Prisma } from '@prisma/client'
import { logEvent } from '@/platform/observability/logger'
import { decryptDigitalDelivery, digitalFingerprint, encryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { StoreError } from '@/modules/store/domain/store'
import { composeDelivery, maskCode, missingCodes, normalizeCodesWhenEmpty, normalizeDigitalMode, parseCodes, type DeliveredLine, type DigitalMode } from '@/modules/store/domain/digital-codes'
import { transitionOrder } from '@/modules/store/server/orders'
import { lockProduct, openOrders, syncCodeStock } from '@/modules/catalog/server/code-stock'
import { createInboxEvent } from '@/modules/notifications/server/inbox'

// The code pool of virtual products: staff fill it, a paid order takes from it by itself.
//
// Stock of a CODES product is not typed in by anyone: it is the codes on the shelf minus the units open
// orders already hold (see catalog/server/code-stock), written after every change to the pool, before
// every checkout takes from it and by a worker step.
//
// A code leaves the shelf once and for good. One that is taken back from its buyer (the order was refunded,
// or staff replaced a code that did not work) keeps its order and is marked returned: it is void, it is
// not the buyer's any more, and it is never sold again.

const postgres = () => /^postgres/.test(process.env.DATABASE_URL || '')
const sameVariant = (variantId: number | null) => (variantId === null ? { variantId: null } : { variantId })

/** Worker step: puts the stock of every CODES product back in line with its pool (after an edit elsewhere). */
export async function syncAllCodeStock(limit = 200) {
  const products = await db.product.findMany({ where: { digitalMode: 'CODES' }, orderBy: { id: 'asc' }, take: limit, select: { id: true, stock: true } })
  let changed = 0
  let failed = 0
  for (const product of products) {
    try { if ((await db.$transaction((tx) => syncCodeStock(tx, product.id))) !== product.stock) changed++ } catch (error) { failed++; logEvent('error', 'store.code_stock_failed', { productId: product.id, error }) }
  }
  return { checked: products.length, changed, failed }
}

async function codeProduct(productId: number, client: Prisma.TransactionClient = db) {
  const product = await client.product.findUnique({ where: { id: productId }, select: { id: true, kind: true, digitalMode: true, openAmount: true, isService: true, variants: { where: { active: true }, select: { id: true, name: true } } } })
  if (!product) throw new StoreError('محصول پیدا نشد', 404, 'PRODUCT_NOT_FOUND')
  return product
}

/** Switches a virtual product between staff delivery and its own code pool. */
export async function setDigitalMode(productId: number, value: unknown, client: Prisma.TransactionClient = db): Promise<{ mode: DigitalMode; stock: number }> {
  if (client === db) return db.$transaction(tx => setDigitalMode(productId, value, tx))
  const mode = normalizeDigitalMode(value)
  await lockProduct(client, productId)
  const product = await codeProduct(productId, client), tx = client
  if (mode !== 'MANUAL' && product.kind !== 'VIRTUAL') throw new StoreError('تحویل دیجیتال فقط برای محصول مجازی است')
  if (mode === 'FILES' && (product.openAmount || product.isService)) throw new StoreError('تحویل فایل برای خدمت یا سفارش با مبلغ دلخواه فعال نمی‌شود')
  await tx.product.update({ where: { id: productId }, data: { digitalMode: mode } })
  if (mode === 'CODES') return { mode, stock: (await syncCodeStock(tx, productId)) ?? 0 }
    // Back to staff delivery: the product is no longer limited by its pool. The codes stay for a later return to it.
    if (product.digitalMode === 'CODES' || mode === 'FILES') {
      await tx.product.update({ where: { id: productId }, data: { stock: -1 } })
      await tx.productVariant.updateMany({ where: { productId }, data: { stock: -1 } })
    }
  return { mode, stock: -1 }
}

/** What a code product does when its shelf is empty: stop selling, or keep selling and hand the order to a specialist. */
export async function setCodesWhenEmpty(productId: number, value: unknown) {
  const codesWhenEmpty = normalizeCodesWhenEmpty(value)
  return db.$transaction(async (tx) => {
    await lockProduct(tx, productId)
    const product = await codeProduct(productId, tx)
    if (product.kind !== 'VIRTUAL') throw new StoreError('این گزینه فقط برای محصول مجازی است')
    await tx.product.update({ where: { id: productId }, data: { codesWhenEmpty } })
    return { codesWhenEmpty, stock: (await syncCodeStock(tx, productId)) ?? -1 }
  })
}

/** Adds pasted codes to the pool. A code the product already has (on the shelf or delivered) is skipped and counted. */
export async function addCodes(input: { productId: number; variantId?: unknown; text: unknown }) {
  const product = await codeProduct(input.productId)
  if (product.kind !== 'VIRTUAL') throw new StoreError('کد فقط برای محصول مجازی ثبت می‌شود')
  const variantId = input.variantId === null || input.variantId === undefined || input.variantId === '' ? null : Number(input.variantId)
  if (variantId !== null && !product.variants.some((variant) => variant.id === variantId)) throw new StoreError('تنوع انتخاب‌شده برای این محصول نیست')
  if (variantId === null && product.variants.length) throw new StoreError('این محصول تنوع دارد؛ تنوعِ این کدها را انتخاب کنید')
  let parsed: ReturnType<typeof parseCodes>
  try { parsed = parseCodes(input.text) } catch (error) { throw new StoreError(error instanceof Error ? error.message : 'کدها معتبر نیستند') }
  if (!parsed.codes.length) throw new StoreError('کدی وارد نشده است')
  const rows = parsed.codes.map((code) => ({ productId: product.id, variantId, secret: encryptDigitalDelivery(code), fingerprint: digitalFingerprint(code) }))
  const result = await db.$transaction(async (tx) => {
    // SQLite's Prisma client has no skipDuplicates; claim only the fingerprint conflict on both databases.
    let added = 0
    const now = new Date()
    for (let offset = 0; offset < rows.length; offset += 150) {
      const values = rows.slice(offset, offset + 150).map(row => Prisma.sql`(${row.productId}, ${row.variantId}, ${row.secret}, ${row.fingerprint}, ${now})`)
      added += await tx.$executeRaw(Prisma.sql`INSERT INTO "ProductDigitalCode" ("productId", "variantId", "secret", "fingerprint", "createdAt") VALUES ${Prisma.join(values)} ON CONFLICT ("productId", "fingerprint") DO NOTHING`)
    }
    const stock = await syncCodeStock(tx, product.id)
    return { added, stock }
  })
  // Orders that were paid while the shelf was empty get theirs now.
  const waiting = result.added ? await deliverWaitingOrders(product.id).catch((error) => { logEvent('error', 'store.codes_waiting_failed', { productId: product.id, error }); return { delivered: 0 } }) : { delivered: 0 }
  return { added: result.added, repeated: parsed.repeated, existing: parsed.codes.length - result.added, stock: result.stock, deliveredWaiting: waiting.delivered }
}

/** The pool of one product for staff: counts, the shelf (masked) and the latest deliveries. */
export async function listCodes(productId: number) {
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, kind: true, digitalMode: true, codesWhenEmpty: true, stock: true, variants: { where: { active: true }, orderBy: { id: 'asc' }, select: { id: true, name: true, stock: true } } } })
  if (!product) throw new StoreError('محصول پیدا نشد', 404, 'PRODUCT_NOT_FOUND')
  const [available, delivered, shelf, recent] = await Promise.all([
    db.productDigitalCode.count({ where: { productId, orderId: null } }),
    db.productDigitalCode.count({ where: { productId, orderId: { not: null }, returnedAt: null } }),
    db.productDigitalCode.findMany({ where: { productId, orderId: null }, orderBy: { id: 'asc' }, take: 100, select: { id: true, variantId: true, secret: true, createdAt: true } }),
    db.productDigitalCode.findMany({ where: { productId, orderId: { not: null } }, orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }], take: 20, select: { id: true, variantId: true, secret: true, orderId: true, deliveredAt: true, returnedAt: true, returnNote: true } }),
  ])
  const returned = await db.productDigitalCode.count({ where: { productId, returnedAt: { not: null } } })
  const masked = (secret: string) => { try { return maskCode(decryptDigitalDelivery(secret)) } catch { return '••••' } }
  const variantName = (id: number | null) => product.variants.find((variant) => variant.id === id)?.name || ''
  return {
    kind: product.kind, mode: normalizeDigitalMode(product.digitalMode), whenEmpty: normalizeCodesWhenEmpty(product.codesWhenEmpty), stock: product.stock, available, delivered, returned,
    variants: product.variants,
    shelf: shelf.map((row) => ({ id: row.id, variant: variantName(row.variantId), code: masked(row.secret), createdAt: row.createdAt })),
    recent: recent.map((row) => ({ id: row.id, variant: variantName(row.variantId), code: masked(row.secret), orderId: row.orderId, deliveredAt: row.deliveredAt, returnedAt: row.returnedAt, note: row.returnNote })),
  }
}

/** Takes a code off the shelf. A delivered code is part of an order and cannot be removed. */
export async function removeCode(productId: number, codeId: number) {
  return db.$transaction(async (tx) => {
    await lockProduct(tx, productId)
    const removed = await tx.productDigitalCode.deleteMany({ where: { id: codeId, productId, orderId: null } })
    if (removed.count !== 1) throw new StoreError('این کد روی قفسه نیست (شاید همین حالا تحویل شده باشد)', 409, 'CONFLICT')
    return { stock: await syncCodeStock(tx, productId) }
  })
}

type CodeLine = { line: number; productId: number; variantId: number | null; quantity: number; name: string; variantName: string; staff?: boolean }

/** The lines of an order whose product delivers codes, and whether the order has anything else in it. */
async function codeLines(orderId: number, client: Prisma.TransactionClient = db) {
  const order = await client.order.findUnique({
    where: { id: orderId },
    select: { status: true, productId: true, meta: true, assigneeId: true, product: { select: { name: true, kind: true, digitalMode: true, codesWhenEmpty: true } }, lines: { orderBy: { line: 'asc' }, select: { line: true, productId: true, variantId: true, quantity: true, name: true, variantName: true, kind: true, product: { select: { digitalMode: true, codesWhenEmpty: true } } } } },
  })
  if (!order) return null
  if (!order.lines.length) {
    // Older single-item orders carry their product on the order itself, as line 0.
    if (!order.productId || !order.product) return { status: order.status, assigneeId: order.assigneeId, lines: [] as CodeLine[], other: true }
    let meta: Record<string, unknown> = {}
    try { meta = JSON.parse(order.meta || '{}') } catch { /* legacy row */ }
    const codes = order.product.kind === 'VIRTUAL' && order.product.digitalMode === 'CODES'
    return { status: order.status, assigneeId: order.assigneeId, lines: codes ? [{ line: 0, productId: order.productId, variantId: Number(meta.variantId) || null, quantity: 1, name: order.product.name, variantName: '', staff: order.product.codesWhenEmpty === 'STAFF' }] : [], other: !codes }
  }
  const isCode = (line: (typeof order.lines)[number]) => Boolean(line.productId && line.kind !== 'PHYSICAL' && line.product?.digitalMode === 'CODES')
  return {
    status: order.status,
    assigneeId: order.assigneeId,
    lines: order.lines.filter(isCode).map((line) => ({ line: line.line, productId: line.productId!, variantId: line.variantId, quantity: Math.max(1, line.quantity), name: line.name, variantName: line.variantName, staff: line.product?.codesWhenEmpty === 'STAFF' })),
    other: order.lines.some((line) => !isCode(line)),
  }
}

/** Gives one line the codes it still misses; returns how many it is still short of. Safe to repeat. */
export async function assignLine(orderId: number, item: CodeLine, client?: import('@prisma/client').Prisma.TransactionClient): Promise<number> {
  const assign = async (tx: import('@prisma/client').Prisma.TransactionClient) => {
    const have = await tx.productDigitalCode.count({ where: { orderId, orderLine: item.line, returnedAt: null } })
    const need = missingCodes(item.quantity, have)
    if (!need) return 0
    // Rows another delivery is taking at this moment are skipped, not waited for.
    const picked: { id: number }[] = postgres()
      ? await tx.$queryRaw`SELECT id FROM "ProductDigitalCode" WHERE "productId" = ${item.productId} AND "variantId" IS NOT DISTINCT FROM ${item.variantId} AND "orderId" IS NULL ORDER BY id LIMIT ${need} FOR UPDATE SKIP LOCKED`
      : await tx.productDigitalCode.findMany({ where: { productId: item.productId, ...sameVariant(item.variantId), orderId: null }, orderBy: { id: 'asc' }, take: need, select: { id: true } })
    if (!picked.length) return need
    const taken = await tx.productDigitalCode.updateMany({ where: { id: { in: picked.map((row) => row.id) }, orderId: null }, data: { orderId, orderLine: item.line, deliveredAt: new Date() } })
    return need - taken.count
  }
  return client ? assign(client) : db.$transaction(assign)
}

/**
 * Delivery of the codes of a paid order, called by the delivery job and again whenever codes are added.
 * Every code line takes what it misses. An order made of code lines only, all served, is marked delivered
 * with its codes as the digital delivery and the buyer is told. An order that also holds other goods keeps
 * its delivery open for them; its codes are already the buyer's to read. A line the shelf cannot serve
 * stays open for staff and is logged.
 */
export async function deliverDigitalCodes(orderId: number) {
  const order = await codeLines(orderId)
  if (!order || order.status !== 'PAID' || !order.lines.length) return { codeLines: 0, short: 0, delivered: false }
  if (!(await openOrders(db, [orderId])).has(orderId)) return { codeLines: order.lines.length, short: 0, delivered: false }
  let short = 0, toStaff = 0
  for (const item of order.lines) {
    // A specialist who took the order makes and delivers the account; a code arriving later does not reach it too.
    if (item.staff && order.assigneeId) { toStaff++; continue }
    const missing = await assignLine(orderId, item)
    short += missing
    if (missing && item.staff) toStaff++
  }
  if (toStaff) {
    // Sold without limit and the shelf could not serve it: the order waits in the specialists' queue (taken, made, delivered by hand).
    const noted = await db.orderEvent.findFirst({ where: { orderId, status: 'NEEDS_STAFF' }, select: { id: true } })
    if (!noted) await db.orderEvent.create({ data: { orderId, status: 'NEEDS_STAFF', note: 'کد آماده برای این سفارش نبود؛ کارشناس سفارش را بردارد، آماده کند و تحویل دهد', visible: false } })
    return { codeLines: order.lines.length, short, delivered: false, toStaff }
  }
  if (short) {
    logEvent('error', 'store.codes_short', { orderId, short })
    const noted = await db.orderEvent.findFirst({ where: { orderId, status: 'CODES_SHORT' }, select: { id: true } })
    if (!noted) await db.orderEvent.create({ data: { orderId, status: 'CODES_SHORT', note: `کد کافی روی قفسه نبود (${short.toLocaleString('fa-IR')} واحد)؛ با افزودن کد به محصول، خودکار تحویل می‌شود`, visible: false } })
    return { codeLines: order.lines.length, short, delivered: false }
  }
  if (order.other) return { codeLines: order.lines.length, short: 0, delivered: false }
  const delivery = await db.productDelivery.findUnique({ where: { orderId }, select: { status: true } })
  if (!delivery || delivery.status === 'DELIVERED') return { codeLines: order.lines.length, short: 0, delivered: delivery?.status === 'DELIVERED' }
  if (delivery.status !== 'PENDING' && delivery.status !== 'PROCESSING') return { codeLines: order.lines.length, short: 0, delivered: false }
  const lines = await deliveredLines(orderId, order.lines)
  try {
    await transitionOrder({ orderId, to: 'DELIVERED', actorId: null, digitalDelivery: composeDelivery(lines), note: 'تحویل خودکار کد' })
  } catch (error) {
    // Staff or another run moved the order at the same moment; the codes are assigned either way.
    if (!(error instanceof StoreError) || error.code !== 'CONFLICT') throw error
  }
  return { codeLines: order.lines.length, short: 0, delivered: true }
}

async function deliveredLines(orderId: number, lines: readonly CodeLine[], client: Prisma.TransactionClient = db): Promise<DeliveredLine[]> {
  const rows = await client.productDigitalCode.findMany({ where: { orderId, returnedAt: null }, orderBy: { id: 'asc' }, select: { orderLine: true, secret: true } })
  return lines.map((line) => ({ name: line.name, variantName: line.variantName, codes: rows.filter((row) => row.orderLine === line.line).map((row) => decryptDigitalDelivery(row.secret)) }))
}

/** Paid orders of a product that still miss codes, oldest first: served after the pool is refilled. */
export async function deliverWaitingOrders(productId: number, limit = 50) {
  const sold = await db.inventoryReservation.findMany({ where: { productId, status: 'CONSUMED' }, orderBy: { id: 'desc' }, take: 2000, select: { orderId: true, line: true, quantity: true } })
  const open = await openOrders(db, sold.map((row) => row.orderId))
  const waiting = sold.filter((row) => open.has(row.orderId)).reverse()
  if (!waiting.length) return { delivered: 0 }
  const given = await db.productDigitalCode.groupBy({ by: ['orderId', 'orderLine'], where: { productId, orderId: { in: waiting.map((row) => row.orderId) }, returnedAt: null }, _count: { _all: true } })
  const have = new Map(given.map((row) => [`${row.orderId}:${row.orderLine}`, row._count._all]))
  const orders = [...new Set(waiting.filter((row) => missingCodes(row.quantity, have.get(`${row.orderId}:${row.line}`) || 0) > 0).map((row) => row.orderId))].slice(0, limit)
  let delivered = 0
  for (const orderId of orders) {
    const result = await deliverDigitalCodes(orderId)
    // One a specialist handles is not counted as served by the refill.
    if (!result.short && !("toStaff" in result && result.toStaff) && result.codeLines) delivered++
    await db.$transaction((tx) => syncCodeStock(tx, productId))
  }
  return { delivered }
}

/** The codes of an order for the member who bought it: readable once the order is paid. */
export async function buyerCodes(userId: number, orderId: number): Promise<DeliveredLine[]> {
  const order = await db.order.findFirst({ where: { id: orderId, userId, status: 'PAID' }, select: { id: true } })
  if (!order) return []
  const lines = await codeLines(orderId)
  if (!lines?.lines.length) return []
  try { return (await deliveredLines(orderId, lines.lines)).filter((line) => line.codes.length) } catch { return [] }
}

/** Codes of an order the buyer still holds, per line: what a code line can send back. */
export async function heldCodes(orderId: number, client: Prisma.TransactionClient = db): Promise<Map<number, number>> {
  const rows = await client.productDigitalCode.groupBy({ by: ['orderLine'], where: { orderId, returnedAt: null }, _count: { _all: true } })
  return new Map(rows.map((row) => [row.orderLine ?? 0, row._count._all]))
}

/**
 * The delivery text of an order made of code lines only is its codes: after one is taken back or replaced
 * it is written again from the codes the buyer still holds. A delivery typed by staff is left alone.
 */
async function refreshDelivery(orderId: number, client: Prisma.TransactionClient = db) {
  const delivery = await client.productDelivery.findUnique({ where: { orderId }, select: { digitalDelivery: true } })
  if (!delivery?.digitalDelivery) return
  const order = await codeLines(orderId, client)
  if (!order || order.other || !order.lines.length) return
  const text = composeDelivery(await deliveredLines(orderId, order.lines, client))
  await client.productDelivery.update({ where: { orderId }, data: { digitalDelivery: text ? encryptDigitalDelivery(text) : '' } })
}

/**
 * Takes delivered codes back from a refunded order: `choices` names lines and quantities (a return), null
 * means every code of the order (a cancellation). The codes are marked returned, not put on the shelf: the
 * buyer has read them. Of a line, the codes given last go first. Safe to repeat for the same request.
 */
export async function takeBackCodes(orderId: number, choices: readonly { line: number; quantity: number }[] | null, input: { returnId: number; note: string }, transaction?: Prisma.TransactionClient): Promise<number> {
  const work = async (tx: Prisma.TransactionClient) => {
    const held = await tx.productDigitalCode.findMany({ where: { orderId, returnedAt: null }, orderBy: { id: 'desc' }, select: { id: true, orderLine: true } })
    if (!held.length) return 0
    let ids = held.map((row) => row.id)
    if (choices) {
      const already = await tx.productDigitalCode.groupBy({ by: ['orderLine'], where: { orderId, returnId: input.returnId }, _count: { _all: true } })
      const done = (line: number) => already.find((row) => (row.orderLine ?? 0) === line)?._count._all || 0
      ids = choices.flatMap((choice) => held.filter((row) => (row.orderLine ?? 0) === choice.line).slice(0, Math.max(0, choice.quantity - done(choice.line))).map((row) => row.id))
    }
    if (!ids.length) return 0
    return (await tx.productDigitalCode.updateMany({ where: { id: { in: ids }, returnedAt: null }, data: { returnedAt: new Date(), returnId: input.returnId, returnNote: input.note.slice(0, 200) } })).count
  }
  const taken = transaction ? await work(transaction) : await db.$transaction(work)
  if (taken) await refreshDelivery(orderId, transaction)
  return taken
}

/**
 * Staff give the buyer another code for one that did not work: the old one is marked returned and a code
 * from the same shelf takes its place on the same order line, in one step. Refused when the shelf is empty
 * or the order is no longer a paid one. The buyer is told; the notice does not carry the code.
 */
export async function replaceCode(input: { productId: number; codeId: number; actorId: number | null; note?: unknown }) {
  const note = String(input.note ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const result = await db.$transaction(async (tx) => {
    await lockProduct(tx, input.productId)
    const old = await tx.productDigitalCode.findFirst({ where: { id: input.codeId, productId: input.productId, orderId: { not: null }, returnedAt: null }, select: { id: true, variantId: true, orderId: true, orderLine: true } })
    if (!old || !old.orderId) throw new StoreError('این کد دستِ خریدار نیست (تحویل نشده یا قبلاً پس گرفته شده است)', 409, 'CONFLICT')
    const order = await tx.order.findUnique({ where: { id: old.orderId }, select: { status: true, userId: true } })
    if (!order || order.status !== 'PAID') throw new StoreError('این سفارش دیگر پرداخت‌شده نیست؛ کدی برایش جایگزین نمی‌شود', 409, 'CONFLICT')
    const picked: { id: number }[] = postgres()
      ? await tx.$queryRaw`SELECT id FROM "ProductDigitalCode" WHERE "productId" = ${input.productId} AND "variantId" IS NOT DISTINCT FROM ${old.variantId} AND "orderId" IS NULL ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`
      : await tx.productDigitalCode.findMany({ where: { productId: input.productId, ...sameVariant(old.variantId), orderId: null }, orderBy: { id: 'asc' }, take: 1, select: { id: true } })
    if (!picked.length) throw new StoreError('کدی روی قفسه نیست؛ اول کد اضافه کنید', 409, 'NO_CODE')
    const given = await tx.productDigitalCode.updateMany({ where: { id: picked[0].id, orderId: null }, data: { orderId: old.orderId, orderLine: old.orderLine, deliveredAt: new Date() } })
    if (given.count !== 1) throw new StoreError('کدِ قفسه همین حالا تحویل شد؛ دوباره تلاش کنید', 409, 'CONFLICT')
    await tx.productDigitalCode.update({ where: { id: old.id }, data: { returnedAt: new Date(), returnNote: note || 'جایگزین شد' } })
    await tx.orderEvent.create({ data: { orderId: old.orderId, status: 'CODE_REPLACED', note: `یک کد با کد تازه جایگزین شد${note ? ` — ${note}` : ''}`, visible: true, actorId: input.actorId } })
    return { orderId: old.orderId, userId: order.userId, codeId: picked[0].id, stock: await syncCodeStock(tx, input.productId) }
  })
  await refreshDelivery(result.orderId)
  if (result.userId !== null) await createInboxEvent({
    userId: result.userId, kind: 'PRODUCT_DELIVERED', dedupeKey: `code-replaced:${result.codeId}`,
    titleEn: 'A code of your order was replaced', titleFa: 'کد سفارش شما جایگزین شد',
    bodyEn: 'The new code is on the order page.', bodyFa: 'کد تازه در صفحهٔ سفارش شماست.', href: `/dashboard/orders/${result.orderId}`,
  }).catch((error) => logEvent('error', 'store.code_replace_notice_failed', { orderId: result.orderId, error }))
  return { orderId: result.orderId, stock: result.stock }
}
