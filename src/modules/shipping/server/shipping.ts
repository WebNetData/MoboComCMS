import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import {
  DEFAULT_DELIVERY, MAX_ADDRESSES, ShippingError, assertSlot, buildSchedule, formatAddress, normalizeDeliverySettings, tehranParts, validateAddress,
  type DeliverySettings, type ScheduleDay,
} from '@/modules/shipping/domain/shipping'

type Tx = Prisma.TransactionClient

const SETTINGS_KEY = 'store.delivery.v1'
/** Orders in these states no longer hold a delivery slot. */
const RELEASED = ['FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'REFUNDED', 'VOID']
/** An unpaid checkout keeps its slot for this long. */
const PENDING_HOLD_MS = 2 * 60 * 60_000

// ------------------------------------------------------------------ address book

export const listAddresses = (userId: number) =>
  db.userAddress.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] })

export async function saveAddress(userId: number, input: Record<string, unknown>, id?: number) {
  const data = validateAddress(input)
  return db.$transaction(async (tx) => {
    const count = await tx.userAddress.count({ where: { userId } })
    if (id) {
      const existing = await tx.userAddress.findFirst({ where: { id, userId } })
      if (!existing) throw new ShippingError('آدرس پیدا نشد', 404)
    } else if (count >= MAX_ADDRESSES) {
      throw new ShippingError(`حداکثر ${MAX_ADDRESSES.toLocaleString('fa-IR')} آدرس می‌توانید ذخیره کنید`)
    }
    // The first address is always the default; a new default clears the old one.
    const isDefault = data.isDefault || count === 0
    if (isDefault) await tx.userAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } })
    const saved = id
      ? await tx.userAddress.update({ where: { id }, data: { ...data, isDefault: isDefault || undefined } })
      : await tx.userAddress.create({ data: { ...data, userId, isDefault } })
    return saved
  })
}

export async function deleteAddress(userId: number, id: number) {
  return db.$transaction(async (tx) => {
    const existing = await tx.userAddress.findFirst({ where: { id, userId } })
    if (!existing) throw new ShippingError('آدرس پیدا نشد', 404)
    await tx.userAddress.delete({ where: { id } })
    if (existing.isDefault) {
      const next = await tx.userAddress.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } })
      if (next) await tx.userAddress.update({ where: { id: next.id }, data: { isDefault: true } })
    }
    return { deleted: true }
  })
}

export async function setDefaultAddress(userId: number, id: number) {
  return db.$transaction(async (tx) => {
    const existing = await tx.userAddress.findFirst({ where: { id, userId } })
    if (!existing) throw new ShippingError('آدرس پیدا نشد', 404)
    await tx.userAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } })
    await tx.userAddress.update({ where: { id }, data: { isDefault: true } })
    return { id }
  })
}

/** The snapshot stored on the order (the saved address may change later). */
export async function addressSnapshot(userId: number, id: number) {
  const address = await db.userAddress.findFirst({ where: { id, userId } })
  if (!address) throw new ShippingError('آدرس انتخاب‌شده پیدا نشد؛ آدرس دیگری انتخاب کنید', 404, 'ADDRESS_NOT_FOUND')
  return {
    title: address.title, recipient: address.recipient, phone: address.mobile, country: 'ایران', province: address.province,
    city: address.city, postalCode: address.postalCode, plaque: address.plaque, unit: address.unit, address: formatAddress(address),
  }
}

// ------------------------------------------------------------------ delivery schedule

export async function getDeliverySettings(): Promise<DeliverySettings> {
  const stored = await readJsonSetting(SETTINGS_KEY)
  return stored ? normalizeDeliverySettings(stored, DEFAULT_DELIVERY) : structuredClone(DEFAULT_DELIVERY)
}

export async function saveDeliverySettings(input: Record<string, unknown>) {
  const next = normalizeDeliverySettings(input, await getDeliverySettings())
  await writeJsonSetting(SETTINGS_KEY, next)
  return next
}

/** Live bookings per "date|slot" from today on (dead and long-abandoned orders excluded). */
async function bookedCounts(client: Tx | typeof db, from: string) {
  const rows = await client.deliveryBooking.findMany({
    where: {
      date: { gte: from },
      order: { status: { notIn: RELEASED }, OR: [{ status: { not: 'PENDING' } }, { createdAt: { gte: new Date(Date.now() - PENDING_HOLD_MS) } }] },
    },
    select: { date: true, slotId: true },
  })
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(`${row.date}|${row.slotId}`, (counts.get(`${row.date}|${row.slotId}`) || 0) + 1)
  return counts
}

export async function deliverySchedule(now = new Date()): Promise<{ settings: DeliverySettings; days: ScheduleDay[] }> {
  const settings = await getDeliverySettings()
  const days = buildSchedule(settings, now, await bookedCounts(db, tehranParts(now).day))
  return { settings, days }
}

/** Validates the chosen slot against current capacity (outside a transaction). */
export async function validateDelivery(date: unknown, slotId: unknown) {
  const { days } = await deliverySchedule()
  return assertSlot(days, date, slotId)
}

/**
 * Books the slot for an order inside the checkout transaction, re-checking
 * capacity there so two simultaneous buyers cannot both take the last place.
 */
export async function bookDelivery(tx: Tx, orderId: number, date: string, slotId: string) {
  const settings = await getDeliverySettings()
  const now = new Date()
  assertSlot(buildSchedule(settings, now, await bookedCounts(tx, tehranParts(now).day)), date, slotId)
  await tx.deliveryBooking.create({ data: { orderId, date, slotId } })
}
