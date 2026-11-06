import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { parsePermissions } from '@/modules/identity/rbac'
import { StoreError } from '@/modules/store/domain/store'

export type OrderWorkScope = { actorId: number; manager: boolean }
export const orderVisibility = (scope?: OrderWorkScope): Prisma.OrderWhereInput => !scope || scope.manager ? {} : { status: 'PAID', OR: [{ assigneeId: null }, { assigneeId: scope.actorId }] }

/** Locks the same Order row as assignment. A colleague cannot reassign between a check and a write. */
export async function lockOrderWork(tx: Prisma.TransactionClient, id: number, scope?: OrderWorkScope) {
  if (!scope) return // Existing internal callers remain manager-only through their own boundary.
  const row = await tx.order.findFirst({ where: { id, productId: { not: null } }, select: { assigneeId: true, status: true, updatedAt: true } })
  if (!row) throw new StoreError('سفارش پیدا نشد', 404, 'ORDER_NOT_FOUND')
  if (!scope.manager && (row.status !== 'PAID' || row.assigneeId !== scope.actorId)) throw new StoreError('ابتدا سفارش را بردارید؛ کار همکار دیگر در دسترس شما نیست', 403, 'NOT_YOUR_WORK')
  const held = await tx.order.updateMany({ where: { id, status: row.status, assigneeId: row.assigneeId, updatedAt: row.updatedAt }, data: { assigneeId: row.assigneeId, updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)) } })
  if (held.count !== 1) throw new StoreError('کارشناس سفارش هم‌زمان تغییر کرد؛ صفحه را تازه کنید', 409, 'CONFLICT')
}

export async function orderSpecialists() {
  const rows = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true, name: true, roleId: true, roleRef: { select: { nameFa: true, permissions: true } }, _count: { select: { assignedOrders: { where: { status: 'PAID', productDelivery: { is: { status: { in: ['PENDING', 'PROCESSING', 'PACKED', 'SHIPPED'] } } } } } } } }, orderBy: { id: 'asc' } })
  return rows.filter(row => row.roleId == null || parsePermissions(row.roleRef?.permissions || '').some(p => p === 'orders.manage' || p === 'store.orders.handle')).map(row => ({ id: row.id, name: row.name || `کارشناس ${row.id}`, role: row.roleRef?.nameFa || 'مدیر کل سایت', open: row._count.assignedOrders }))
}

export async function assignOrder(id: number, target: unknown, scope: OrderWorkScope) {
  const assigneeId = target === null ? null : Number(target)
  if (assigneeId !== null && (!Number.isSafeInteger(assigneeId) || assigneeId <= 0)) throw new StoreError('کارشناس نامعتبر است')
  if (!scope.manager && assigneeId !== scope.actorId) throw new StoreError('واگذاری یا آزادکردن سفارش فقط با مدیر سفارش‌ها است', 403)
  return db.$transaction(async tx => {
    const row = await tx.order.findFirst({ where: { id, productId: { not: null }, status: 'PAID' }, select: { assigneeId: true, productDelivery: { select: { status: true } } } })
    if (!row) throw new StoreError('سفارش پرداخت‌شده پیدا نشد', 404)
    if (!row.productDelivery || ['DELIVERED', 'CANCELLED', 'RETURNED'].includes(row.productDelivery.status)) throw new StoreError('این سفارش در صف انجام کار نیست', 409)
    if (!scope.manager && row.assigneeId && row.assigneeId !== scope.actorId) throw new StoreError('این سفارش در دست همکار دیگری است', 403)
    if (assigneeId) {
      const user = await tx.user.findUnique({ where: { id: assigneeId }, select: { role: true, status: true, roleId: true, roleRef: { select: { permissions: true } } } })
      if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE' || (user.roleId != null && !parsePermissions(user.roleRef?.permissions || '').some(p => p === 'orders.manage' || p === 'store.orders.handle'))) throw new StoreError('کارشناس فعال با دسترسی سفارش انتخاب کنید', 400)
    }
    const changed = await tx.order.updateMany({ where: { id, status: 'PAID', assigneeId: row.assigneeId }, data: { assigneeId } })
    if (changed.count !== 1) throw new StoreError('سفارش هم‌زمان به کارشناس دیگری سپرده شد', 409, 'CONFLICT')
    await tx.orderEvent.create({ data: { orderId: id, status: 'ASSIGNED', note: assigneeId ? `واگذاری به کارشناس ${assigneeId}` : 'کارشناس سفارش برداشته شد', visible: false, actorId: scope.actorId } })
    return { assigneeId }
  })
}
