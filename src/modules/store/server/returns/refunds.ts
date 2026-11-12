import type { Prisma, ReturnRequest } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { minorToNumber, minorToDecimal, normalizeCurrency, toMinor } from '@/shared/money'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { releaseInventoryReservation, restockConsumedInventory } from '@/modules/catalog/server/inventory'
import { returnToLocations, trackedItem, readAllocation } from '@/modules/catalog/server/locations'
import { syncCodeStock } from '@/modules/catalog/server/code-stock'
import { lockRegister } from '@/modules/store/server/counter-sales/register'
import { StoreError, canMoveTo } from '@/modules/store/domain/store'
import { RETURN_KIND_LABEL, clampRefund, type LineChoice, type ReturnKind, type ReturnStatus } from '@/modules/store/domain/returns'
import { transitionOrder } from '@/modules/store/server/orders'
import { takeBackCodes } from '@/modules/store/server/digital-codes'
import { loadOrder, lockOrder, notifyCustomer } from './shared'
const OPEN: ReturnStatus[] = ['REQUESTED', 'APPROVED']
const parseJson = <T>(raw: string, fallback: T): T => { try { return JSON.parse(raw) as T } catch { return fallback } }
const plain = (value: unknown, max: number) => String(value ?? '').replace(/[<>]/g, '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max)

/**
 * Refunds a request to the wallet (amount defaults to what was requested,
 * never more than the order's unrefunded balance). The amount is decided and
 * the status claimed together under the order's lock, so neither two clicks
 * on one request nor two requests of one order can refund more than the order
 * holds. The wallet credit is idempotent per request, and a request that was
 * claimed but never credited (the process stopped in between) is finished by
 * calling this again.
 */
/**
 * Pays a return back. WALLET credits the buyer's wallet (resumable). CASH/CARD (counter returns) take the money out of
 * the cashier's open register in the same transaction that claims the refund, so there is nothing to resume.
 * Returned units go back to restockLocationId when given (the counter's shelf), else where they were taken from.
 */
export async function refundReturn(input: { id: number; actorId: number | null; amount?: unknown; restock?: boolean; note?: unknown; register?: { sessionId: number; reference?: string } }, transaction?: Prisma.TransactionClient): Promise<ReturnRequest> {
  const client = transaction || db
  const run = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => transaction ? work(transaction) : db.$transaction(work)
  const row = await client.returnRequest.findUnique({ where: { id: input.id } })
  if (!row) throw new StoreError('درخواست پیدا نشد', 404)
  // Claimed as refunded but no wallet movement recorded: finish that refund with the amount it claimed.
  const resuming = row.refundMethod === 'WALLET' && row.status === 'REFUNDED' && !row.walletTxId && row.refundMinor > 0n
  // New refunds, for both channels, commit money and inventory together. Only pre-upgrade interrupted wallet credits
  // use the recovery path below. The counter passes its enclosing transaction and audit callback.
  if (!transaction && !resuming) {
    let refunded
    try { refunded = await db.$transaction(tx => refundReturn(input, tx), { timeout: 30_000 }) }
    catch (error) { if ((error as { code?: string }).code === 'P2034') throw new StoreError('وضعیت هم‌زمان تغییر کرد؛ دوباره بررسی کنید', 409); throw error }
    await refundFollowups(refunded, refunded.refundMinor)
    return refunded
  }
  if (!resuming && !OPEN.includes(row.status as ReturnStatus)) throw new StoreError('این درخواست قابل بازپرداخت نیست', 409)
  const order = await loadOrder(row.orderId, undefined, client)
  if (!order) throw new StoreError('سفارش پیدا نشد', 404)
  const currency = normalizeCurrency(order.currency, 'IRT')
  let requested = row.requestedMinor
  if (input.amount !== undefined && input.amount !== null && String(input.amount).trim() !== '') {
    try { requested = toMinor(String(input.amount), currency) } catch { throw new StoreError('مبلغ بازپرداخت معتبر نیست') }
  }
  const note = plain(input.note, 1000)

  // What the order still holds, not counting this request, read under the lock.
  const settled = resuming
    ? { amount: row.refundMinor, before: order.totalMinor - order.returns.filter((other) => other.status === 'REFUNDED' && other.id !== row.id).reduce((sum, other) => sum + other.refundMinor, 0n) }
    : await run(async (tx) => {
      await lockOrder(tx, row.orderId)
      const others = await tx.returnRequest.aggregate({ where: { orderId: row.orderId, status: 'REFUNDED', id: { not: row.id } }, _sum: { refundMinor: true } })
      const before = order.totalMinor - (others._sum.refundMinor || 0n)
      const amount = clampRefund(requested, before)
      if (amount <= 0n) throw new StoreError('مبلغی برای بازپرداخت باقی نمانده است')
      const claimed = await tx.returnRequest.updateMany({ where: { id: row.id, status: row.status }, data: { status: 'REFUNDED', refundMinor: amount, refundedAt: new Date(), decidedBy: input.actorId ?? row.decidedBy, decidedAt: row.decidedAt || new Date(), ...(note ? { adminNote: note } : {}) } })
      if (claimed.count !== 1) throw new StoreError('وضعیت درخواست تغییر کرده است؛ صفحه را تازه کنید', 409, 'CONFLICT')
      if (row.refundMethod !== 'WALLET') {
        // Money leaves the drawer (or the card terminal) of this cashier's open register, atomically with the claim.
        if (!input.register || !input.actorId) throw new StoreError('برای بازپرداخت نقدی یا کارتی صندوق باز خود را انتخاب کنید', 409, 'REGISTER_REQUIRED')
        await lockRegister(tx, input.register.sessionId, input.actorId, currency)
        const adjustment = await tx.storeRegisterAdjustment.create({ data: { requestId: `return:${row.id}`, sessionId: input.register.sessionId, actorId: input.actorId, method: row.refundMethod, amountMinor: -amount, reason: `بازپرداخت ${row.number}${input.register.reference ? ` · ${input.register.reference.slice(0, 60)}` : ''}` } })
        await tx.returnRequest.update({ where: { id: row.id }, data: { registerAdjustmentId: adjustment.id } })
      }
      return { amount, before }
    })
  const amount = settled.amount
  const book = { remaining: settled.before }

  const toWallet = row.refundMethod === 'WALLET'
  const credit = toWallet ? await moveWallet({
    userId: row.userId!, amount: minorToDecimal(amount, currency), currency, type: 'REFUND',
    description: `${RETURN_KIND_LABEL[row.kind as ReturnKind]} ${row.number} — سفارش ${row.orderId}`,
    orderId: row.orderId, invoiceId: order.invoice?.id ?? null, adminId: input.actorId, idempotencyKey: `return-refund:${row.id}`,
  }, transaction) : { ok: true as const, txId: null, idempotent: false }
  if (!credit.ok) {
    if (transaction) throw new StoreError(credit.message || 'بازپرداخت انجام نشد', 409)
    // A resumed refund stays claimed, so it is tried again; a new one is released for another attempt.
    if (!resuming) await client.returnRequest.updateMany({ where: { id: row.id, status: 'REFUNDED', walletTxId: null }, data: { status: row.status, refundMinor: 0n, refundedAt: null } })
    logEvent('error', 'store.return_refund_failed', { returnId: row.id, message: credit.message })
    throw new StoreError(`واریز به کیف پول انجام نشد: ${credit.message}`, 502)
  }
  if (credit.txId) await client.returnRequest.update({ where: { id: row.id }, data: { walletTxId: credit.txId } })
  // The codes that were paid back are void from here on (never back on the shelf). Repeating it takes nothing twice.
  const choices = parseJson<LineChoice[]>(row.lines, [])
  const voided = await takeBackCodes(row.orderId, row.kind === 'CANCEL' ? null : choices, { returnId: row.id, note: row.number }, transaction).catch((error) => { if (transaction) throw error; logEvent('error', 'store.return_codes_failed', { returnId: row.id, error: String(error) }); return 0 })
  if (resuming && credit.idempotent) {
    // The money had already been credited; only the record of it was missing. Whether the order-level
    // effects ran cannot be told from here, and repeating them could restock twice, so they are left.
    logEvent('warn', 'store.return_refund_record_repaired', { returnId: row.id, orderId: row.orderId })
    return client.returnRequest.findUniqueOrThrow({ where: { id: row.id } })
  }

  // Order-level effects: fulfilment state, stock, and a fully refunded order/invoice.
  const fullyRefunded = book.remaining - amount <= 0n
  const fulfilment = order.productDelivery?.status || ''
  const target = row.kind === 'CANCEL' ? 'CANCELLED' : fullyRefunded ? 'RETURNED' : ''
  const restock = input.restock !== false && !row.restocked
  if (target && canMoveTo(fulfilment, target)) {
    await transitionOrder({ orderId: row.orderId, to: target, actorId: input.actorId, notify: false, restock: restock && row.kind === 'CANCEL', note: `${RETURN_KIND_LABEL[row.kind as ReturnKind]} ${row.number}` }, transaction).catch((error) => { if (transaction) throw error; logEvent('warn', 'store.return_transition_failed', { returnId: row.id, error: String(error) }) })
  } else if (row.kind === 'CANCEL' && restock) {
    await restockConsumedInventory(row.orderId, row.restockLocationId, transaction)
    // Delivery had not started: the units are still held for this order, not yet sold.
    await releaseInventoryReservation(row.orderId, transaction)
  }
  if (restock && row.kind === 'RETURN') await restockLines(row.orderId, parseJson<LineChoice[]>(row.lines, []), row.restockLocationId, transaction, row.id)
  if (restock) await client.returnRequest.update({ where: { id: row.id }, data: { restocked: true } })
  if (fullyRefunded) {
    await client.order.updateMany({ where: { id: row.orderId, status: order.status }, data: { status: 'REFUNDED' } })
    // Only a paid invoice is refunded; one that was never paid (or is refunded already) stays as it is.
    if (order.invoice) await client.invoice.updateMany({ where: { id: order.invoice.id, status: 'PAID' }, data: { status: 'REFUNDED' } })
  }
  if (!transaction) await refundFollowups(row, amount)
  const destination = row.refundMethod === 'CASH' ? 'نقد' : row.refundMethod === 'CARD' ? 'کارت' : 'کیف پول'
  const shown = minorToNumber(amount, currency).toLocaleString('fa-IR')
  await client.orderEvent.create({ data: { orderId: row.orderId, status: 'REFUNDED', note: `${row.number}: ${shown} ${currency === 'IRT' ? 'تومان' : currency} به ${destination} برگشت${voided ? `؛ ${voided.toLocaleString('fa-IR')} کد باطل شد` : ''}${note ? ` — ${note}` : ''}`, visible: true, actorId: input.actorId } })
  logEvent('info', 'store.return_refunded', { returnId: row.id, orderId: row.orderId, amount: amount.toString(), currency })
  return client.returnRequest.findUniqueOrThrow({ where: { id: row.id } })
}

/**
 * Worker step: refunds that were claimed but never credited because the process stopped in
 * between. Requests marked refunded for at least ten minutes with no wallet movement recorded
 * are finished through the ordinary refund path, which credits once. One that fails is
 * logged and tried again on a later pass.
 */
export async function recoverInterruptedRefunds(limit = 20, now = new Date()) {
  const rows = await db.returnRequest.findMany({ where: { status: 'REFUNDED', refundMethod: 'WALLET', walletTxId: null, refundMinor: { gt: 0n }, refundedAt: { lte: new Date(now.getTime() - 10 * 60_000) } }, orderBy: { id: 'asc' }, take: Math.max(1, Math.min(100, Math.trunc(limit) || 20)), select: { id: true } })
  let finished = 0
  let failed = 0
  for (const row of rows) {
    try { await refundReturn({ id: row.id, actorId: null, note: '' }); finished++ } catch (error) {
      failed++
      logEvent('error', 'store.return_refund_recovery_failed', { returnId: row.id, error: String(error) })
    }
  }
  return { checked: rows.length, finished, failed }
}

/**
 * Returned items back on the shelf (finite stock only), line by line. Location-tracked items go to toLocationId
 * (the counter that took them back) or to the first location they were taken from.
 */
async function restockLines(orderId: number, choices: LineChoice[], toLocationId?: number | null, transaction?: Prisma.TransactionClient, returnId?: number) {
  const client = transaction || db
  const run = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => transaction ? work(transaction) : db.$transaction(work)
  const reservations = await client.inventoryReservation.findMany({ where: { orderId, status: 'CONSUMED', line: { in: choices.map((choice) => choice.line) } } })
  const lines = await client.orderLine.findMany({ where: { orderId, line: { in: choices.map((choice) => choice.line) } }, select: { line: true, productId: true, variantId: true, kind: true, product: { select: { digitalMode: true } } } })
  for (const choice of choices) {
    const line = lines.find((line) => line.line === choice.line)
    if (!line || (line.kind !== 'PHYSICAL' && line.product?.digitalMode !== 'CODES')) continue
    const reservation = reservations.find((row) => row.line === choice.line)
    const productId = reservation?.productId ?? lines.find((line) => line.line === choice.line)?.productId
    if (!productId) continue
    // A product that sells from its code pool has no stock of its own to give back: the returned code is void.
    if (lines.find((line) => line.line === choice.line)?.product?.digitalMode === 'CODES') {
      await run((tx) => syncCodeStock(tx, productId))
      await client.product.updateMany({ where: { id: productId, soldCount: { gte: choice.quantity } }, data: { soldCount: { decrement: choice.quantity } } })
      continue
    }
    const located = await run(async (tx) => {
      if (!await trackedItem(tx, productId, reservation?.variantId ?? line.variantId ?? null)) return false
      const from = readAllocation(reservation?.allocation)[0]?.l
      return returnToLocations(tx, { productId, variantId: reservation?.variantId ?? line.variantId ?? null, quantity: choice.quantity }, [], 'RESTOCK', { orderId, refType: 'return', refId: returnId }, toLocationId || from)
    })
    if (located) { await client.product.updateMany({ where: { id: productId, soldCount: { gte: choice.quantity } }, data: { soldCount: { decrement: choice.quantity } } }); continue }
    if (!reservation || reservation.finite) await client.product.updateMany({ where: { id: productId, stock: { gte: 0 } }, data: { stock: { increment: choice.quantity } } })
    if (reservation?.variantFinite && reservation.variantId) await client.productVariant.updateMany({ where: { id: reservation.variantId, stock: { gte: 0 } }, data: { stock: { increment: choice.quantity } } })
    await client.product.updateMany({ where: { id: productId, soldCount: { gte: choice.quantity } }, data: { soldCount: { decrement: choice.quantity } } })
  }
}

export async function refundFollowups(row: { id: number; number: string; orderId: number; userId: number | null; kind: string; lines: string; currency: string; refundMethod: string }, amount: bigint) {
  // Marketplace sellers give back their share of the refunded part (and get the commission back).
  await import('@/modules/marketplace/server/marketplace').then((m) => m.reverseSellerShare(row.orderId, amount, `return:${row.id}`, row.kind === 'RETURN' ? parseJson<LineChoice[]>(row.lines, []).map((choice) => choice.line) : undefined)).catch((error) => logEvent('error', 'marketplace.refund_reverse_failed', { returnId: row.id, error: String(error) }))
  // Customer club points earned on the refunded part go back.
  await import('@/modules/store/server/marketing').then((m) => m.reverseOrderPoints(row.orderId, amount, `return:${row.id}`)).catch((error) => logEvent('warn', 'store.loyalty_reverse_failed', { returnId: row.id, error: String(error) }))
  const destination = row.refundMethod === 'CASH' ? 'نقد' : row.refundMethod === 'CARD' ? 'کارت' : 'کیف پول'
  const shown = minorToNumber(amount, row.currency).toLocaleString('fa-IR')
  await notifyCustomer(row, 'REFUNDED', `برگشت وجه ${row.number}`, `${shown} ${row.currency === 'IRT' ? 'تومان' : row.currency} بابت سفارش ${row.orderId.toLocaleString('fa-IR')} به ${destination} برگشت داده شد.`)
}
