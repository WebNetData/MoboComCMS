import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requirePerm } from './access'
import { accountChangeRefusal } from './staff-guard'
import { auditAdminStrict } from '@/platform/audit/server'

export class DeleteUserError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

/** Empty accounts may be removed; customer history never cascades through this action. */
export async function deleteEmptyUser(req: NextRequest, input: Record<string, unknown>) {
  if (input.confirm !== true || !Number.isSafeInteger(input.id) || Number(input.id) <= 0 || typeof input.updatedAt !== 'string' || !Number.isFinite(Date.parse(input.updatedAt))) throw new DeleteUserError('حذف همین کاربر را تأیید کنید و فهرست تازهٔ کاربران را به کار ببرید')
  const id = Number(input.id), updatedAt = new Date(input.updatedAt)
  return db.$transaction(async tx => {
    const actor = await requirePerm(req, 'users.manage', tx)
    if (!actor) throw new DeleteUserError('اجازهٔ مدیریت کاربران ندارید', 403)
    if (actor.id === id) throw new DeleteUserError('نمی‌توانید حسابی را که با آن وارد شده‌اید حذف کنید', 403)
    const target = await tx.user.findUnique({ where: { id }, include: { _count: true, membershipAccount: { select: { userId: true } }, reseller: { select: { id: true } }, resellerMembership: { select: { id: true } }, trialClaim: { select: { id: true } }, forumProfile: { select: { userId: true } }, userProfile: { select: { userId: true } }, cart: { select: { id: true } } } })
    if (!target) throw new DeleteUserError('کاربر پیدا نشد', 404)
    const refusal = await accountChangeRefusal(actor, id, { sensitive: true, role: 'CUSTOMER', roleId: null }, tx)
    if (refusal) throw new DeleteUserError(refusal, 403)
    if (target.updatedAt.getTime() !== updatedAt.getTime()) throw new DeleteUserError('کاربر پس از بازشدن این پنجره تغییر کرده است؛ فهرست را تازه کنید', 409)
    // Count every declared many-side User relation, including cascade relations. A new
    // owner relation is protected automatically rather than silently losing history.
    if (Object.values(target._count).some(count => count > 0) || target.membershipAccount || target.reseller || target.resellerMembership || target.trialClaim || target.forumProfile || target.userProfile || target.cart || target.walletBalance !== 0) throw new DeleteUserError('این کاربر سابقه یا اطلاعات مرتبط دارد و برای حفظ سفارش‌ها، پرداخت‌ها و فعالیت‌ها حذف نمی‌شود. برای قطع دسترسی، حساب را از همین پنل غیرفعال کنید.', 409)
    const removed = await tx.user.deleteMany({ where: { id, updatedAt } })
    if (removed.count !== 1) throw new DeleteUserError('کاربر هم‌زمان تغییر کرده است؛ فهرست را تازه کنید', 409)
    await auditAdminStrict({ req, actor, action: 'user.delete', targetType: 'user', targetId: id, metadata: { emptyAccount: true } }, tx)
    return { id, deleted: true }
  }, { isolationLevel: 'Serializable' })
}
