import { db } from '@/platform/database/prisma'
import { ALL_PERMISSIONS, isFullAccess } from '@/modules/identity/rbac'
import type { AuthedUser } from '@/modules/identity/server/access'

// Who may change a staff account. "Manage users" is for customers' accounts; standing as staff is a matter of
// roles. Without these rules anyone holding users.manage (support staff do) could make themselves, or anyone,
// a full-access admin, or set the owner's password.

/** Full access: a staff account without a role, or one whose role holds everything. */
export const actorHasFullAccess = (actor: Pick<AuthedUser, 'role' | 'roleId' | 'permissions'>) =>
  actor.role === 'ADMIN' && (actor.roleId == null || ALL_PERMISSIONS.every((permission) => !!actor.permissions?.includes(permission)))

const mayManageRoles = (actor: Pick<AuthedUser, 'role' | 'roleId' | 'permissions'>) => actorHasFullAccess(actor) || !!actor.permissions?.includes('roles.manage')

export type AccountChange = {
  /** New standing, when the request changes it. */
  role?: 'ADMIN' | 'CUSTOMER'
  roleId?: number | null
  /** The request changes how the account is entered or whether it works: password, status. */
  sensitive?: boolean
}

/**
 * Why this actor may not make this change to this account, or null when they may. `targetId` is null for an
 * account being created.
 */
export async function accountChangeRefusal(actor: AuthedUser, targetId: number | null, change: AccountChange): Promise<string | null> {
  const target = targetId ? await db.user.findUnique({ where: { id: targetId }, select: { role: true, roleId: true, roleRef: { select: { permissions: true } } } }) : null
  if (targetId && !target) return 'کاربر پیدا نشد'
  const targetStaff = target?.role === 'ADMIN'
  const targetFull = targetStaff && (target.roleId == null || isFullAccess(target.roleRef?.permissions || ''))
  const full = actorHasFullAccess(actor)
  const standing = change.role !== undefined || change.roleId !== undefined

  if (targetFull && !full && (standing || change.sensitive)) return 'این حساب دسترسی کامل دارد و فقط مدیر کل می‌تواند آن را تغییر دهد'
  if (targetStaff && change.sensitive && !mayManageRoles(actor)) return 'تغییر رمز یا وضعیت حساب کارکنان به دسترسی «نقش‌ها» نیاز دارد'
  if (!standing) return null

  const nextRole = change.role ?? (target?.role === 'ADMIN' ? 'ADMIN' : 'CUSTOMER')
  const nextRoleId = nextRole === 'ADMIN' ? (change.roleId !== undefined ? change.roleId : target?.roleId ?? null) : null
  // Nothing about their standing actually changes: an ordinary edit that happens to repeat it.
  if (target && nextRole === (target.role === 'ADMIN' ? 'ADMIN' : 'CUSTOMER') && nextRoleId === (target.roleId ?? null)) return null
  if (targetId === actor.id) return 'نمی‌توانید نقش حساب خودتان را تغییر دهید'
  if (!mayManageRoles(actor)) return 'دادن یا گرفتن نقش کارکنان به دسترسی «نقش‌ها» نیاز دارد'
  if (nextRole !== 'ADMIN') return null
  if (nextRoleId == null) return full ? null : 'دسترسی کامل را فقط مدیر کل می‌تواند بدهد؛ یک نقش انتخاب کنید'
  const role = await db.role.findUnique({ where: { id: nextRoleId }, select: { permissions: true } })
  if (!role) return 'نقش انتخاب‌شده پیدا نشد'
  if (isFullAccess(role.permissions) && !full) return 'نقشی با دسترسی کامل را فقط مدیر کل می‌تواند بدهد'
  return null
}
