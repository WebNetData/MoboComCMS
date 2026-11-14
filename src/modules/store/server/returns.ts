import { loadOrder, ledger, lockOrder, notifyCustomer, type LoadedOrder } from './returns/shared'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { MultipartError, readMultipart } from '@/platform/http/multipart'
import { sniffImage } from '@/shared/files/image-type'
import { minorToNumber, normalizeCurrency } from '@/shared/money'
import { readJsonSetting, createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server'
import { refundReturn } from './returns/refunds'
export { refundReturn, recoverInterruptedRefunds } from './returns/refunds'
export { counterReturnLookup, createCounterReturn, counterReturnResult } from './returns/counter'
import { StoreError } from '@/modules/store/domain/store'
import {
  MAX_RETURN_PHOTOS, MAX_RETURN_PHOTO_BYTES, RETURN_KIND_LABEL, RETURN_STATUS_LABEL, clampRefund, eligibility, normalizeChoices,
  normalizeReturnSettings, reasonLabel, reasonsFor, reasonsForGoods, returnNumber, returnRefundMinor,
  type Eligibility,
  type LineChoice, type RefundLine, type ReturnKind, type ReturnSettings, type ReturnStatus,
} from '@/modules/store/domain/returns'
import { heldCodes } from '@/modules/store/server/digital-codes'
import { inspectReturnState, receiveReturnState } from './returns/inspection'

// Cancellations and returns. A request is reviewed by staff (or, for a
// cancellation before shipping, refunded at once when the shop allows it);
// the refund is always credited to the customer's wallet, exactly once.

const SETTINGS_KEY = 'store.returns.v1'
const OPEN: ReturnStatus[] = ['REQUESTED', 'APPROVED']

/**
 * Everything that decides how much of an order may go back (opening a request, refunding one)
 * runs under this lock, in a transaction: two requests or two refunds of one order arriving
 * together are handled one after the other and the second sees what the first did.
 */

export const returnsDirectory = () => join(process.cwd(), 'storage', 'returns')

export async function getReturnSettings(): Promise<ReturnSettings> {
  return normalizeReturnSettings(await readJsonSetting(SETTINGS_KEY).catch(() => undefined))
}

const returnsHistory = () => createSectionSettingsHistory(SETTINGS_KEY, 'settings-returns', normalizeReturnSettings, settings => ({ ...settings }), { action: 'store.returns.settings', targetId: SETTINGS_KEY })
export const returnSettingsState = () => returnsHistory().current()
export const restoreReturnSettings = (...args: Parameters<ReturnType<typeof returnsHistory>['restore']>) => returnsHistory().restore(...args)

export async function saveReturnSettings(input: unknown, context?: SectionSettingsContext) {
  const settings = await returnsHistory().save(input, context)
  return settings
}

const parseJson = <T>(raw: string, fallback: T): T => { try { return JSON.parse(raw) as T } catch { return fallback } }
const minorOf = (value: unknown) => { try { return BigInt(String(value ?? '0')) } catch { return 0n } }
const plain = (value: unknown, max: number) => String(value ?? '').replace(/[<>]/g, '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max)


function requestView(row: { refundMethod?: string; id: number; number: string; kind: string; status: string; reason: string; description: string; photos: string; lines: string; requestedMinor: bigint; refundMinor: bigint; currency: string; adminNote: string; createdAt: Date; decidedAt: Date | null; refundedAt: Date | null; restocked: boolean }, order?: LoadedOrder) {
  const currency = normalizeCurrency(row.currency, 'IRT')
  const choices = parseJson<LineChoice[]>(row.lines, [])
  return {
    refundMethod: row.refundMethod || 'WALLET',
    id: row.id, number: row.number, kind: row.kind as ReturnKind, kindLabel: RETURN_KIND_LABEL[row.kind as ReturnKind] || row.kind,
    status: row.status as ReturnStatus, statusLabel: row.status === 'REFUNDED' ? row.refundMethod === 'CASH' ? 'وجه نقد برگشت داده شد' : row.refundMethod === 'CARD' ? 'وجه به کارت برگشت داده شد' : 'مبلغ به کیف پول برگشت' : RETURN_STATUS_LABEL[row.status as ReturnStatus] || row.status,
    reason: row.reason, reasonLabel: reasonLabel(row.reason), description: row.description,
    photos: parseJson<string[]>(row.photos, []).map((_, index) => `/api/store/returns/${row.id}/photos/${index}`),
    lines: choices.map((choice) => {
      const line = order?.lines.find((item) => item.line === choice.line)
      return { line: choice.line, quantity: choice.quantity, name: line?.name || `ردیف ${choice.line + 1}`, variantName: line?.variantName || '', image: line?.image || '' }
    }),
    requested: minorToNumber(row.requestedMinor, currency), refund: minorToNumber(row.refundMinor, currency), currency,
    adminNote: row.adminNote, createdAt: row.createdAt, decidedAt: row.decidedAt, refundedAt: row.refundedAt, restocked: row.restocked,
  }
}

/**
 * How many units of each line a return may hold right now. A shipped line: what has not gone back yet.
 * A line of delivered codes: no more than the codes the buyer still holds, and only while the shop takes
 * codes back. Any other virtual line: nothing.
 */
function returnableUnits(order: LoadedOrder, lines: RefundLine[], held: Map<number, number>, goods: Eligibility['goods']) {
  return new Map(order.lines.map((line) => {
    const left = Math.max(0, line.quantity - (lines.find((item) => item.line === line.line)?.returnedQuantity || 0))
    const code = held.has(line.line)
    return [line.line, code ? (goods.codes ? Math.min(left, held.get(line.line) || 0) : 0) : line.kind === 'PHYSICAL' && goods.physical ? left : 0]
  }))
}

function orderEligibility(order: LoadedOrder, settings: ReturnSettings, held: Map<number, number>) {
  const book = ledger(order)
  return eligibility({
    // A refunded order was paid; the fullyRefunded gate keeps it closed and
    // explains that terminal state instead of calling it an unpaid order.
    paid: order.status === 'PAID' || order.status === 'REFUNDED',
    fulfilment: order.productDelivery?.status || 'PENDING',
    deliveredAt: order.productDelivery?.deliveredAt || null,
    open: order.returns.some((row) => OPEN.includes(row.status as ReturnStatus)),
    fullyRefunded: book.remaining <= 0n || order.status === 'REFUNDED',
    physical: order.lines.some((line) => line.kind === 'PHYSICAL'),
    codes: held.size > 0,
  }, settings)
}

// ------------------------------------------------------------------ customer

/** Everything the order page needs to offer (or explain) cancel / return. */
export async function customerReturnInfo(userId: number, orderId: number) {
  const [order, settings] = await Promise.all([loadOrder(orderId, userId), getReturnSettings()])
  if (!order) return null
  const book = ledger(order)
  const held = await heldCodes(order.id)
  const allowed = orderEligibility(order, settings, held)
  const units = returnableUnits(order, book.lines, held, allowed.goods)
  const currency = normalizeCurrency(order.currency, 'IRT')
  return {
    eligibility: allowed,
    policy: settings.policy,
    windowDays: settings.windowDays,
    requirePhotos: settings.requirePhotos,
    // A cancellation of an order whose codes the buyer has already read is looked at by staff first.
    autoRefundCancel: settings.autoRefundCancel && !held.size,
    reasons: { CANCEL: reasonsFor('CANCEL'), RETURN: reasonsForGoods('RETURN', allowed.goods) },
    cancelRefund: minorToNumber(book.remaining > 0n ? book.remaining : 0n, currency),
    currency,
    lines: order.lines.map((line) => {
      const left = units.get(line.line) || 0
      const code = held.has(line.line)
      const gone = line.quantity - (book.lines.find((item) => item.line === line.line)?.returnedQuantity || 0) <= 0
      const unit = line.quantity > 0 ? returnRefundMinor([{ line: line.line, quantity: 1 }], book.lines.map((item) => ({ ...item, returnedQuantity: 0 })), book) : 0n
      return { line: line.line, name: line.name, variantName: line.variantName, image: line.image, kind: line.kind, quantity: line.quantity, returnable: left, code, off: left > 0 ? '' : gone ? 'قبلاً مرجوع شده' : code ? 'کد تحویل‌شده' : line.kind !== 'PHYSICAL' ? 'کالای مجازی' : 'مهلت مرجوعی گذشته', unitRefund: minorToNumber(unit, currency) }
    }),
    requests: order.returns.map((row) => requestView(row, order)),
  }
}

async function savePhotos(files: File[]) {
  const saved: string[] = []
  await mkdir(returnsDirectory(), { recursive: true })
  try {
    for (const file of files) {
      if (file.size > MAX_RETURN_PHOTO_BYTES) throw new StoreError('حجم هر تصویر حداکثر ۵ مگابایت است', 413)
      const bytes = Buffer.from(await file.arrayBuffer())
      const type = sniffImage(bytes)
      if (!type) throw new StoreError('تصویرها باید JPG، PNG یا WebP باشند')
      const name = `${randomUUID()}.${type.extension}`
      await writeFile(join(returnsDirectory(), name), bytes, { flag: 'wx', mode: 0o600 })
      saved.push(name)
    }
    return saved
  } catch (error) {
    await Promise.all(saved.map((name) => unlink(join(returnsDirectory(), name)).catch(() => {})))
    throw error
  }
}

/** POST multipart { kind, reason, description, lines (JSON), photos[] } — a cancellation or return request. */
export async function createReturnRequest(req: NextRequest, userId: number, orderId: number) {
  if (!rateLimitHit(`returns:${userId}`, 10, 60 * 60_000).ok) throw new StoreError('درخواست زیادی ثبت کرده‌اید؛ کمی بعد دوباره تلاش کنید', 429)
  let form: FormData
  try { form = await readMultipart(req, MAX_RETURN_PHOTOS * MAX_RETURN_PHOTO_BYTES + 256 * 1024, 'حجم تصویرها بیش از حد مجاز است') }
  catch (error) { throw error instanceof MultipartError ? new StoreError(error.message, error.status) : error }
  const field = (name: string) => { const value = form.get(name); return typeof value === 'string' ? value : '' }

  const [order, settings] = await Promise.all([loadOrder(orderId, userId), getReturnSettings()])
  if (!order) throw new StoreError('سفارش پیدا نشد', 404, 'ORDER_NOT_FOUND')
  const kind: ReturnKind = field('kind') === 'CANCEL' ? 'CANCEL' : 'RETURN'
  const held = await heldCodes(orderId)
  const allowed = orderEligibility(order, settings, held)
  if (kind === 'CANCEL' ? !allowed.cancel : !allowed.return) throw new StoreError(allowed.reason || (kind === 'CANCEL' ? 'لغو این سفارش دیگر ممکن نیست' : 'مرجوع کردن این سفارش ممکن نیست'), 409, 'NOT_ALLOWED')


  const book = ledger(order)
  const units = returnableUnits(order, book.lines, held, allowed.goods)
  const choices = kind === 'CANCEL'
    ? order.lines.map((line) => ({ line: line.line, quantity: line.quantity }))
    : normalizeChoices(parseJson(field('lines'), []), book.lines.map((line) => ({ ...line, returnedQuantity: line.quantity - (units.get(line.line) || 0) })))
  if (!choices.length) throw new StoreError('کالا و تعداد مرجوعی را انتخاب کنید')
  // The reason has to fit what is going back: codes, shipped goods, or both.
  const going = { physical: choices.some((choice) => !held.has(choice.line)), codes: choices.some((choice) => held.has(choice.line)) }
  const reason = (kind === 'CANCEL' ? reasonsFor(kind) : reasonsForGoods(kind, going)).find((item) => item.key === field('reason'))
  if (!reason) throw new StoreError('دلیل درخواست را انتخاب کنید')
  const description = plain(field('description'), 1500)
  if (reason.key === 'other' && description.length < 5) throw new StoreError('لطفاً دلیل را کوتاه توضیح دهید')

  const photos = form.getAll('photos').filter((item): item is File => typeof item !== 'string' && item.size > 0)
  if (photos.length > MAX_RETURN_PHOTOS) throw new StoreError(`حداکثر ${MAX_RETURN_PHOTOS.toLocaleString('fa-IR')} تصویر`)
  if (kind === 'RETURN' && reason.photos && settings.requirePhotos && !photos.length) throw new StoreError('برای این دلیل، دست‌کم یک عکس از کالا بفرستید')
  const saved = kind === 'RETURN' ? await savePhotos(photos) : []

  const requestedMinor = kind === 'CANCEL' ? book.remaining : clampRefund(returnRefundMinor(choices, book.lines, book), book.remaining)
  let row
  try {
    row = await db.$transaction(async (tx) => {
      // One open request per order, even under double submission.
      await lockOrder(tx, orderId)
      const open = await tx.returnRequest.count({ where: { orderId, status: { in: OPEN } } })
      if (open) throw new StoreError('یک درخواست باز برای این سفارش در حال بررسی است', 409, 'OPEN_REQUEST')
      const current = await loadOrder(orderId, userId, tx)
      if (!current || !['PAID', 'COMPLETED'].includes(current.status)) throw new StoreError('وضعیت سفارش تغییر کرده است', 409)
      const currentHeld = await heldCodes(orderId, tx)
      const currentAllowed = orderEligibility(current, settings, currentHeld)
      if (kind === 'CANCEL' ? !currentAllowed.cancel : !currentAllowed.return) throw new StoreError(currentAllowed.reason || 'شرایط لغو یا مرجوعی تغییر کرده است؛ سفارش را تازه کنید', 409, 'NOT_ALLOWED')
      const latest = ledger(current)
      const currentUnits = returnableUnits(current, latest.lines, currentHeld, currentAllowed.goods)
      if (kind === 'RETURN' && JSON.stringify(normalizeChoices(choices, latest.lines.map(line => ({ ...line, returnedQuantity: line.quantity - (currentUnits.get(line.line) || 0) })))) !== JSON.stringify(choices)) throw new StoreError('تعداد قابل مرجوعی تغییر کرده است؛ سفارش را تازه کنید', 409)
      if (requestedMinor > latest.remaining) throw new StoreError('مبلغ قابل بازپرداخت تغییر کرده است؛ سفارش را تازه کنید', 409)
      const created = await tx.returnRequest.create({ data: {
        number: `tmp-${randomUUID()}`, orderId, userId, kind, reason: reason.key, description, photos: JSON.stringify(saved),
        lines: JSON.stringify(choices), requestedMinor, currency: order.currency,
      } })
      const number = returnNumber(created.id)
      await tx.orderEvent.create({ data: { orderId, status: kind === 'CANCEL' ? 'CANCEL_REQUESTED' : 'RETURN_REQUESTED', note: `${RETURN_KIND_LABEL[kind]} ${number}: ${reason.label}`, visible: true, actorId: userId } })
      return tx.returnRequest.update({ where: { id: created.id }, data: { number } })
    })
  } catch (error) {
    await Promise.all(saved.map((name) => unlink(join(returnsDirectory(), name)).catch(() => {})))
    throw error
  }
  logEvent('info', 'store.return_requested', { returnId: row.id, orderId, kind })

  // Codes the buyer has already read cannot be un-read: such a cancellation waits for staff.
  if (kind === 'CANCEL' && settings.autoRefundCancel && !held.size) {
    await refundReturn({ id: row.id, actorId: null, restock: true, note: 'لغو پیش از ارسال؛ بازپرداخت خودکار' })
  } else {
    void import('@/modules/sms/server/sms').then(({ notifyAdmins }) => notifyAdmins('ADMIN_RETURN', { order: String(orderId), kind: RETURN_KIND_LABEL[kind], name: order.user?.name || order.user?.email || 'مشتری حضوری' }))
      .catch((error) => logEvent('error', 'sms.admin_failed', { error }))
  }
  return db.returnRequest.findUniqueOrThrow({ where: { id: row.id } })
}

/** The customer withdraws a request that nobody has acted on yet. */
export async function withdrawReturn(userId: number, id: number) {
  const changed = await db.returnRequest.updateMany({ where: { id, userId, status: 'REQUESTED' }, data: { status: 'WITHDRAWN', decidedAt: new Date() } })
  if (changed.count !== 1) throw new StoreError('این درخواست دیگر قابل لغو نیست', 409)
  const row = await db.returnRequest.findUniqueOrThrow({ where: { id } })
  await db.orderEvent.create({ data: { orderId: row.orderId, status: 'RETURN_WITHDRAWN', note: `درخواست ${row.number} توسط مشتری لغو شد`, visible: true, actorId: userId } })
  return row
}

/** A request photo for its owner or staff; never cached. */
export async function returnPhoto(id: number, index: number, viewer: { id: number; staff: boolean }) {
  const row = await db.returnRequest.findUnique({ where: { id }, select: { userId: true, photos: true } })
  if (!row || (!viewer.staff && row.userId !== viewer.id)) return null
  const name = parseJson<string[]>(row.photos, [])[index]
  if (!name || !/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)) return null
  const type = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
  try { return { bytes: await readFile(join(returnsDirectory(), name)), type } } catch { return null }
}

// ------------------------------------------------------------------ staff

export const RETURN_TABS = [
  { key: 'open', label: 'در انتظار بررسی' },
  { key: 'approved', label: 'در انتظار دریافت کالا' },
  { key: 'refunded', label: 'بازپرداخت‌شده' },
  { key: 'closed', label: 'رد یا لغوشده' },
  { key: 'all', label: 'همه' },
] as const

function tabWhere(tab: string): Prisma.ReturnRequestWhereInput {
  switch (tab) {
    case 'open': return { status: 'REQUESTED' }
    case 'approved': return { status: 'APPROVED' }
    case 'refunded': return { status: 'REFUNDED' }
    case 'closed': return { status: { in: ['REJECTED', 'WITHDRAWN'] } }
    default: return {}
  }
}

export async function adminReturns(input: { tab?: string; q?: string; page?: number }) {
  const tab = RETURN_TABS.some((item) => item.key === input.tab) ? String(input.tab) : 'open'
  const q = String(input.q || '').trim().slice(0, 80)
  const page = Math.max(1, Math.min(1000, Math.floor(Number(input.page) || 1)))
  const id = Number(q.replace(/^#|^RMA-/i, ''))
  const where: Prisma.ReturnRequestWhereInput = { AND: [tabWhere(tab), q ? { OR: [
    { number: { contains: q.toUpperCase() } },
    ...(Number.isSafeInteger(id) && id > 0 ? [{ orderId: id }, { id }] : []),
  ] } : {}] }
  const [rows, total, counts] = await Promise.all([
    db.returnRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25, include: { order: { select: { id: true, customerName: true, customerPhone: true, user: { select: { name: true, email: true, phone: true } } } } } }),
    db.returnRequest.count({ where }),
    Promise.all(RETURN_TABS.map((item) => db.returnRequest.count({ where: tabWhere(item.key) }))),
  ])
  return {
    tab, q, page, pages: Math.max(1, Math.ceil(total / 25)),
    counts: Object.fromEntries(RETURN_TABS.map((item, index) => [item.key, counts[index]])),
    rows: rows.map((row) => ({ ...requestView(row), orderId: row.orderId, customer: row.order.user, customerName: row.order.customerName, customerPhone: row.order.customerPhone })),
  }
}

export async function adminReturn(id: number) {
  const row = await db.returnRequest.findUnique({ where: { id }, include: { replacementOrder: { select: { totalMinor: true, invoice: { select: { number: true } }, lines: { select: { name: true, variantName: true, quantity: true } } } } } })
  if (!row) return null
  const order = await loadOrder(row.orderId)
  if (!order) return null
  const book = ledger(order)
  const currency = normalizeCurrency(order.currency, 'IRT')
  return {
    ...requestView(row, order),
    order: {
      id: order.id, status: order.status, fulfilment: order.productDelivery?.status || '', deliveredAt: order.productDelivery?.deliveredAt || null,
      total: minorToNumber(order.totalMinor, currency), refunded: minorToNumber(book.refunded, currency), remaining: minorToNumber(book.remaining > 0n ? book.remaining : 0n, currency),
      invoiceNumber: order.invoice?.number || '', customer: order.user, customerName: order.customerName, customerPhone: order.customerPhone,
    },
    exchange: row.kind === 'RETURN' && row.status === 'REFUNDED' ? {
      returnId: row.id, orderId: row.orderId, customerId: order.userId,
      customerName: order.customerName || order.user?.name || '', customerPhone: order.customerPhone || order.user?.phone || '',
      currency, refundMinor: row.refundMinor.toString(), replacementOrderId: row.replacementOrderId,
      replacementTotalMinor: row.replacementOrder?.totalMinor.toString() || null,
      replacementInvoice: row.replacementOrder?.invoice?.number || '',
      replacementLines: row.replacementOrder?.lines || [],
    } : null,
    inspection: {
      status: row.inspectionStatus,
      canReceive: row.kind === 'RETURN' && row.status === 'REFUNDED' && !row.restocked && order.lines.some(line => line.kind === 'PHYSICAL'),
      updatedAt: row.updatedAt.toISOString(),
      lines: requestView(row, order).lines.filter((line) => order.lines.find((entry) => entry.line === line.line)?.kind === 'PHYSICAL').map((line) => ({ ...line, productId: order.lines.find((entry) => entry.line === line.line)?.productId ?? null, variantId: order.lines.find((entry) => entry.line === line.line)?.variantId ?? null, quarantineQuantity: row.inspectionStatus === 'PENDING' ? line.quantity : 0 })),
      segments: parseJson<Array<Record<string, unknown>>>(row.inspectionLines, []),
    },
    history: order.returns.filter((item) => item.id !== row.id).map((item) => requestView(item, order)),
  }
}

export async function inspectReturn(...args: Parameters<typeof inspectReturnState>) {
  await inspectReturnState(...args)
  return adminReturn(args[0].id)
}
export async function receiveReturnGoods(...args: Parameters<typeof receiveReturnState>) {
  await receiveReturnState(...args)
  return adminReturn(args[0].id)
}

/** Approve (the customer sends the item back) or reject with a reason the customer sees. */
export async function decideReturn(input: { id: number; action: 'approve' | 'reject'; note?: unknown; actorId: number }) {
  const note = plain(input.note, 1000)
  if (input.action === 'reject' && note.length < 3) throw new StoreError('دلیل رد درخواست را برای مشتری بنویسید')
  const status: ReturnStatus = input.action === 'approve' ? 'APPROVED' : 'REJECTED'
  const changed = await db.returnRequest.updateMany({ where: { id: input.id, status: 'REQUESTED' }, data: { status, adminNote: note, decidedBy: input.actorId, decidedAt: new Date() } })
  if (changed.count !== 1) throw new StoreError('وضعیت درخواست تغییر کرده است؛ صفحه را تازه کنید', 409, 'CONFLICT')
  const row = await db.returnRequest.findUniqueOrThrow({ where: { id: input.id } })
  await db.orderEvent.create({ data: { orderId: row.orderId, status: status === 'APPROVED' ? 'RETURN_APPROVED' : 'RETURN_REJECTED', note: `${row.number}: ${RETURN_STATUS_LABEL[status]}${note ? ` — ${note}` : ''}`, visible: true, actorId: input.actorId } })
  await notifyCustomer(row, status, `درخواست ${row.number}: ${RETURN_STATUS_LABEL[status]}`, status === 'APPROVED'
    ? `درخواست شما تأیید شد.${note ? ` ${note}` : ''} پس از دریافت کالا، مبلغ به کیف پول شما برمی‌گردد.`
    : `درخواست شما رد شد: ${note}`)
  return row
}
