import type { AuthedUser } from '@/modules/identity/server/access'
import { actorHasFullAccess } from '@/modules/identity/server/staff-guard'
import { isFullAccess, parsePermissions } from '@/modules/identity/rbac'

/** A role editor may only grant their own permissions and may not edit their own role. */
export function roleRefusal(actor: AuthedUser, permissions: string, roleId?: number): string | null {
  if (actorHasFullAccess(actor)) return null
  if (roleId && roleId === actor.roleId) return 'نمی‌توانید نقش خودتان را تغییر دهید'
  if (isFullAccess(permissions)) return 'نقش با دسترسی کامل را فقط مدیر کل می‌سازد یا تغییر می‌دهد'
  const beyond = parsePermissions(permissions).find((permission) => !actor.permissions?.includes(permission))
  return beyond ? `دسترسی «${beyond}» را خودتان ندارید و نمی‌توانید به نقشی بدهید` : null
}
