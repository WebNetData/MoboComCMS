import { db } from '@/platform/database/prisma'
import { assertOrderDispatchReady } from '@/modules/store/server/packing'
import { logEvent } from '@/platform/observability/logger'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { minorToNumber, normalizeCurrency } from '@/shared/money'
import { canMoveTo } from '@/modules/store/domain/store'
import { transitionOrder } from '@/modules/store/server/orders'
import { ShippingError } from '@/modules/shipping/domain/shipping'
import {
  SHIPMENT_LABEL, cleanTrackingCode, etaLabel, isShipmentStatus, nextShipmentStatuses, normalizeCarrierSettings, parcelWeight, quotes,
  rialToMinor, trackingLink, waybillNumber, type CarrierSettings, type Quote, type ShipmentStatus,
} from '@/modules/shipping/domain/carriers'

// Carrier rates at checkout, waybills (shipments) for staff, and public tracking.

const KEY = 'shipping.carriers.v1'
const EVENT_LABEL: Record<string, string> = { CODE: 'ثبت کد رهگیری شرکت حمل', NOTE: 'به‌روزرسانی' }

export async function getCarrierSettings(): Promise<CarrierSettings> {
  return normalizeCarrierSettings(await readJsonSetting(KEY).catch(() => undefined) ?? { carriers: undefined })
}

export async function saveCarrierSettings(input: unknown) {
  const settings = normalizeCarrierSettings(input)
  await writeJsonSetting(KEY, settings)
  return settings
}

const parse = (raw: string | null | undefined): Record<string, unknown> => { try { const value = JSON.parse(raw || '{}'); return value && typeof value === 'object' ? value : {} } catch { return {} } }
const str = (value: unknown) => (typeof value === 'string' ? value : '')

export type LineWeight = { productId: number | null; quantity: number }

/** Parcel weight of physical lines (product weights, default for unknown, plus packaging). */
export async function linesWeight(lines: LineWeight[], settings: CarrierSettings) {
  const ids = [...new Set(lines.map((line) => line.productId).filter((id): id is number => !!id))]
  const products = ids.length ? await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, weightGrams: true, kind: true } }) : []
  const physical = lines.filter((line) => products.find((product) => product.id === line.productId)?.kind === 'PHYSICAL')
  return parcelWeight(physical.map((line) => ({ quantity: line.quantity, weightGrams: products.find((product) => product.id === line.productId)?.weightGrams || 0 })), settings)
}

export type PriceQuote = Extract<Quote, { ok: true }> & { feeMinor: bigint; fee: number; eta: string }

/** Priced carrier options for an address, in the order currency. */
export async function quoteOptions(input: { lines: LineWeight[]; dest: { province: string; city: string }; itemMinor: bigint; currency: string; memberFree?: boolean }) {
  const settings = await getCarrierSettings()
  const currency = normalizeCurrency(input.currency, 'IRT')
  const weightGrams = await linesWeight(input.lines, settings)
  const toRial = currency === 'IRR' ? 1n : currency === 'IRT' || currency === 'TMN' ? 10n : 0n
  const itemRial = Number(input.itemMinor * toRial)
  const list = quotes(settings, { dest: input.dest, weightGrams, itemRial })
  const options = list.map((item) => {
    if (!item.ok) return item
    const feeMinor = input.memberFree ? 0n : rialToMinor(item.feeRial, currency) ?? 0n
    return { ...item, feeMinor, fee: minorToNumber(feeMinor, currency), eta: etaLabel(item.etaMin, item.etaMax) }
  })
  return { enabled: settings.enabled, weightGrams, options }
}

/**
 * The carrier chosen at checkout (or the cheapest one when none was sent),
 * re-priced on the server. Throws a customer-facing ShippingError.
 */
export async function checkoutCarrier(input: { carrierId?: unknown; lines: LineWeight[]; dest: { province: string; city: string }; itemMinor: bigint; currency: string; memberFree?: boolean }): Promise<(PriceQuote & { weightGrams: number }) | null> {
  const priced = await quoteOptions(input)
  if (!priced.enabled) return null
  const available = priced.options.filter((item): item is PriceQuote => item.ok)
  if (!available.length) throw new ShippingError('برای این آدرس روش ارسالی در دسترس نیست؛ آدرس دیگری انتخاب کنید یا با پشتیبانی تماس بگیرید', 409, 'NO_CARRIER')
  const wanted = String(input.carrierId || '')
  const chosen = wanted ? available.find((item) => item.carrierId === wanted) : available[0]
  if (!chosen) throw new ShippingError('روش ارسال انتخاب‌شده برای این آدرس در دسترس نیست؛ دوباره انتخاب کنید', 409, 'CARRIER_UNAVAILABLE')
  return { ...chosen, weightGrams: priced.weightGrams }
}

// ------------------------------------------------------------------ shipments (waybills)

function shipmentView(row: { id: number; orderId: number; waybill: string; carrier: string; carrierName: string; trackingCode: string; status: string; weightGrams: number; parcels: number; feeMinor: bigint; costMinor: bigint; currency: string; sender: string; receiver: string; note: string; shippedAt: Date | null; deliveredAt: Date | null; createdAt: Date; events?: { id: number; status: string; note: string; location: string; createdAt: Date }[] }, settings: CarrierSettings) {
  const carrier = settings.carriers.find((item) => item.id === row.carrier)
  const currency = normalizeCurrency(row.currency, 'IRT')
  return {
    id: row.id, orderId: row.orderId, waybill: row.waybill, carrier: row.carrier, carrierName: row.carrierName || carrier?.name || row.carrier,
    trackingCode: row.trackingCode, trackingUrl: trackingLink(carrier?.trackingUrl || '', row.trackingCode),
    status: row.status, statusLabel: SHIPMENT_LABEL[row.status as ShipmentStatus] || row.status, next: nextShipmentStatuses(row.status),
    weightGrams: row.weightGrams, parcels: row.parcels, fee: minorToNumber(row.feeMinor, currency), cost: minorToNumber(row.costMinor, currency), currency,
    sender: parse(row.sender), receiver: parse(row.receiver), note: row.note, shippedAt: row.shippedAt, deliveredAt: row.deliveredAt, createdAt: row.createdAt,
    events: (row.events || []).map((event) => ({ id: event.id, status: event.status, label: EVENT_LABEL[event.status] || SHIPMENT_LABEL[event.status as ShipmentStatus] || event.status, note: event.note, location: event.location, createdAt: event.createdAt })),
  }
}
export type ShipmentView = ReturnType<typeof shipmentView>

async function senderProfile(settings: CarrierSettings) {
  const [profile, site] = await Promise.all([readJsonSetting('billing.invoice-profile.v1').catch(() => undefined), db.setting.findUnique({ where: { key: 'brandName' } }).catch(() => null)])
  const raw = (profile || {}) as Record<string, unknown>
  return {
    name: str(raw.sellerName) || site?.value || 'فروشگاه', phone: str(raw.phone), province: str(raw.province) || settings.originProvince,
    city: str(raw.city) || settings.originCity, address: str(raw.address), postalCode: str(raw.postalCode),
  }
}

/** Staff issue a waybill for a paid physical order (one per order). */
export async function createShipment(input: { orderId: number; carrier?: unknown; trackingCode?: unknown; weightGrams?: unknown; parcels?: unknown; costRial?: unknown; note?: unknown; actorId: number }) {
  const order = await db.order.findFirst({
    where: { id: input.orderId, productId: { not: null } },
    include: { lines: { select: { productId: true, quantity: true, kind: true } }, productDelivery: { select: { status: true, address: true } }, shipment: { select: { id: true } } },
  })
  if (!order || order.status !== 'PAID') throw new ShippingError('سفارش پرداخت‌شده پیدا نشد', 404, 'ORDER_NOT_FOUND')
  if (order.shipment) throw new ShippingError('برای این سفارش قبلاً بارنامه صادر شده است', 409, 'SHIPMENT_EXISTS')
  if (!order.lines.some((line) => line.kind === 'PHYSICAL')) throw new ShippingError('این سفارش کالای فیزیکی ندارد', 409, 'NOT_PHYSICAL')
  if (['CANCELLED', 'RETURNED', 'DELIVERED'].includes(order.productDelivery?.status || '')) throw new ShippingError('این سفارش بسته شده است', 409, 'ORDER_CLOSED')

  const settings = await getCarrierSettings()
  const meta = parse(order.meta)
  const shipping = (meta.shipping && typeof meta.shipping === 'object' ? meta.shipping : {}) as Record<string, unknown>
  const carrierId = String(input.carrier || shipping.carrierId || settings.carriers.find((item) => item.enabled)?.id || '')
  const carrier = settings.carriers.find((item) => item.id === carrierId)
  if (!carrier) throw new ShippingError('شرکت حمل را انتخاب کنید')
  const address = order.productDelivery?.address ? parse(order.productDelivery.address) : parse(JSON.stringify(meta.shippingAddress || {}))
  const receiver = { name: str(address.recipient), phone: str(address.phone), province: str(address.province), city: str(address.city), address: str(address.address), postalCode: str(address.postalCode) }
  const weight = Math.round(Number(input.weightGrams)) > 0 ? Math.min(1_000_000, Math.round(Number(input.weightGrams))) : Number(shipping.weightGrams) || await linesWeight(order.lines, settings)
  const parcels = Math.max(1, Math.min(50, Math.round(Number(input.parcels)) || 1))
  const currency = normalizeCurrency(order.currency, 'IRT')
  const cost = Math.round(Number(input.costRial)) > 0 ? rialToMinor(Math.round(Number(input.costRial)), currency) ?? 0n : 0n
  let feeMinor = 0n
  try { feeMinor = BigInt(String(meta.shippingMinor ?? '0')) } catch { feeMinor = 0n }
  const trackingCode = cleanTrackingCode(input.trackingCode)
  const note = String(input.note ?? '').replace(/[<>]/g, '').trim().slice(0, 500)
  const sender = await senderProfile(settings)

  const shipment = await db.$transaction(async (tx) => {
    await assertOrderDispatchReady(tx, order.id)
    const current = await tx.order.findUnique({ where: { id: order.id }, select: { status: true, productDelivery: { select: { status: true, address: true } } } })
    if (current?.status !== 'PAID' || !['PENDING', 'PROCESSING', 'PACKED'].includes(current.productDelivery?.status || '') || current.productDelivery?.address !== order.productDelivery?.address) throw new ShippingError('اطلاعات تحویل هم‌زمان تغییر کرده است؛ سفارش را تازه کنید', 409, 'CONFLICT')
    const created = await tx.shipment.create({ data: {
      orderId: order.id, waybill: `tmp-${order.id}-${Date.now()}`, carrier: carrier.id, carrierName: carrier.name, trackingCode, weightGrams: weight, parcels,
      feeMinor, costMinor: cost, currency, sender: JSON.stringify(sender), receiver: JSON.stringify(receiver), note, createdBy: input.actorId,
    } })
    const waybill = waybillNumber(created.id, created.createdAt)
    await tx.shipmentEvent.create({ data: { shipmentId: created.id, status: 'READY', note: `بارنامه ${waybill} با ${carrier.name} صادر شد`, actorId: input.actorId } })
    return tx.shipment.update({ where: { id: created.id }, data: { waybill } })
  })
  // The order moves to "packed"; the carrier's tracking code is copied for the existing order views.
  const fulfilment = order.productDelivery?.status || 'PENDING'
  if (canMoveTo(fulfilment, 'PACKED')) await transitionOrder({ orderId: order.id, to: 'PACKED', actorId: input.actorId, trackingCode: trackingCode || shipment.waybill, note: `بارنامه ${shipment.waybill} — ${carrier.name}`, notify: false }).catch((error) => logEvent('warn', 'shipment.transition_failed', { orderId: order.id, error: String(error) }))
  logEvent('info', 'shipment.created', { shipmentId: shipment.id, orderId: order.id, carrier: carrier.id })
  return shipment
}

/** Carrier tracking code, journey step, or cancellation; the order status follows. */
export async function updateShipment(input: { id: number; status?: unknown; trackingCode?: unknown; note?: unknown; location?: unknown; costRial?: unknown; actorId: number }) {
  const shipment = await db.shipment.findUnique({ where: { id: input.id }, include: { order: { select: { id: true, userId: true, currency: true, productDelivery: { select: { status: true } } } } } })
  if (!shipment) throw new ShippingError('بارنامه پیدا نشد', 404)
  const note = String(input.note ?? '').replace(/[<>]/g, '').trim().slice(0, 500)
  const location = String(input.location ?? '').replace(/[<>]/g, '').trim().slice(0, 80)
  const data: Record<string, unknown> = {}
  const codeChanged = input.trackingCode !== undefined && cleanTrackingCode(input.trackingCode) !== shipment.trackingCode
  if (codeChanged) data.trackingCode = cleanTrackingCode(input.trackingCode)
  if (input.costRial !== undefined && String(input.costRial).trim() !== '') data.costMinor = rialToMinor(Math.max(0, Math.round(Number(input.costRial)) || 0), normalizeCurrency(shipment.currency, 'IRT')) ?? 0n
  let status: ShipmentStatus | null = null
  if (input.status !== undefined && input.status !== shipment.status) {
    if (!isShipmentStatus(input.status) || !nextShipmentStatuses(shipment.status).includes(input.status)) throw new ShippingError('این تغییر وضعیت مجاز نیست', 409, 'BAD_TRANSITION')
    status = input.status
    data.status = status
    if (status === 'PICKED_UP') data.shippedAt = new Date()
    if (status === 'DELIVERED') data.deliveredAt = new Date()
  }
  if (!Object.keys(data).length && !note) return shipment
  const code = (data.trackingCode as string | undefined) ?? shipment.trackingCode
  const orderTarget = status === 'PICKED_UP' || status === 'IN_TRANSIT' || status === 'OUT_FOR_DELIVERY' ? 'SHIPPED' : status === 'DELIVERED' ? 'DELIVERED' : ''
  await db.$transaction(async tx => {
    if (orderTarget) await assertOrderDispatchReady(tx, shipment.orderId)
    const current = await tx.productDelivery.findUnique({ where: { orderId: shipment.orderId }, include: { order: { select: { status: true } } } })
    if (orderTarget && (!current || current.order.status !== 'PAID' || (current.status !== orderTarget && !canMoveTo(current.status, orderTarget)))) throw new ShippingError('سفارش در وضعیت قابل ارسال یا تحویل نیست', 409, 'CONFLICT')
    const changed = await tx.shipment.updateMany({ where: { id: shipment.id, status: shipment.status }, data })
    if (changed.count !== 1) throw new ShippingError('وضعیت بارنامه هم‌زمان تغییر کرد؛ صفحه را تازه کنید', 409, 'CONFLICT')
    if (status || codeChanged || note) await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: status || (codeChanged ? 'CODE' : 'NOTE'), note: note || (codeChanged ? `کد رهگیری ${shipment.carrierName}: ${code}` : ''), location, actorId: input.actorId } })
    if (orderTarget && current && current.status !== orderTarget) {
      await transitionOrder({ orderId: shipment.orderId, to: orderTarget, actorId: input.actorId, trackingCode: code || shipment.waybill, note: orderTarget === 'SHIPPED' ? `تحویل ${shipment.carrierName} شد — کد رهگیری ${code || shipment.waybill}` : '' }, tx)
    } else if (codeChanged && code) {
      await tx.productDelivery.updateMany({ where: { orderId: shipment.orderId, status: current?.status }, data: { trackingCode: code } })
      if (shipment.order.userId !== null) await createInboxEvent({
      userId: shipment.order.userId, kind: 'ORDER_STATUS', dedupeKey: `shipment:${shipment.id}:code:${code}`,
      titleEn: `Tracking code for order #${shipment.orderId}`, titleFa: `کد رهگیری سفارش ${shipment.orderId.toLocaleString('fa-IR')}`,
      bodyEn: `${shipment.carrierName}: ${code}`, bodyFa: `${shipment.carrierName}: ${code}`, href: `/dashboard/orders/${shipment.orderId}`,
      }, tx)
    }
  })
  return db.shipment.findUniqueOrThrow({ where: { id: shipment.id } })
}

export async function adminShipment(id: number) {
  const [row, settings] = await Promise.all([db.shipment.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: 'asc' } } } }), getCarrierSettings()])
  return row ? shipmentView(row, settings) : null
}

export async function orderShipment(orderId: number) {
  const [row, settings] = await Promise.all([db.shipment.findUnique({ where: { orderId }, include: { events: { orderBy: { createdAt: 'asc' } } } }), getCarrierSettings()])
  return row ? shipmentView(row, settings) : null
}

export async function adminShipments(input: { status?: string; carrier?: string; q?: string; page?: number }) {
  const page = Math.max(1, Math.min(1000, Math.floor(Number(input.page) || 1)))
  const q = String(input.q || '').trim().slice(0, 60)
  const id = Number(q.replace(/^#/, ''))
  const where = {
    ...(input.status && isShipmentStatus(input.status) ? { status: input.status } : input.status === 'open' ? { status: { in: ['READY', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] } } : {}),
    ...(input.carrier ? { carrier: input.carrier } : {}),
    ...(q ? { OR: [{ waybill: { contains: q.toUpperCase() } }, { trackingCode: { contains: q } }, ...(Number.isSafeInteger(id) && id > 0 ? [{ orderId: id }] : [])] } : {}),
  }
  const [rows, total, settings, counts] = await Promise.all([
    db.shipment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 30, take: 30 }),
    db.shipment.count({ where }),
    getCarrierSettings(),
    db.shipment.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  return {
    page, pages: Math.max(1, Math.ceil(total / 30)), total,
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
    carriers: settings.carriers.map((carrier) => ({ id: carrier.id, name: carrier.name })),
    rows: rows.map((row) => shipmentView(row, settings)),
  }
}

/** Waybills for label printing (staff). */
export async function shipmentsForLabels(ids: number[]) {
  const [rows, settings] = await Promise.all([db.shipment.findMany({ where: { id: { in: ids.slice(0, 100) } }, orderBy: { id: 'asc' } }), getCarrierSettings()])
  return rows.map((row) => shipmentView(row, settings))
}

/**
 * Public tracking by our waybill or the carrier code: the journey without
 * personal details (city only, no name, phone or street).
 */
export async function publicTracking(raw: unknown) {
  const code = cleanTrackingCode(raw).toUpperCase()
  if (code.length < 6) return null
  const row = await db.shipment.findFirst({ where: { OR: [{ waybill: code }, { trackingCode: cleanTrackingCode(raw) }] }, include: { events: { orderBy: { createdAt: 'asc' } } } })
  if (!row) return null
  const view = shipmentView(row, await getCarrierSettings())
  return {
    waybill: view.waybill, carrierName: view.carrierName, trackingCode: view.trackingCode, trackingUrl: view.trackingUrl, status: view.status, statusLabel: view.statusLabel,
    to: str(view.receiver.city), from: str(view.sender.city), createdAt: view.createdAt, shippedAt: view.shippedAt, deliveredAt: view.deliveredAt,
    events: view.events.map(({ id, status, label, note, location, createdAt }) => ({ id, status, label, note, location, createdAt })),
  }
}
