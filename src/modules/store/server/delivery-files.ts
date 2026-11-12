import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { StoreError } from '@/modules/store/domain/store'
import { lockOrderWork, type OrderWorkScope } from '@/modules/store/server/order-work'
import { VIRTUAL_ORDER } from '@/modules/store/server/staff-delivery'
import type { DeliveryFileView } from '@/modules/store/domain/delivery-details'

/**
 * Files a specialist hands the buyer of a virtual order with its delivery (owner 2026-11-12): a text file, an archive,
 * anything the media size limit allows. The blobs are private (media/server/private-files); the order's specialist (or
 * an orders manager) attaches and removes them, and the buyer downloads them only while the order is delivered.
 */

export const MAX_DELIVERY_FILES = 20
const view = (row: { id: number; label: string; filename: string; sizeBytes: bigint }): DeliveryFileView => ({ id: row.id, label: row.label, filename: row.filename, sizeBytes: row.sizeBytes.toString() })
const listOf = async (orderId: number, reader: Prisma.TransactionClient = db) => (await reader.orderDeliveryFile.findMany({ where: { orderId }, orderBy: { id: 'asc' }, select: { id: true, label: true, filename: true, sizeBytes: true } })).map(view)

export const orderDeliveryFiles = (orderId: number) => listOf(orderId)

type Audit = { req: NextRequest; actor: AdminAuditInput['actor'] }

/** The blob is already written; the row and the audit commit together, or the caller discards the blob. */
export async function addOrderDeliveryFile(audit: Audit, orderId: number, scope: OrderWorkScope, upload: { storageKey: string; sizeBytes: bigint; sha256: string; filename: string }, label?: string | null) {
  return db.$transaction(async tx => {
    await lockOrderWork(tx, orderId, scope)
    const order = await tx.order.findFirst({ where: { id: orderId, status: 'PAID', ...VIRTUAL_ORDER }, select: { productDelivery: { select: { status: true } }, _count: { select: { deliveryFiles: true } } } })
    if (!order) throw new StoreError('فایل تحویل فقط برای سفارش مجازیِ پرداخت‌شده است', 404)
    if (['CANCELLED', 'RETURNED'].includes(order.productDelivery?.status || '')) throw new StoreError('این سفارش بسته شده است', 409)
    if (order._count.deliveryFiles >= MAX_DELIVERY_FILES) throw new StoreError(`هر سفارش حداکثر ${MAX_DELIVERY_FILES.toLocaleString('fa-IR')} فایل تحویل دارد`)
    const row = await tx.orderDeliveryFile.create({ data: { orderId, ...upload, label: (label || '').trim().slice(0, 180) || upload.filename } })
    await auditAdminStrict({ ...audit, action: 'store.order.file.add', targetType: 'order', targetId: orderId, metadata: { fileId: row.id, filename: upload.filename, sizeBytes: upload.sizeBytes.toString(), sha256: upload.sha256 } }, tx)
    return listOf(orderId, tx)
  })
}

/** Returns the storage key to discard once the row is gone. */
export async function removeOrderDeliveryFile(audit: Audit, orderId: number, fileId: number, scope: OrderWorkScope) {
  return db.$transaction(async tx => {
    await lockOrderWork(tx, orderId, scope)
    const row = await tx.orderDeliveryFile.findFirst({ where: { id: fileId, orderId }, select: { id: true, storageKey: true, filename: true } })
    if (!row) throw new StoreError('فایل پیدا نشد', 404)
    await tx.orderDeliveryFile.delete({ where: { id: row.id } })
    await auditAdminStrict({ ...audit, action: 'store.order.file.remove', targetType: 'order', targetId: orderId, metadata: { fileId, filename: row.filename } }, tx)
    return { files: await listOf(orderId, tx), storageKey: row.storageKey }
  })
}

/** The buyer's own delivered virtual order only; a cancelled or returned order closes its files again. */
const buyerScope = (userId: number, orderId: number): Prisma.OrderDeliveryFileWhereInput => ({ orderId, order: { is: { userId, status: 'PAID', productDelivery: { is: { status: 'DELIVERED' } }, ...VIRTUAL_ORDER } } })
export const buyerDeliveryFiles = async (userId: number, orderId: number) => (await db.orderDeliveryFile.findMany({ where: buyerScope(userId, orderId), orderBy: { id: 'asc' }, select: { id: true, label: true, filename: true, sizeBytes: true } })).map(view)
export const buyerDeliveryFile = (userId: number, orderId: number, fileId: number) => db.orderDeliveryFile.findFirst({ where: { id: fileId, ...buyerScope(userId, orderId) }, select: { storageKey: true, filename: true, sizeBytes: true } })
