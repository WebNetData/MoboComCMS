import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { StoreError } from '@/modules/store/domain/store'
import { deviceIdentifiers } from '@/modules/store/domain/device-identifiers'
import type { WarrantyDraft } from '@/modules/store/domain/warranty'
import { lockOrder } from './returns/shared'

type Audit = (tx: Prisma.TransactionClient, targetId: number) => Promise<unknown>
const viewSelect = {
  id: true, orderLineId: true, unitIndex: true, serial: true, imei: true,
  warrantyStartsAt: true, warrantyEndsAt: true, provider: true, conditions: true,
  createdAt: true, updatedAt: true,
  orderLine: { select: { line: true, name: true, variantName: true, orderId: true } },
  tickets: { select: { id: true, subject: true, status: true, updatedAt: true }, orderBy: { createdAt: 'desc' as const } },
  repairs: { select: { id: true, stage: true, status: true, createdAt: true } },
} as const

export async function adminWarrantyDevices(orderId: number) {
  const order = await db.order.findFirst({ where: { id: orderId, status: 'PAID' }, select: { id: true, userId: true, lines: { orderBy: { line: 'asc' }, select: { id: true, line: true, name: true, variantName: true, kind: true, quantity: true, deviceIdentifiers: true } } } })
  if (!order) throw new StoreError('سفارش پرداخت‌شده پیدا نشد', 404)
  const devices = await db.storeWarrantyDevice.findMany({ where: { orderLine: { orderId } }, orderBy: [{ orderLineId: 'asc' }, { unitIndex: 'asc' }], select: viewSelect })
  const lines = order.lines.filter(line => line.kind === 'PHYSICAL').map(line => ({
    id: line.id, line: line.line, name: line.name, variantName: line.variantName, quantity: line.quantity,
    devices: deviceIdentifiers(line.deviceIdentifiers).map((identifier, unitIndex) => ({
      unitIndex, serial: identifier.serial, imei: identifier.imei,
      warranty: devices.find(device => device.orderLineId === line.id && device.unitIndex === unitIndex) || null,
    })),
  }))
  return { orderId: order.id, lines }
}

export async function createWarrantyDevice(input: WarrantyDraft & { orderId: number; actorId: number }, audit: Audit) {
  try {
    return await db.$transaction(async tx => {
      const first = await tx.orderLine.findFirst({ where: { id: input.orderLineId, orderId: input.orderId }, select: { orderId: true } })
      if (!first) throw new StoreError('ردیف کالا در این سفارش پیدا نشد', 404)
      await lockOrder(tx, first.orderId)
      const line = await tx.orderLine.findFirst({ where: { id: input.orderLineId, orderId: input.orderId }, include: { order: { select: { status: true } } } })
      if (!line || line.order.status !== 'PAID' || line.kind !== 'PHYSICAL') throw new StoreError('ضمانت فقط برای کالای فیزیکیِ سفارش پرداخت‌شده ثبت می‌شود', 409)
      if (input.unitIndex >= line.quantity) throw new StoreError('شمارهٔ واحد فروخته‌شده معتبر نیست', 409)
      const identifier = deviceIdentifiers(line.deviceIdentifiers)[input.unitIndex]
      if (!identifier || (!identifier.serial && !identifier.imei)) throw new StoreError('برای این واحد، سریال یا IMEI در تصویر فروش ثبت نشده است', 409)
      const row = await tx.storeWarrantyDevice.create({ data: {
        orderLineId: line.id, unitIndex: input.unitIndex, serial: identifier.serial, imei: identifier.imei,
        warrantyStartsAt: input.warrantyStartsAt, warrantyEndsAt: input.warrantyEndsAt,
        provider: input.provider, conditions: input.conditions, createdById: input.actorId, updatedById: input.actorId,
      }, select: { id: true, orderLineId: true, unitIndex: true, serial: true, imei: true, warrantyStartsAt: true, warrantyEndsAt: true, provider: true, conditions: true, createdAt: true, updatedAt: true } })
      await audit(tx, row.id)
      return row
    }, { isolationLevel: 'Serializable', timeout: 30_000 })
  } catch (error) {
    if (error instanceof StoreError) throw error
    if ((error as { code?: string })?.code === 'P2002') throw new StoreError('برای این دستگاه ضمانت قبلاً ثبت شده است', 409, 'CONFLICT')
    throw error
  }
}

export async function updateWarrantyDevice(input: { id: number; expectedUpdatedAt: Date; warrantyStartsAt: Date; warrantyEndsAt: Date; provider: string; conditions: string; actorId: number }, audit: Audit) {
  return db.$transaction(async tx => {
    const first = await tx.storeWarrantyDevice.findUnique({ where: { id: input.id }, select: { orderLine: { select: { orderId: true } } } })
    if (!first) throw new StoreError('ضمانت پیدا نشد', 404)
    await lockOrder(tx, first.orderLine.orderId)
    const changed = await tx.storeWarrantyDevice.updateMany({ where: { id: input.id, updatedAt: input.expectedUpdatedAt }, data: {
      warrantyStartsAt: input.warrantyStartsAt, warrantyEndsAt: input.warrantyEndsAt,
      provider: input.provider, conditions: input.conditions, updatedById: input.actorId,
    } })
    if (changed.count !== 1) throw new StoreError('اطلاعات ضمانت هم‌زمان تغییر کرده است؛ صفحه را تازه کنید', 409, 'CONFLICT')
    await audit(tx, input.id)
    return tx.storeWarrantyDevice.findUniqueOrThrow({ where: { id: input.id }, select: { id: true, orderLineId: true, unitIndex: true, serial: true, imei: true, warrantyStartsAt: true, warrantyEndsAt: true, provider: true, conditions: true, createdAt: true, updatedAt: true } })
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
}

export async function customerWarrantyDevicesForOrder(userId: number, orderId: number) {
  const rows = await db.storeWarrantyDevice.findMany({ where: { orderLine: { orderId, order: { userId } } }, orderBy: [{ orderLine: { line: 'asc' } }, { unitIndex: 'asc' }], select: viewSelect })
  return rows
}

export async function customerWarrantyDevices(userId: number) {
  const rows = await db.storeWarrantyDevice.findMany({ where: { orderLine: { order: { userId, status: 'PAID' } } }, orderBy: [{ orderLine: { orderId: 'desc' } }, { unitIndex: 'asc' }], select: {
    id: true, serial: true, imei: true, warrantyStartsAt: true, warrantyEndsAt: true, provider: true, conditions: true,
    orderLine: { select: { orderId: true, line: true, name: true, variantName: true, productId: true } },
  } })
  return rows.map(row => ({
    id: row.id, orderId: row.orderLine.orderId, line: row.orderLine.line,
    name: row.orderLine.name, variantName: row.orderLine.variantName, productId: row.orderLine.productId,
    serial: row.serial, imei: row.imei, warrantyStartsAt: row.warrantyStartsAt,
    warrantyEndsAt: row.warrantyEndsAt, provider: row.provider, conditions: row.conditions,
  }))
}

/** Support composes a warranty case only when the requesting identity owns the original paid sale. */
export async function ownedWarrantyDeviceForSupport(userId: number, id: number) {
  const row = await db.storeWarrantyDevice.findFirst({ where: { id, orderLine: { order: { userId, status: 'PAID' } } }, select: {
    id: true, orderLineId: true, serial: true, imei: true,
    orderLine: { select: { orderId: true, productId: true, name: true, variantName: true } },
  } })
  return row ? { id: row.id, orderId: row.orderLine.orderId, productId: row.orderLine.productId, name: row.orderLine.name, variantName: row.orderLine.variantName, serial: row.serial, imei: row.imei } : null
}
