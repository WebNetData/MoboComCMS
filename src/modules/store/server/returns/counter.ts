import { createHmac, randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { StoreError } from '@/modules/store/domain/store'
import { COUNTER_RETURN_REASONS as REASONS, clampRefund, normalizeChoices, returnNumber, returnRefundMinor, type LineChoice } from '@/modules/store/domain/returns'
import { lockRegister } from '@/modules/store/server/counter-sales/register'
import { heldCodes } from '@/modules/store/server/digital-codes'
import { refundReturn, refundFollowups } from './refunds'
import { loadOrder, ledger, lockOrder } from './shared'
import { deviceIdentifiers } from '@/modules/store/domain/device-identifiers'

const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max)
const result = (row: { id: number; number: string; orderId: number; refundMinor: bigint; currency: string; refundMethod: string }) => ({ id: row.id, number: row.number, orderId: row.orderId, refundMinor: row.refundMinor.toString(), currency: row.currency, method: row.refundMethod })

export async function counterReturnResult(requestId: string, actorId: number) {
  const row = await db.returnRequest.findUnique({ where: { counterRequestId: requestId } })
  return row?.decidedBy === actorId && row.status === 'REFUNDED' ? result(row) : null
}

/** Invoice barcodes carry the canonical invoice number; no new order or customer registry. */
export async function counterReturnLookup(raw: string) {
  const value = clean(raw, 60).replace(/^#/, '')
  if (!value) throw new StoreError('شمارهٔ فاکتور یا سفارش را اسکن یا وارد کنید')
  const invoice = await db.invoice.findUnique({ where: { number: value }, select: { orderId: true } })
  const orderId = invoice?.orderId ?? (/^\d{1,9}$/.test(value) ? Number(value) : 0)
  const order = orderId ? await loadOrder(orderId) : null
  if (!order?.invoice) throw new StoreError('سفارش این فاکتور پیدا نشد', 404)
  if (!['PAID', 'COMPLETED'].includes(order.status) || order.invoice.status !== 'PAID') throw new StoreError('فقط سفارش پرداخت‌شده‌ای که بازپرداخت کامل نشده مرجوع می‌شود', 409)
  const book = ledger(order), held = await heldCodes(order.id)
  return {
    orderId: order.id, invoice: order.invoice.number, channel: order.saleSource, createdAt: order.createdAt.toISOString(), currency: order.currency,
    customer: order.customerName || order.user?.name || 'مشتری حضوری', phone: order.customerPhone || order.user?.phone || '', hasAccount: !!order.userId,
    totalMinor: order.totalMinor.toString(), refundedMinor: book.refunded.toString(), remainingMinor: book.remaining.toString(), delivery: order.productDelivery?.status || '',
    open: order.returns.some(row => ['REQUESTED', 'APPROVED'].includes(row.status)),
    lines: order.lines.map(line => {
      const entry = book.lines.find(row => row.line === line.line)!
      const left = Math.max(0, line.quantity - entry.returnedQuantity)
      return { line: line.line, name: line.name, variant: line.variantName, quantity: line.quantity, returned: entry.returnedQuantity, deviceIdentifiers: deviceIdentifiers(line.deviceIdentifiers),
        returnable: line.kind === 'PHYSICAL' ? left : Math.min(left, held.get(line.line) || 0),
        unitMinor: line.unitPriceMinor.toString(), totalMinor: line.totalMinor.toString(), code: held.has(line.line) }
    }),
    itemsMinor: book.itemsMinor.toString(), discountMinor: book.discountMinor.toString(), reasons: Object.entries(REASONS).map(([key, label]) => ({ key, label })),
  }
}

/** Existing refund owner composed into one transaction with its register, stock, code and audit owners. */
export async function createCounterReturn(input: Record<string, unknown>, actorId: number, authorize: (tx: Prisma.TransactionClient) => Promise<void>, audit: (tx: Prisma.TransactionClient, id: number) => Promise<void>) {
  const requestId = clean(input.requestId, 80), orderId = Number(input.orderId), sessionId = Number(input.sessionId)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new StoreError('شناسهٔ مرجوعی معتبر نیست')
  if (![orderId, sessionId].every(n => Number.isSafeInteger(n) && n > 0)) throw new StoreError('سفارش و صندوق باز خود را انتخاب کنید')
  if (input.confirmed !== true) throw new StoreError('دریافت کالا و پرداخت وجه به مشتری را تأیید کنید')
  const method = String(input.refund), reason = String(input.reason), note = clean(input.note, 500), reference = clean(input.reference, 60)
  if (!['CASH', 'CARD', 'WALLET'].includes(method)) throw new StoreError('روش بازپرداخت را انتخاب کنید')
  if (!Object.hasOwn(REASONS, reason) || (reason === 'other' && note.length < 5)) throw new StoreError('دلیل مرجوعی را بنویسید')
  if (method === 'CARD' && !reference) throw new StoreError('شمارهٔ پیگیری بازپرداخت کارت را بنویسید')
  const restock = input.restock === true
  const raw = Array.isArray(input.lines) ? input.lines : []
  const choices: LineChoice[] = raw.map(row => ({ line: Number(row?.line), quantity: Number(row?.quantity) })).sort((a, b) => a.line - b.line)
  if (!choices.length || choices.length > 30 || choices.some(row => !Number.isSafeInteger(row.line) || row.line < 0 || !Number.isSafeInteger(row.quantity) || row.quantity <= 0) || new Set(choices.map(row => row.line)).size !== choices.length) throw new StoreError('ردیف و تعداد مرجوعی معتبر نیست')
  const fingerprint = createHmac('sha256', authSecret()).update(JSON.stringify({ orderId, sessionId, method, reason, note, reference, restock, choices, expectedRefundMinor: String(input.expectedRefundMinor) })).digest('hex')
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const row = await db.$transaction(async tx => {
        await authorize(tx)
        const replay = await tx.returnRequest.findUnique({ where: { counterRequestId: requestId } })
        if (replay) {
          if (replay.decidedBy !== actorId || replay.counterFingerprint !== fingerprint || replay.status !== 'REFUNDED') throw new StoreError('این شناسه قبلاً برای مرجوعی دیگری استفاده شده است', 409, 'REQUEST_CONFLICT')
          return replay
        }
        await lockOrder(tx, orderId)
        const order = await loadOrder(orderId, undefined, tx)
        if (!order?.invoice || order.invoice.status !== 'PAID' || !['PAID', 'COMPLETED'].includes(order.status)) throw new StoreError('فقط سفارش پرداخت‌شده مرجوع می‌شود', 409)
        if (order.productDelivery?.status !== 'DELIVERED') throw new StoreError('این سفارش هنوز تحویل نشده است؛ از مسیر لغو سفارش اقدام کنید', 409)
        if (order.returns.some(row => ['REQUESTED', 'APPROVED'].includes(row.status))) throw new StoreError('یک درخواست باز برای این سفارش هست؛ ابتدا آن را در «لغو و مرجوعی» تعیین تکلیف کنید', 409, 'OPEN_REQUEST')
        if (method === 'WALLET' && !order.userId) throw new StoreError('این خریدار حساب ندارد؛ وجه را نقد یا کارت برگردانید', 409)
        const session = await lockRegister(tx, sessionId, actorId, order.currency)
        if (!session.locationId || !await tx.stockLocation.count({ where: { id: session.locationId, active: true } })) throw new StoreError('محل موجودی صندوق فعال نیست', 409)
        const book = ledger(order)
        const normalized = normalizeChoices(choices, book.lines)
        if (JSON.stringify(normalized.sort((a, b) => a.line - b.line)) !== JSON.stringify(choices)) throw new StoreError('تعداد قابل مرجوعی تغییر کرده است؛ فاکتور را دوباره بخوانید', 409)
        for (const choice of choices) {
          const line = order.lines.find(row => row.line === choice.line)!
          if (line.kind !== 'PHYSICAL') {
            const held = await tx.productDigitalCode.count({ where: { orderId, orderLine: choice.line, returnedAt: null } })
            if (held < choice.quantity) throw new StoreError('این ردیف کالای قابل مرجوعی یا کد تحویل‌شده ندارد', 409)
          }
        }
        const requestedMinor = clampRefund(returnRefundMinor(choices, book.lines, book), book.remaining)
        if (requestedMinor <= 0n || requestedMinor.toString() !== String(input.expectedRefundMinor)) throw new StoreError('مبلغ مرجوعی تغییر کرده است؛ فاکتور را دوباره بخوانید', 409, 'PRICE_CHANGED')
        const created = await tx.returnRequest.create({ data: { number: `tmp-${randomUUID()}`, counterRequestId: requestId, counterFingerprint: fingerprint, orderId, userId: order.userId, kind: 'RETURN', status: 'APPROVED', reason, description: note, lines: JSON.stringify(choices), requestedMinor, currency: order.currency, refundMethod: method, restockLocationId: restock ? session.locationId : null, decidedBy: actorId, decidedAt: new Date() } })
        await tx.returnRequest.update({ where: { id: created.id }, data: { number: returnNumber(created.id) } })
        const refunded = await refundReturn({ id: created.id, actorId, restock, note, register: { sessionId, reference } }, tx)
        await audit(tx, refunded.id)
        return refunded
      }, { isolationLevel: 'Serializable', timeout: 30_000 })
      await refundFollowups(row, row.refundMinor)
      return result(row)
    } catch (error) {
      const failure = error as { code?: string; meta?: { code?: string } }
      const retryable = ['P2034', 'P2002'].includes(String(failure.code)) || (failure.code === 'P2010' && ['40001', '40P01'].includes(String(failure.meta?.code)))
      if (retryable && attempt < 3) continue
      if (retryable) throw new StoreError('ثبت هم‌زمان ممکن نشد؛ با همان درخواست دوباره تلاش کنید', 503)
      throw error
    }
  }
  throw new StoreError('ثبت هم‌زمان ممکن نشد؛ با همان درخواست دوباره تلاش کنید', 503)
}
