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
import { minorToNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { restockConsumedInventory } from '@/modules/catalog/server/inventory'
import { StoreError, canMoveTo } from '@/modules/store/domain/store'
import {
  MAX_RETURN_PHOTOS, MAX_RETURN_PHOTO_BYTES, RETURN_KIND_LABEL, RETURN_STATUS_LABEL, clampRefund, eligibility, normalizeChoices,
  normalizeReturnSettings, reasonLabel, reasonsFor, reasonsForGoods, returnNumber, returnRefundMinor,
  type Eligibility,
  type LineChoice, type RefundLine, type ReturnKind, type ReturnSettings, type ReturnStatus,
} from '@/modules/store/domain/returns'
import { transitionOrder } from '@/modules/store/server/orders'
import { heldCodes, takeBackCodes } from '@/modules/store/server/digital-codes'
import { syncCodeStock } from '@/modules/catalog/server/code-stock'

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
async function lockOrder(tx: Prisma.TransactionClient, orderId: number) {
  if (/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL || '')) await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
  // SQLite serializes writes through its existing transaction/file lock.
}
export const returnsDirectory = () => join(process.cwd(), 'storage', 'returns')

export async function getReturnSettings(): Promise<ReturnSettings> {
  return normalizeReturnSettings(await readJsonSetting(SETTINGS_KEY).catch(() => undefined))
}

export async function saveReturnSettings(input: unknown) {
  const settings = normalizeReturnSettings(input)
  await writeJsonSetting(SETTINGS_KEY, settings)
  return settings
}

const parseJson = <T>(raw: string, fallback: T): T => { try { return JSON.parse(raw) as T } catch { return fallback } }
const minorOf = (value: unknown) => { try { return BigInt(String(value ?? '0')) } catch { return 0n } }
const plain = (value: unknown, max: number) => String(value ?? '').replace(/[<>]/g, '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max)

function loadOrder(orderId: number, userId?: number) {
  return db.order.findFirst({
    where: { id: orderId, productId: { not: null }, ...(userId ? { userId } : {}) },
    include: {
      lines: { orderBy: { line: 'asc' }, include: { product: { select: { slug: true } } } },
      productDelivery: { select: { status: true, deliveredAt: true } },
      invoice: { select: { id: true, number: true, status: true } },
      returns: { orderBy: { createdAt: 'desc' } },
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  })
}
type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>

/** How much of the order has already gone back, and which quantities are taken by other requests. */
function ledger(order: LoadedOrder) {
  const refunded = order.returns.filter((row) => row.status === 'REFUNDED').reduce((sum, row) => sum + row.refundMinor, 0n)
  const taken = new Map<number, number>()
  for (const row of order.returns) {
    if (!['REQUESTED', 'APPROVED', 'REFUNDED'].includes(row.status)) continue
    if (row.kind === 'CANCEL') { for (const line of order.lines) taken.set(line.line, line.quantity); continue }
    for (const choice of parseJson<LineChoice[]>(row.lines, [])) taken.set(choice.line, (taken.get(choice.line) || 0) + choice.quantity)
  }
  const lines: RefundLine[] = order.lines.map((line) => ({ line: line.line, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, totalMinor: line.totalMinor, returnedQuantity: Math.min(line.quantity, taken.get(line.line) || 0) }))
  const meta = parseJson<Record<string, unknown>>(order.meta, {})
  const itemsMinor = order.lines.reduce((sum, line) => sum + line.totalMinor, 0n)
  return { refunded, remaining: order.totalMinor - refunded, lines, itemsMinor, discountMinor: minorOf(meta.discountMinor) }
}

function requestView(row: { id: number; number: string; kind: string; status: string; reason: string; description: string; photos: string; lines: string; requestedMinor: bigint; refundMinor: bigint; currency: string; adminNote: string; createdAt: Date; decidedAt: Date | null; refundedAt: Date | null; restocked: boolean }, order?: LoadedOrder) {
  const currency = normalizeCurrency(row.currency, 'IRT')
  const choices = parseJson<LineChoice[]>(row.lines, [])
  return {
    id: row.id, number: row.number, kind: row.kind as ReturnKind, kindLabel: RETURN_KIND_LABEL[row.kind as ReturnKind] || row.kind,
    status: row.status as ReturnStatus, statusLabel: RETURN_STATUS_LABEL[row.status as ReturnStatus] || row.status,
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
    paid: order.status === 'PAID',
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
    void import('@/modules/sms/server/sms').then(({ notifyAdmins }) => notifyAdmins('ADMIN_RETURN', { order: String(orderId), kind: RETURN_KIND_LABEL[kind], name: order.user.name || order.user.email }))
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
    db.returnRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25, include: { order: { select: { id: true, user: { select: { name: true, email: true, phone: true } } } } } }),
    db.returnRequest.count({ where }),
    Promise.all(RETURN_TABS.map((item) => db.returnRequest.count({ where: tabWhere(item.key) }))),
  ])
  return {
    tab, q, page, pages: Math.max(1, Math.ceil(total / 25)),
    counts: Object.fromEntries(RETURN_TABS.map((item, index) => [item.key, counts[index]])),
    rows: rows.map((row) => ({ ...requestView(row), orderId: row.orderId, customer: row.order.user })),
  }
}

export async function adminReturn(id: number) {
  const row = await db.returnRequest.findUnique({ where: { id } })
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
      invoiceNumber: order.invoice?.number || '', customer: order.user,
    },
    history: order.returns.filter((item) => item.id !== row.id).map((item) => requestView(item, order)),
  }
}

async function notifyCustomer(row: { id: number; number: string; orderId: number; userId: number }, status: string, title: string, body: string) {
  await createInboxEvent({
    userId: row.userId, kind: 'ORDER_REFUND', dedupeKey: `return:${row.id}:${status}`,
    titleEn: `Request ${row.number}: ${status.toLowerCase()}`, titleFa: title, bodyEn: body, bodyFa: body, href: `/dashboard/orders/${row.orderId}`,
  }).catch(() => {})
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

/**
 * Refunds a request to the wallet (amount defaults to what was requested,
 * never more than the order's unrefunded balance). The amount is decided and
 * the status claimed together under the order's lock, so neither two clicks
 * on one request nor two requests of one order can refund more than the order
 * holds. The wallet credit is idempotent per request, and a request that was
 * claimed but never credited (the process stopped in between) is finished by
 * calling this again.
 */
export async function refundReturn(input: { id: number; actorId: number | null; amount?: unknown; restock?: boolean; note?: unknown }) {
  const row = await db.returnRequest.findUnique({ where: { id: input.id } })
  if (!row) throw new StoreError('درخواست پیدا نشد', 404)
  // Claimed as refunded but no wallet movement recorded: finish that refund with the amount it claimed.
  const resuming = row.status === 'REFUNDED' && !row.walletTxId && row.refundMinor > 0n
  if (!resuming && !OPEN.includes(row.status as ReturnStatus)) throw new StoreError('این درخواست قابل بازپرداخت نیست', 409)
  const order = await loadOrder(row.orderId)
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
    : await db.$transaction(async (tx) => {
      await lockOrder(tx, row.orderId)
      const others = await tx.returnRequest.aggregate({ where: { orderId: row.orderId, status: 'REFUNDED', id: { not: row.id } }, _sum: { refundMinor: true } })
      const before = order.totalMinor - (others._sum.refundMinor || 0n)
      const amount = clampRefund(requested, before)
      if (amount <= 0n) throw new StoreError('مبلغی برای بازپرداخت باقی نمانده است')
      const claimed = await tx.returnRequest.updateMany({ where: { id: row.id, status: row.status }, data: { status: 'REFUNDED', refundMinor: amount, refundedAt: new Date(), decidedBy: input.actorId ?? row.decidedBy, decidedAt: row.decidedAt || new Date(), ...(note ? { adminNote: note } : {}) } })
      if (claimed.count !== 1) throw new StoreError('وضعیت درخواست تغییر کرده است؛ صفحه را تازه کنید', 409, 'CONFLICT')
      return { amount, before }
    })
  const amount = settled.amount
  const book = { remaining: settled.before }

  const credit = await moveWallet({
    userId: row.userId, amount: minorToNumber(amount, currency), currency, type: 'REFUND',
    description: `${RETURN_KIND_LABEL[row.kind as ReturnKind]} ${row.number} — سفارش ${row.orderId}`,
    orderId: row.orderId, invoiceId: order.invoice?.id ?? null, adminId: input.actorId, idempotencyKey: `return-refund:${row.id}`,
  })
  if (!credit.ok) {
    // A resumed refund stays claimed, so it is tried again; a new one is released for another attempt.
    if (!resuming) await db.returnRequest.updateMany({ where: { id: row.id, status: 'REFUNDED', walletTxId: null }, data: { status: row.status, refundMinor: 0n, refundedAt: null } })
    logEvent('error', 'store.return_refund_failed', { returnId: row.id, message: credit.message })
    throw new StoreError(`واریز به کیف پول انجام نشد: ${credit.message}`, 502)
  }
  await db.returnRequest.update({ where: { id: row.id }, data: { walletTxId: credit.txId } })
  // The codes that were paid back are void from here on (never back on the shelf). Repeating it takes nothing twice.
  const choices = parseJson<LineChoice[]>(row.lines, [])
  const voided = await takeBackCodes(row.orderId, row.kind === 'CANCEL' ? null : choices, { returnId: row.id, note: row.number }).catch((error) => { logEvent('error', 'store.return_codes_failed', { returnId: row.id, error: String(error) }); return 0 })
  if (resuming && credit.idempotent) {
    // The money had already been credited; only the record of it was missing. Whether the order-level
    // effects ran cannot be told from here, and repeating them could restock twice, so they are left.
    logEvent('warn', 'store.return_refund_record_repaired', { returnId: row.id, orderId: row.orderId })
    return db.returnRequest.findUniqueOrThrow({ where: { id: row.id } })
  }

  // Order-level effects: fulfilment state, stock, and a fully refunded order/invoice.
  const fullyRefunded = book.remaining - amount <= 0n
  const fulfilment = order.productDelivery?.status || ''
  const target = row.kind === 'CANCEL' ? 'CANCELLED' : fullyRefunded ? 'RETURNED' : ''
  const restock = input.restock !== false && !row.restocked
  if (target && canMoveTo(fulfilment, target)) {
    await transitionOrder({ orderId: row.orderId, to: target, actorId: input.actorId, notify: false, restock: restock && row.kind === 'CANCEL', note: `${RETURN_KIND_LABEL[row.kind as ReturnKind]} ${row.number}` }).catch((error) => logEvent('warn', 'store.return_transition_failed', { returnId: row.id, error: error instanceof Error ? error.message : String(error) }))
  } else if (row.kind === 'CANCEL' && restock) {
    await restockConsumedInventory(row.orderId)
  }
  if (restock && row.kind === 'RETURN') await restockLines(row.orderId, parseJson<LineChoice[]>(row.lines, []))
  if (restock) await db.returnRequest.update({ where: { id: row.id }, data: { restocked: true } })
  if (fullyRefunded) {
    await db.order.update({ where: { id: row.orderId }, data: { status: 'REFUNDED' } })
    if (order.invoice) await db.invoice.update({ where: { id: order.invoice.id }, data: { status: 'REFUNDED' } })
  }
  // Marketplace sellers give back their share of the refunded part (and get the commission back).
  await import('@/modules/marketplace/server/marketplace').then((m) => m.reverseSellerShare(row.orderId, amount, `return:${row.id}`, row.kind === 'RETURN' ? parseJson<LineChoice[]>(row.lines, []).map((choice) => choice.line) : undefined)).catch((error) => logEvent('error', 'marketplace.refund_reverse_failed', { returnId: row.id, error: String(error) }))
  // Customer club points earned on the refunded part go back.
  await import('@/modules/store/server/marketing').then((m) => m.reverseOrderPoints(row.orderId, amount, `return:${row.id}`)).catch((error) => logEvent('warn', 'store.loyalty_reverse_failed', { returnId: row.id, error: String(error) }))
  const shown = minorToNumber(amount, currency).toLocaleString('fa-IR')
  await db.orderEvent.create({ data: { orderId: row.orderId, status: 'REFUNDED', note: `${row.number}: ${shown} ${currency === 'IRT' ? 'تومان' : currency} به کیف پول برگشت${voided ? `؛ ${voided.toLocaleString('fa-IR')} کد باطل شد` : ''}${note ? ` — ${note}` : ''}`, visible: true, actorId: input.actorId } })
  await notifyCustomer(row, 'REFUNDED', `برگشت وجه ${row.number}`, `${shown} ${currency === 'IRT' ? 'تومان' : currency} بابت ${RETURN_KIND_LABEL[row.kind as ReturnKind]} سفارش ${row.orderId.toLocaleString('fa-IR')} به کیف پول شما واریز شد.`)
  logEvent('info', 'store.return_refunded', { returnId: row.id, orderId: row.orderId, amount: amount.toString(), currency })
  return db.returnRequest.findUniqueOrThrow({ where: { id: row.id } })
}

/**
 * Worker step: refunds that were claimed but never credited because the process stopped in
 * between. Requests marked refunded for at least ten minutes with no wallet movement recorded
 * are finished through the ordinary refund path, which credits once. One that fails is
 * logged and tried again on a later pass.
 */
export async function recoverInterruptedRefunds(limit = 20, now = new Date()) {
  const rows = await db.returnRequest.findMany({ where: { status: 'REFUNDED', walletTxId: null, refundMinor: { gt: 0n }, refundedAt: { lte: new Date(now.getTime() - 10 * 60_000) } }, orderBy: { id: 'asc' }, take: Math.max(1, Math.min(100, Math.trunc(limit) || 20)), select: { id: true } })
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

/** Returned items back on the shelf (finite stock only), line by line. */
async function restockLines(orderId: number, choices: LineChoice[]) {
  const reservations = await db.inventoryReservation.findMany({ where: { orderId, status: 'CONSUMED', line: { in: choices.map((choice) => choice.line) } } })
  const lines = await db.orderLine.findMany({ where: { orderId, line: { in: choices.map((choice) => choice.line) } }, select: { line: true, productId: true, product: { select: { digitalMode: true } } } })
  for (const choice of choices) {
    const reservation = reservations.find((row) => row.line === choice.line)
    const productId = reservation?.productId ?? lines.find((line) => line.line === choice.line)?.productId
    if (!productId) continue
    // A product that sells from its code pool has no stock of its own to give back: the returned code is void.
    if (lines.find((line) => line.line === choice.line)?.product?.digitalMode === 'CODES') {
      await db.$transaction((tx) => syncCodeStock(tx, productId))
      await db.product.updateMany({ where: { id: productId, soldCount: { gte: choice.quantity } }, data: { soldCount: { decrement: choice.quantity } } })
      continue
    }
    if (!reservation || reservation.finite) await db.product.updateMany({ where: { id: productId, stock: { gte: 0 } }, data: { stock: { increment: choice.quantity } } })
    if (reservation?.variantFinite && reservation.variantId) await db.productVariant.updateMany({ where: { id: reservation.variantId }, data: { stock: { increment: choice.quantity } } })
    await db.product.updateMany({ where: { id: productId, soldCount: { gte: choice.quantity } }, data: { soldCount: { decrement: choice.quantity } } })
  }
}
