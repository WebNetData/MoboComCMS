import type { OrderDeliveryChange, Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { StoreError } from '@/modules/store/domain/store'
import { assertFeeAcknowledged, cleanDeliveryAddress, decodeAddress, encodeAddress } from '@/modules/store/domain/delivery-changes'
import { lockOrderDispatch } from '@/modules/store/server/packing'
import { orderVisibility, type OrderWorkScope } from '@/modules/store/server/order-work'
import { checkoutCarrier } from '@/modules/shipping/server/carriers'
import { getDeliverySettings } from '@/modules/shipping/server/shipping'
import { shippingFeeMinor } from '@/modules/shipping/domain/shipping'

type Tx = Prisma.TransactionClient
type Audit = (tx: Tx, changeId: number) => Promise<unknown>
const OPEN_STATES = ['PENDING', 'PROCESSING', 'PACKED']
const parse = (value: string) => { try { return JSON.parse(value || '{}') as Record<string, unknown> } catch { return {} } }
const view = (row: OrderDeliveryChange) => ({ id: row.id, orderId: row.orderId, status: row.status, oldAddress: decodeAddress(row.oldAddress), newAddress: decodeAddress(row.newAddress), fromFeeMinor: row.fromFeeMinor.toString(), newFeeMinor: row.newFeeMinor.toString(), currency: row.currency, reason: row.reason, reviewNote: row.reviewNote, originalDeliveryUpdatedAt: row.originalDeliveryUpdatedAt.toISOString(), requestedAt: row.requestedAt.toISOString(), updatedAt: row.updatedAt.toISOString(), decidedAt: row.decidedAt?.toISOString() || null })

async function quote(order: { lines: { productId: number | null; quantity: number; kind: string }[]; totalMinor: bigint; currency: string; meta: string }, address: ReturnType<typeof cleanDeliveryAddress>) {
  const meta = parse(order.meta)
  const oldShipping = BigInt(String(meta.shippingMinor || '0'))
  const itemMinor = order.totalMinor > oldShipping ? order.totalMinor - oldShipping : 0n
  const lines = order.lines.filter(line => line.kind === 'PHYSICAL').map(({ productId, quantity }) => ({ productId, quantity }))
  const carrierId = String((meta.shipping as Record<string, unknown> | undefined)?.carrierId || '')
  const priced = await checkoutCarrier({ carrierId, lines, dest: address, itemMinor, currency: order.currency })
  if (priced) return priced.feeMinor
  return shippingFeeMinor(await getDeliverySettings(), order.currency, itemMinor)
}

async function current(tx: Tx, id: number, userId: number, scope?: OrderWorkScope) {
  const order = await tx.order.findFirst({ where: { id, userId, status: 'PAID', ...orderVisibility(scope), productDelivery: { is: { status: { in: OPEN_STATES } } }, pickup: { is: null }, shipment: { is: null }, lines: { some: { kind: 'PHYSICAL' } } }, select: { id: true, userId: true, status: true, totalMinor: true, currency: true, meta: true, lines: { select: { productId: true, quantity: true, kind: true } }, productDelivery: { select: { address: true, updatedAt: true } }, deliveryChanges: { where: { status: 'REQUESTED' }, select: { id: true }, take: 1 } } })
  if (!order) throw new StoreError('این سفارش برای تغییر آدرس ارسال در دسترس نیست', 409, 'ORDER_NOT_ELIGIBLE')
  if (order.deliveryChanges.length) throw new StoreError('یک درخواست تغییر آدرس هنوز تعیین تکلیف نشده است', 409, 'DELIVERY_CHANGE_PENDING')
  return order
}

export async function customerDeliveryChanges(orderId: number, userId: number) {
  const order = await db.order.findFirst({ where: { id: orderId, userId }, select: { id: true, status: true, saleSource: true, lines: { select: { kind: true } }, productDelivery: { select: { status: true } }, pickup: { select: { orderId: true } }, shipment: { select: { id: true } }, deliveryChanges: { orderBy: { requestedAt: 'desc' }, take: 20 } } })
  if (!order) return null
  return { eligible: order.status === 'PAID' && order.lines.some(line => line.kind === 'PHYSICAL') && OPEN_STATES.includes(order.productDelivery?.status || '') && !order.pickup && !order.shipment, changes: order.deliveryChanges.map(row => view(row)) }
}

export async function requestDeliveryChange(input: { orderId: number; userId: number; addressId: number; reason?: unknown }) {
  return db.$transaction(async tx => {
    await lockOrderDispatch(tx, input.orderId)
    const order = await current(tx, input.orderId, input.userId)
    const saved = await tx.userAddress.findFirst({ where: { id: input.addressId, userId: input.userId } })
    if (!saved) throw new StoreError('آدرس ذخیره‌شده پیدا نشد', 404, 'ADDRESS_NOT_FOUND')
    const address = cleanDeliveryAddress(saved)
    const oldAddress = parse(order.productDelivery?.address || '{}')
    const newFee = await quote(order, address)
    const meta = parse(order.meta), fromFee = BigInt(String(meta.shippingMinor || '0'))
    const reason = String(input.reason ?? '').replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, 500)
    const created = await tx.orderDeliveryChange.create({ data: { orderId: order.id, openOrderKey: order.id, oldAddress: JSON.stringify(oldAddress), newAddress: encodeAddress(address), originalDeliveryUpdatedAt: order.productDelivery!.updatedAt, fromFeeMinor: fromFee, newFeeMinor: newFee, currency: order.currency, reason, requestedById: input.userId } })
    await tx.orderEvent.create({ data: { orderId: order.id, status: 'DELIVERY_CHANGE_REQUESTED', visible: true, actorId: input.userId, note: 'درخواست تغییر نشانی ارسال ثبت شد' } })
    return view(created)
  })
}

export async function adminDeliveryChanges(orderId: number, scope: OrderWorkScope) {
  const order = await db.order.findFirst({ where: { id: orderId, productId: { not: null }, ...orderVisibility(scope) }, select: { id: true, deliveryChanges: { orderBy: { requestedAt: 'desc' }, take: 20 } } })
  return order ? { changes: order.deliveryChanges.map(row => view(row)), manager: scope.manager } : null
}

export async function decideDeliveryChange(input: { orderId: number; changeId: number; expectedChangeUpdatedAt: string; action: 'approve' | 'reject'; acknowledgeFeeDifference?: unknown; note?: unknown; actorId: number; scope: OrderWorkScope; authorize: (tx: Tx) => Promise<void>; audit: Audit }) {
  return db.$transaction(async tx => {
    await lockOrderDispatch(tx, input.orderId)
    await input.authorize(tx)
    const order = await tx.order.findFirst({ where: { id: input.orderId, productId: { not: null }, ...orderVisibility(input.scope) }, select: { id: true, userId: true, status: true, totalMinor: true, currency: true, meta: true, lines: { select: { productId: true, quantity: true, kind: true } }, productDelivery: { select: { address: true, status: true, updatedAt: true } }, pickup: { select: { orderId: true } }, shipment: { select: { id: true } } } })
    const change = await tx.orderDeliveryChange.findFirst({ where: { id: input.changeId, orderId: input.orderId, status: 'REQUESTED' } })
    if (!order || !change) throw new StoreError('درخواست باز پیدا نشد', 404, 'CHANGE_NOT_FOUND')
    if (change.updatedAt.toISOString() !== input.expectedChangeUpdatedAt) throw new StoreError('درخواست هم‌زمان تغییر کرده است؛ صفحه را تازه کنید', 409, 'STALE_CHANGE')
    if (input.action === 'approve') {
      if (order.status !== 'PAID' || !OPEN_STATES.includes(order.productDelivery?.status || '') || order.pickup || order.shipment || !order.productDelivery || order.productDelivery.updatedAt.getTime() !== change.originalDeliveryUpdatedAt.getTime() || order.productDelivery.address !== change.oldAddress) throw new StoreError('نشانی یا وضعیت ارسال پس از ثبت درخواست تغییر کرده است', 409, 'STALE_DELIVERY')
      const address = decodeAddress(change.newAddress)
      const latestFee = await quote(order, address)
      if (latestFee !== change.newFeeMinor) throw new StoreError('هزینه ارسال از زمان درخواست تغییر کرده است؛ درخواست تازه‌ای لازم است', 409, 'STALE_QUOTE')
      assertFeeAcknowledged(change.fromFeeMinor, change.newFeeMinor, input.acknowledgeFeeDifference)
      const updated = await tx.productDelivery.updateMany({ where: { orderId: order.id, updatedAt: change.originalDeliveryUpdatedAt, address: change.oldAddress, status: { in: OPEN_STATES } }, data: { address: change.newAddress } })
      if (updated.count !== 1) throw new StoreError('نشانی ارسال هم‌زمان تغییر کرده است', 409, 'STALE_DELIVERY')
    }
    const changed = await tx.orderDeliveryChange.updateMany({ where: { id: change.id, status: 'REQUESTED', updatedAt: change.updatedAt }, data: { status: input.action === 'approve' ? 'APPROVED' : 'REJECTED', openOrderKey: null, decidedById: input.actorId, decidedAt: new Date(), reviewNote: String(input.note ?? '').replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, 500) } })
    if (changed.count !== 1) throw new StoreError('درخواست هم‌زمان تعیین تکلیف شد', 409, 'CONFLICT')
    await tx.orderEvent.create({ data: { orderId: order.id, status: input.action === 'approve' ? 'DELIVERY_CHANGE_APPROVED' : 'DELIVERY_CHANGE_REJECTED', visible: true, actorId: input.actorId, note: input.action === 'approve' ? 'نشانی ارسال به‌روزرسانی شد' : 'درخواست تغییر نشانی رد شد' } })
    await input.audit(tx, change.id)
    return view(await tx.orderDeliveryChange.findUniqueOrThrow({ where: { id: change.id } }))
  })
}

export async function withdrawDeliveryChange(input: { changeId: number; userId: number; orderId?: number }) {
  return db.$transaction(async tx => {
    const row = await tx.orderDeliveryChange.findFirst({ where: { id: input.changeId, requestedById: input.userId, ...(input.orderId ? { orderId: input.orderId } : {}), status: 'REQUESTED' }, select: { id: true, orderId: true, updatedAt: true } })
    if (!row) throw new StoreError('درخواست باز پیدا نشد', 404, 'CHANGE_NOT_FOUND')
    await lockOrderDispatch(tx, row.orderId)
    const changed = await tx.orderDeliveryChange.updateMany({ where: { id: row.id, requestedById: input.userId, status: 'REQUESTED', updatedAt: row.updatedAt }, data: { status: 'WITHDRAWN', openOrderKey: null } })
    if (changed.count !== 1) throw new StoreError('درخواست هم‌زمان تغییر کرده است', 409, 'CONFLICT')
    await tx.orderEvent.create({ data: { orderId: row.orderId, status: 'DELIVERY_CHANGE_WITHDRAWN', visible: true, actorId: input.userId, note: 'درخواست تغییر نشانی پس گرفته شد' } })
    return { ok: true }
  })
}
