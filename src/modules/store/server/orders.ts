import type { Prisma } from '@prisma/client'
import { invoiceSubject } from '@/modules/billing/domain/invoice-subject'
import { db } from '@/platform/database/prisma'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { encryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { orderDeliveryTemplate } from '@/modules/store/server/delivery-template'
import { restockConsumedInventory } from '@/modules/catalog/server/inventory'
import { FULFILMENT_LABEL, StoreError, canMoveTo, isFulfilmentStatus, type FulfilmentStatus } from '@/modules/store/domain/store'
import { minorToNumber } from '@/shared/money'
import { maskAnswers } from '@/modules/store/domain/order-inputs'
import { openAnswers } from '@/modules/store/server/order-inputs'
import { jalaliDayLabel } from '@/shared/time/jalali'
import { lockOrderWork, orderVisibility, type OrderWorkScope } from '@/modules/store/server/order-work'

// Store orders are orders with a product (Order.productId is the first line).
// Payment state lives on Order/Invoice; the physical/digital fulfilment state
// lives on ProductDelivery (created once the payment is settled).

const STORE_ORDER: Prisma.OrderWhereInput = { productId: { not: null } }
const DEAD = ['FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED']

const parseMeta = (raw: string): Record<string, unknown> => {
  try { return JSON.parse(raw || '{}') as Record<string, unknown> } catch { return {} }
}
const minorOf = (value: unknown) => {
  try { return BigInt(String(value ?? '0')) } catch { return 0n }
}

export type OrderLineInput = { key: string; label: string; value: string; secret: boolean }
export type OrderLineView = {
  productId: number | null; slug: string; name: string; variantName: string; image: string; kind: string; quantity: number; unitPrice: number; listPrice: number; total: number
  /** The order line itself (0 for an order from before carts). */
  lineId: number
  /** What the buyer gave for this line. A password is masked here for everybody; staff reveal it with a recorded click. */
  inputs: OrderLineInput[]
  inputsErasedAt: Date | null
  /** The foreign amount this line paid for, and the rate it was priced with. */
  openAmount: { amount: string; currency: string; rate: string } | null
}

type OrderWithLines = {
  id: number; totalMinor: bigint; currency: string; meta: string
  lines: { id?: number; inputs?: string; inputsErasedAt?: Date | null; openAmountMinor?: bigint; openCurrency?: string; openRate?: string; productId: number | null; name: string; variantName: string; image: string; kind: string; quantity: number; unitPriceMinor: bigint; listPriceMinor: bigint; totalMinor: bigint; product: { slug: string } | null }[]
  product: { slug: string; name: string; image: string; kind: string } | null
}

/** Order lines, or one synthetic line for orders placed before carts existed. */
export function orderLines(order: OrderWithLines): OrderLineView[] {
  const cur = order.currency
  if (order.lines.length) return order.lines.map((line) => ({
    productId: line.productId, slug: line.product?.slug || '', name: line.name, variantName: line.variantName, image: line.image, kind: line.kind,
    quantity: line.quantity, unitPrice: minorToNumber(line.unitPriceMinor, cur), listPrice: line.listPriceMinor ? minorToNumber(line.listPriceMinor, cur) : 0, total: minorToNumber(line.totalMinor, cur),
    lineId: line.id || 0,
    inputs: maskAnswers(openAnswers(line.inputs)).map((answer) => ({ key: answer.key, label: answer.label, value: answer.value, secret: answer.kind === 'secret' })),
    inputsErasedAt: line.inputsErasedAt || null,
    openAmount: line.openAmountMinor && line.openAmountMinor > 0n ? { amount: (Number(line.openAmountMinor) / 100).toFixed(2), currency: line.openCurrency || '', rate: line.openRate || '' } : null,
  }))
  if (!order.product) return []
  const meta = parseMeta(order.meta)
  const itemMinor = order.totalMinor - minorOf(meta.shippingMinor) + minorOf(meta.discountMinor)
  return [{
    productId: Number(meta.productId) || null, slug: order.product.slug, name: order.product.name, variantName: String(meta.variantName || ''), image: order.product.image,
    kind: order.product.kind, quantity: 1, unitPrice: minorToNumber(itemMinor, cur), listPrice: 0, total: minorToNumber(itemMinor, cur),
    lineId: 0, inputs: [], inputsErasedAt: null, openAmount: null,
  }]
}

const LINE_INCLUDE = {
  lines: { orderBy: { line: 'asc' as const }, include: { product: { select: { slug: true } } } },
  product: { select: { slug: true, name: true, image: true, kind: true } },
}

/**
 * Called once a store order is paid and handed to fulfilment: counts the sale
 * on each product and opens the timeline. Idempotent (keyed on the PAID event).
 */
export async function recordStoreSale(orderId: number, client?: Prisma.TransactionClient) {
  const record = async (tx: Prisma.TransactionClient) => {
    if (await tx.orderEvent.findFirst({ where: { orderId, status: 'PAID' }, select: { id: true } })) return
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { productId: true, lines: { select: { productId: true, quantity: true } } } })
    // A counter repair invoice may hold only work (lines without a product); it is still a recorded sale.
    if (!order || (!order.productId && !order.lines.length)) return
    const sold = order.lines.length ? order.lines.filter((line) => line.productId) : [{ productId: order.productId!, quantity: 1 }]
    for (const line of sold) await tx.product.updateMany({ where: { id: line.productId! }, data: { soldCount: { increment: line.quantity } } })
    await tx.orderEvent.create({ data: { orderId, status: 'PAID', note: 'پرداخت تأیید شد و سفارش به صف پردازش رفت' } })
  }
  await (client ? record(client) : db.$transaction(record))
}

/**
 * Worker step: delivered store orders whose sale was never recorded. The record (sold counters and
 * the "paid" entry of the order's timeline) is written once, as a follow-up of the delivery job,
 * and a failure there is only logged. Looks at deliveries created in the last days that are at
 * least ten minutes old and have no "paid" entry; recording is guarded by that entry, so it
 * happens once. One order that fails does not stop the others.
 */
export async function recoverStoreSaleRecords(limit = 20, days = 3, now = new Date()) {
  const rows = await db.productDelivery.findMany({
    where: { createdAt: { gte: new Date(now.getTime() - (Number(days) > 0 ? Number(days) : 3) * 86_400_000), lte: new Date(now.getTime() - 10 * 60_000) }, order: { status: 'PAID', events: { none: { status: 'PAID' } } } },
    orderBy: { id: 'asc' }, take: Math.max(1, Math.min(100, Math.trunc(limit) || 20)), select: { orderId: true },
  })
  let recorded = 0
  let failed = 0
  for (const row of rows) {
    try { await recordStoreSale(row.orderId); recorded++ } catch { failed++ }
  }
  return { checked: rows.length, recorded, failed }
}

// ------------------------------------------------------------------ customer

export const CUSTOMER_TABS = [
  { key: 'current', label: 'جاری' },
  { key: 'unpaid', label: 'در انتظار پرداخت' },
  { key: 'delivered', label: 'تحویل شده' },
  { key: 'returned', label: 'مرجوع شده' },
  { key: 'cancelled', label: 'لغو شده' },
] as const
export type CustomerTab = (typeof CUSTOMER_TABS)[number]['key']

function customerWhere(userId: number, tab: CustomerTab): Prisma.OrderWhereInput {
  const base = { ...STORE_ORDER, userId }
  switch (tab) {
    case 'unpaid': return { ...base, status: 'PENDING' }
    case 'delivered': return { ...base, status: 'PAID', productDelivery: { is: { status: 'DELIVERED' } } }
    case 'returned': return { ...base, productDelivery: { is: { status: 'RETURNED' } } }
    // A returned order has its own tab, even though its money went back too.
    case 'cancelled': return { ...base, AND: [{ OR: [{ status: { in: [...DEAD, 'REFUNDED'] } }, { productDelivery: { is: { status: 'CANCELLED' } } }] }, { OR: [{ productDelivery: { is: null } }, { productDelivery: { is: { status: { not: 'RETURNED' } } } }] }] }
    default: return { ...base, status: 'PAID', OR: [{ productDelivery: { is: null } }, { productDelivery: { is: { status: { in: ['PENDING', 'PROCESSING', 'PACKED', 'SHIPPED'] } } } }] }
  }
}

/** Customer-facing state of an order (payment first, then fulfilment). */
export function orderState(order: { status: string; productDelivery: { status: string } | null }): { key: string; label: string; tone: 'info' | 'warn' | 'ok' | 'bad' } {
  if (order.status === 'PENDING') return { key: 'UNPAID', label: 'در انتظار پرداخت', tone: 'warn' }
  if (order.status !== 'PAID') return { key: 'CANCELLED', label: order.status === 'REFUNDED' ? 'بازپرداخت شد' : 'لغو شد', tone: 'bad' }
  const status = order.productDelivery?.status || 'PENDING'
  const label = isFulfilmentStatus(status) ? FULFILMENT_LABEL[status] : status
  return { key: status, label, tone: status === 'DELIVERED' ? 'ok' : status === 'CANCELLED' || status === 'RETURNED' ? 'bad' : 'info' }
}

export async function customerOrders(userId: number, tab: CustomerTab) {
  const [orders, counts] = await Promise.all([
    db.order.findMany({
      where: customerWhere(userId, tab), orderBy: { createdAt: 'desc' }, take: 50,
      include: { ...LINE_INCLUDE, productDelivery: { select: { status: true } }, invoice: { select: { number: true } } },
    }),
    Promise.all(CUSTOMER_TABS.map((item) => db.order.count({ where: customerWhere(userId, item.key) }))),
  ])
  return {
    counts: Object.fromEntries(CUSTOMER_TABS.map((item, index) => [item.key, counts[index]])) as Record<CustomerTab, number>,
    orders: orders.map((order) => ({
      id: order.id, createdAt: order.createdAt, total: minorToNumber(order.totalMinor, order.currency), currency: order.currency,
      state: orderState(order), invoiceNumber: order.invoice?.number || '', paymentUrl: order.status === 'PENDING' ? order.paymentUrl : '',
      lines: orderLines(order),
    })),
  }
}

export async function customerOrder(userId: number, orderId: number) {
  const order = await db.order.findFirst({
    where: { ...STORE_ORDER, id: orderId, userId },
    include: {
      ...LINE_INCLUDE,
      productDelivery: { select: { status: true, trackingCode: true, deliveryNote: true, deliveredAt: true, address: true, scheduledDate: true, scheduledSlot: true } },
      invoice: { select: { number: true, status: true, discountMinor: true, walletAppliedMinor: true } },
      events: { where: { visible: true }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!order) return null
  return {...orderDetailView(order),pickup:await (await import('@/modules/store/server/pickup')).pickupForCustomer(userId,orderId)}
}

type DetailOrder = Awaited<ReturnType<typeof loadAdminOrder>>

function orderDetailView(order: NonNullable<DetailOrder> | (OrderWithLines & {
  id: number; status: string; createdAt: Date; paymentUrl: string
  productDelivery: { status: string; trackingCode: string; deliveryNote: string; deliveredAt: Date | null; address: string; scheduledDate: string; scheduledSlot: string } | null
  invoice: { number: string; status: string; discountMinor: bigint; walletAppliedMinor: bigint } | null
  events: { id: number; status: string; note: string; createdAt: Date; visible: boolean }[]
})) {
  const meta = parseMeta(order.meta)
  const cur = order.currency
  const address = order.productDelivery?.address ? parseMeta(order.productDelivery.address) : (meta.shippingAddress as Record<string, unknown> | undefined) || null
  const delivery = (meta.delivery && typeof meta.delivery === 'object' ? meta.delivery : null) as { date?: string; slot?: { label?: string } } | null
  const shippingMinor = minorOf(meta.shippingMinor)
  const discountMinor = minorOf(meta.discountMinor)
  const lines = orderLines(order)
  return {
    id: order.id,
    createdAt: order.createdAt,
    state: orderState(order),
    fulfilment: order.productDelivery?.status || '',
    trackingCode: order.productDelivery?.trackingCode || '',
    deliveryNote: order.productDelivery?.deliveryNote || '',
    deliveredAt: order.productDelivery?.deliveredAt || null,
    address: address ? {
      title: String(address.title || ''), recipient: String(address.recipient || ''), phone: String(address.phone || ''),
      postalCode: String(address.postalCode || ''), address: String(address.address || ''),
      lat: Number.isFinite(Number(address.lat)) && address.lat ? Number(address.lat) : null,
      lng: Number.isFinite(Number(address.lng)) && address.lng ? Number(address.lng) : null,
    } : null,
    schedule: order.productDelivery?.scheduledDate
      ? { date: order.productDelivery.scheduledDate, slot: order.productDelivery.scheduledSlot }
      : delivery?.date ? { date: String(delivery.date), slot: String(delivery.slot?.label || '') } : null,
    lines,
    currency: cur,
    itemsTotal: lines.reduce((sum, line) => sum + line.total, 0),
    listTotal: lines.reduce((sum, line) => sum + (line.listPrice || line.unitPrice) * line.quantity, 0),
    discount: minorToNumber(discountMinor, cur),
    discountCode: String(meta.discountCode || ''),
    shipping: minorToNumber(shippingMinor, cur),
    shippingMethod: meta.shipping && typeof meta.shipping === 'object' ? (() => {
      const m = meta.shipping as Record<string, unknown>
      return { carrierId: String(m.carrierId || ''), carrierName: String(m.carrierName || ''), collect: m.collect === true, eta: String(m.eta || ''), weightGrams: Number(m.weightGrams) || 0 }
    })() : null,
    total: minorToNumber(order.totalMinor, cur),
    walletApplied: order.invoice ? minorToNumber(order.invoice.walletAppliedMinor, cur) : 0,
    invoiceNumber: order.invoice?.number || '',
    invoiceStatus: order.invoice?.status || '',
    paymentUrl: order.status === 'PENDING' ? order.paymentUrl : '',
    events: order.events.map((event) => ({ id: event.id, status: event.status, note: event.note, createdAt: event.createdAt, visible: event.visible })),
  }
}

// ------------------------------------------------------------------ admin

export const ADMIN_TABS = [
  { key: 'all', label: 'همه' },
  { key: 'new', label: 'جدید' },
  { key: 'processing', label: 'در حال آماده‌سازی' },
  { key: 'shipped', label: 'ارسال‌شده' },
  { key: 'delivered', label: 'تحویل‌شده' },
  { key: 'unpaid', label: 'پرداخت‌نشده' },
  { key: 'closed', label: 'لغو و مرجوعی' },
] as const
export type AdminTab = (typeof ADMIN_TABS)[number]['key']

function adminWhere(tab: AdminTab): Prisma.OrderWhereInput {
  switch (tab) {
    case 'new': return { ...STORE_ORDER, status: 'PAID', OR: [{ productDelivery: { is: null } }, { productDelivery: { is: { status: 'PENDING' } } }] }
    case 'processing': return { ...STORE_ORDER, status: 'PAID', productDelivery: { is: { status: { in: ['PROCESSING', 'PACKED'] } } } }
    case 'shipped': return { ...STORE_ORDER, status: 'PAID', productDelivery: { is: { status: 'SHIPPED' } } }
    case 'delivered': return { ...STORE_ORDER, status: 'PAID', productDelivery: { is: { status: 'DELIVERED' } } }
    case 'unpaid': return { ...STORE_ORDER, status: 'PENDING' }
    case 'closed': return { ...STORE_ORDER, OR: [{ status: { in: [...DEAD, 'REFUNDED'] } }, { productDelivery: { is: { status: { in: ['CANCELLED', 'RETURNED'] } } } }] }
    default: return STORE_ORDER
  }
}

export async function adminOrders(input: { tab?: string; q?: string; page?: number; kind?: string; date?: string }, scope?: OrderWorkScope) {
  const tab = (ADMIN_TABS.some((item) => item.key === input.tab) ? input.tab : 'all') as AdminTab
  const q = String(input.q || '').trim().slice(0, 80)
  const page = Math.max(1, Math.min(1000, Math.floor(Number(input.page) || 1)))
  const size = 25
  const and: Prisma.OrderWhereInput[] = [adminWhere(tab), orderVisibility(scope)]
  if (q) {
    const id = Number(q.replace(/^#/, ''))
    and.push({ OR: [
      ...(Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? [{ id }] : []),
      { user: { email: { contains: q } } },
      { user: { name: { contains: q } } },
      { user: { phone: { contains: q } } },
      { customerName: { contains: q } },
      { customerPhone: { contains: q } },
      { lines: { some: { name: { contains: q } } } },
      { productDelivery: { is: { trackingCode: { contains: q } } } },
      { invoice: { is: { number: { contains: q } } } },
    ] })
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ''))) and.push({ productDelivery: { is: { scheduledDate: String(input.date) } } })
  const where = { AND: and }
  const [rows, total, counts] = await Promise.all([
    db.order.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * size, take: size,
      include: { ...LINE_INCLUDE, user: { select: { id: true, name: true, email: true, phone: true } }, productDelivery: { select: { status: true, scheduledDate: true, scheduledSlot: true, trackingCode: true } }, invoice: { select: { number: true, status: true } } },
    }),
    db.order.count({ where }),
    Promise.all(ADMIN_TABS.map((item) => db.order.count({ where: { AND: [adminWhere(item.key), orderVisibility(scope)] } }))),
  ])
  return {
    tab, q, page, pages: Math.max(1, Math.ceil(total / size)), total,
    counts: Object.fromEntries(ADMIN_TABS.map((item, index) => [item.key, counts[index]])) as Record<AdminTab, number>,
    orders: rows.map((order) => {
      const lines = orderLines(order)
      return {
        id: order.id, assigneeId: order.assigneeId, createdAt: order.createdAt, saleSource: order.saleSource, customer: { id: order.user?.id ?? null, name: order.customerName || order.user?.name || 'مشتری حضوری', email: order.user?.email || '', phone: order.customerPhone || order.user?.phone || '' },
        state: orderState(order), fulfilment: order.productDelivery?.status || '', schedule: order.productDelivery?.scheduledDate ? [jalaliDayLabel(order.productDelivery.scheduledDate), order.productDelivery.scheduledSlot].filter(Boolean).join(' · ') : '',
        trackingCode: order.productDelivery?.trackingCode || '', invoiceNumber: order.invoice?.number || '',
        total: minorToNumber(order.totalMinor, order.currency), currency: order.currency,
        items: lines.reduce((sum, line) => sum + line.quantity, 0), physical: lines.some((line) => line.kind === 'PHYSICAL'),
        preview: lines.slice(0, 4).map((line) => ({ name: line.name, image: line.image, quantity: line.quantity })),
      }
    }),
  }
}

function loadAdminOrder(orderId: number, scope?: OrderWorkScope) {
  return db.order.findFirst({
    where: { ...STORE_ORDER, id: orderId, ...orderVisibility(scope) },
    include: {
      ...LINE_INCLUDE,
      user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
      productDelivery: { select: { id: true, status: true, trackingCode: true, deliveryNote: true, deliveredAt: true, address: true, scheduledDate: true, scheduledSlot: true, digitalDelivery: true } },
      invoice: { select: { id: true, number: true, status: true, discountMinor: true, walletAppliedMinor: true } },
      events: { orderBy: { createdAt: 'asc' } },
      payments: { select: { id: true, provider: true, status: true, amountMinor: true, currency: true, createdAt: true }, orderBy: { id: 'asc' } },
      gateway: { select: { name: true } },
    },
  })
}

export async function adminOrder(orderId: number, scope?: OrderWorkScope) {
  const order = await loadAdminOrder(orderId, scope)
  if (!order) return null
  const [history, actors] = await Promise.all([
    db.order.aggregate({ where: { ...STORE_ORDER, ...(order.userId === null ? { id: order.id } : { userId: order.userId }), status: 'PAID' }, _count: { _all: true }, _sum: { totalMinor: true } }),
    db.user.findMany({ where: { id: { in: order.events.map((event) => event.actorId).filter((id): id is number => !!id) } }, select: { id: true, name: true, email: true } }),
  ])
  const view = orderDetailView(order)
  const deliveryTemplate = await orderDeliveryTemplate(order)
  return {
    deliveryTemplate,
    ...view,
    assigneeId: order.assigneeId,
    canWork: !scope || scope.manager || order.assigneeId === scope.actorId,
    manager: !scope || scope.manager,
    orderStatus: order.status,
    gateway: order.gateway?.name || order.provider,
    hasDigitalDelivery: Boolean(order.productDelivery?.digitalDelivery),
    saleSource: order.saleSource,
    customer: { ...order.user, id: order.user?.id ?? null, name: order.customerName || order.user?.name || 'مشتری حضوری', email: order.user?.email || '', phone: order.customerPhone || order.user?.phone || '', paidOrders: history._count._all, spent: minorToNumber(history._sum.totalMinor || 0n, order.currency) },
    payments: order.payments.map((payment) => ({ id: payment.id, provider: payment.provider, status: payment.status, amount: minorToNumber(payment.amountMinor, payment.currency), createdAt: payment.createdAt })),
    events: order.events.map((event) => ({ ...view.events.find((row) => row.id === event.id)!, actor: actors.find((actor) => actor.id === event.actorId)?.name || actors.find((actor) => actor.id === event.actorId)?.email || '' })),
  }
}

// ------------------------------------------------------------------ what the buyer gave

/** The answers of one order line in full, for the member of staff doing the order. The route records who looked. */
export async function revealOrderInputs(orderId: number, lineId: number, scope?: OrderWorkScope) {
  return db.$transaction(async tx => {
  await lockOrderWork(tx, orderId, scope)
  const line = await tx.orderLine.findFirst({ where: { id: lineId, orderId, order: STORE_ORDER }, select: { inputs: true } })
  if (!line) throw new StoreError('این ردیف در سفارش نیست', 404, 'LINE_NOT_FOUND')
  return openAnswers(line.inputs).map((answer) => ({ key: answer.key, label: answer.label, value: answer.value, secret: answer.kind === 'secret' }))
  })
}

/** Wipes the buyer's answers from an order (one line, or all of them) once the work is done. */
export async function eraseOrderInputs(input: { orderId: number; lineId?: number | null; actorId: number | null }) {
  const erased = await db.$transaction(async (tx) => {
    const done = await tx.orderLine.updateMany({ where: { orderId: input.orderId, order: STORE_ORDER, inputs: { not: '' }, ...(input.lineId ? { id: input.lineId } : {}) }, data: { inputs: '', inputsErasedAt: new Date() } })
    if (done.count) await tx.orderEvent.create({ data: { orderId: input.orderId, status: 'INPUTS_ERASED', note: 'اطلاعاتی که خریدار برای انجام سفارش داده بود پاک شد', visible: false, actorId: input.actorId } })
    return done.count
  })
  if (!erased) throw new StoreError('اطلاعاتی برای پاک‌کردن نمانده است', 409, 'NOTHING_TO_ERASE')
  return erased
}

export const ORDER_INPUT_KEEP_DAYS = 7

/**
 * A login a customer handed over is not kept longer than the work needs: this many days after the order was
 * delivered, cancelled or returned — or after an order that was never paid — the answers are wiped by themselves.
 */
export async function eraseFinishedOrderInputs(limit = 200, now = new Date()) {
  const before = new Date(now.getTime() - ORDER_INPUT_KEEP_DAYS * 86_400_000)
  const lines = await db.orderLine.findMany({
    where: { inputs: { not: '' }, order: { OR: [
      { productDelivery: { is: { status: { in: ['DELIVERED', 'CANCELLED', 'RETURNED'] }, updatedAt: { lt: before } } } },
      { status: { notIn: ['PAID', 'PENDING'] }, createdAt: { lt: before } },
    ] } },
    select: { id: true }, take: limit, orderBy: { id: 'asc' },
  })
  if (!lines.length) return 0
  const done = await db.orderLine.updateMany({ where: { id: { in: lines.map((line) => line.id) }, inputs: { not: '' } }, data: { inputs: '', inputsErasedAt: now } })
  return done.count
}

const plain = (value: unknown, max: number) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max)

/** Moves a paid order along the fulfilment workflow, with timeline entry and customer notice. */
export async function transitionOrder(input: {
  orderId: number; to: string; actorId: number | null
  trackingCode?: unknown; note?: unknown; digitalDelivery?: unknown; notify?: boolean; restock?: boolean
  scope?: OrderWorkScope
  beforeWrite?: (tx: Prisma.TransactionClient) => Promise<void>
  commit?: (tx: Prisma.TransactionClient, result: { status: string; trackingCode: string }) => Promise<void>
}, transaction?: Prisma.TransactionClient) {
  const client = transaction || db
  const delivery = await client.productDelivery.findUnique({ where: { orderId: input.orderId }, include: { order: { select: { userId: true, status: true, product: { select: { kind: true } }, lines: { select: { kind: true } } } } } })
  if (!delivery || delivery.order.status !== 'PAID') throw new StoreError('سفارش پرداخت‌شده پیدا نشد', 404, 'ORDER_NOT_FOUND')
  const to = String(input.to) as FulfilmentStatus
  if (!isFulfilmentStatus(to) || !canMoveTo(delivery.status, to)) throw new StoreError(`تغییر وضعیت از «${FULFILMENT_LABEL[delivery.status as FulfilmentStatus] || delivery.status}» به این وضعیت مجاز نیست`, 409, 'BAD_TRANSITION')
  const trackingCode = input.trackingCode === undefined ? delivery.trackingCode : plain(input.trackingCode, 120)
  const note = plain(input.note, 1000)
  const secret = typeof input.digitalDelivery === 'string' ? input.digitalDelivery.trim() : ''
  if (secret.length > 60_000) throw new StoreError('اطلاعات تحویل دیجیتال بیش از حد طولانی است')
  const virtual = delivery.order.lines.length ? delivery.order.lines.every((line) => line.kind !== 'PHYSICAL') : delivery.order.product?.kind !== 'PHYSICAL'
  if (secret && !virtual) throw new StoreError('اطلاعات تحویل دیجیتال فقط برای سفارش‌های مجازی است')
  const encrypted = secret ? encryptDigitalDelivery(secret) : undefined
  const write = async (tx: Prisma.TransactionClient) => {
    await input.beforeWrite?.(tx)
    await lockOrderWork(tx, input.orderId, input.scope)
    if((to==='DELIVERED'||to==='SHIPPED')&&await tx.storePickup.findFirst({where:{orderId:input.orderId,status:{not:'COLLECTED'}},select:{orderId:true}}))throw new StoreError('این سفارش فقط با کد تحویل مشتری از صف تحویل حضوری بسته می‌شود',409)
    const changed = await tx.productDelivery.updateMany({
      where: { id: delivery.id, status: delivery.status },
      data: { status: to, trackingCode, ...(note ? { deliveryNote: note } : {}), ...(encrypted ? { digitalDelivery: encrypted } : {}), deliveredAt: to === 'DELIVERED' ? new Date() : to === 'RETURNED' ? delivery.deliveredAt : null },
    })
    if (changed.count !== 1) throw new StoreError('وضعیت سفارش هم‌زمان تغییر کرد؛ صفحه را تازه کنید', 409, 'CONFLICT')
    await tx.orderEvent.create({ data: { orderId: input.orderId, status: to, note: note || (to === 'SHIPPED' && trackingCode ? `کد رهگیری مرسوله: ${trackingCode}` : ''), actorId: input.actorId } })
    await input.commit?.(tx, { status: to, trackingCode })
  }
  if (transaction) await write(transaction)
  else await db.$transaction(write, input.beforeWrite ? { isolationLevel: 'Serializable' } : undefined)
  if ((to === 'CANCELLED' || to === 'RETURNED') && input.restock) {
    await restockConsumedInventory(input.orderId, null, transaction)
    const lines = await client.orderLine.findMany({ where: { orderId: input.orderId, productId: { not: null } }, select: { productId: true, quantity: true } })
    for (const line of lines) await client.product.updateMany({ where: { id: line.productId!, soldCount: { gte: line.quantity } }, data: { soldCount: { decrement: line.quantity } } })
    await client.orderEvent.create({ data: { orderId: input.orderId, status: 'RESTOCK', note: 'موجودی کالاها به انبار برگشت', visible: false, actorId: input.actorId } })
  }
  if (input.notify !== false && delivery.order.userId !== null) {
    await createInboxEvent({
      userId: delivery.order.userId, kind: to === 'DELIVERED' ? 'PRODUCT_DELIVERED' : 'ORDER_STATUS', dedupeKey: `store-order:${input.orderId}:${to}`,
      titleEn: `Order #${input.orderId}: ${to.toLowerCase()}`, titleFa: `سفارش ${input.orderId.toLocaleString('fa-IR')}: ${FULFILMENT_LABEL[to]}`,
      bodyEn: trackingCode && to === 'SHIPPED' ? `Tracking code: ${trackingCode}` : 'Open your orders for details.',
      bodyFa: trackingCode && to === 'SHIPPED' ? `کد رهگیری: ${trackingCode}` : 'جزئیات را در بخش سفارش‌های من ببینید.',
      href: `/dashboard/orders/${input.orderId}`,
    }, transaction).catch((error) => { if (transaction) throw error })
  }
  return { status: to, trackingCode }
}

/** Internal note (staff only) or a message shown to the customer on the order timeline. */
export async function addOrderNote(input: { orderId: number; note: unknown; visible: boolean; actorId: number; scope?: OrderWorkScope; beforeWrite?: (tx: Prisma.TransactionClient) => Promise<void>; commit?: (tx: Prisma.TransactionClient, result: { id: number }) => Promise<void> }) {
  const note = plain(input.note, 1000)
  if (note.length < 2) throw new StoreError('متن یادداشت را بنویسید')
  const order = await db.order.findFirst({ where: { ...STORE_ORDER, id: input.orderId }, select: { id: true, userId: true } })
  if (!order) throw new StoreError('سفارش پیدا نشد', 404, 'ORDER_NOT_FOUND')
  const event = await db.$transaction(async tx => {
    await input.beforeWrite?.(tx)
    await lockOrderWork(tx, input.orderId, input.scope)
    const created = await tx.orderEvent.create({ data: { orderId: order.id, status: 'NOTE', note, visible: input.visible, actorId: input.actorId } })
    await input.commit?.(tx, created)
    return created
  }, input.beforeWrite ? { isolationLevel: 'Serializable' } : undefined)
  if (input.visible && order.userId !== null) await createInboxEvent({
    userId: order.userId, kind: 'ORDER_STATUS', dedupeKey: `store-order:${order.id}:note:${event.id}`,
    titleEn: `Message about order #${order.id}`, titleFa: `پیام دربارهٔ سفارش ${order.id.toLocaleString('fa-IR')}`,
    bodyEn: note.slice(0, 200), bodyFa: note.slice(0, 200), href: `/dashboard/orders/${order.id}`,
  }).catch(() => {})
  return event
}

/** The customer's non-store orders (service plans, VIP) for the same page. */
export async function customerServiceOrders(userId: number) {
  const rows = await db.order.findMany({
    where: { userId, productId: null }, orderBy: { createdAt: 'desc' }, take: 30,
    select: { id: true, status: true, totalMinor: true, currency: true, createdAt: true, meta: true, plan: { select: { name: true } }, invoice: { select: { number: true } } },
  })
  return rows.map((row) => {
    const meta = parseMeta(row.meta)
    const named = invoiceSubject({ kind: 'BILLING', planName: row.plan?.name, meta, siteName: '', amountText: '' })
    return { id: row.id, status: row.status, total: minorToNumber(row.totalMinor, row.currency), currency: row.currency, createdAt: row.createdAt, detail: named.detail, title: (named.title !== 'فاکتور' && named.title) || row.plan?.name || String(meta.planName || (meta.kind === 'membership' ? 'اشتراک VIP' : 'سفارش')), invoiceNumber: row.invoice?.number || '' }
  })
}
