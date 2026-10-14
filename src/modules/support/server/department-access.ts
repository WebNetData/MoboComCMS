import { db } from '@/platform/database/prisma'
import type { AuthedUser } from '@/modules/identity/server/access'
import { canHandleDepartment } from '@/modules/support/domain/department-config'

/** Whoever manages departments (or holds every right) may step into any ticket. */
export const managesTickets = (user: AuthedUser) => user.roleId == null || Boolean(user.permissions?.includes('tickets.departments.manage'))

/**
 * A ticket somebody holds is theirs: a colleague of the same department reads it and may leave an internal note,
 * but answering the customer, closing it or taking it away is for its holder or a manager of departments.
 */
export const heldByAnother = (user: AuthedUser, assignedToId: number | null | undefined) => Boolean(assignedToId) && assignedToId !== user.id && !managesTickets(user)
export const HELD_BY_ANOTHER = 'این تیکت در دست همکار دیگری است؛ فقط خود او یا مدیر دپارتمان‌ها می‌تواند آن را پاسخ دهد یا تغییر دهد (یادداشت داخلی آزاد است)'

export async function canHandleTicket(user: AuthedUser, slug: string) {
  if (user.roleId == null || user.permissions?.includes('tickets.departments.manage')) return true
  const department = await db.ticketDepartment.findUnique({ where: { slug }, select: { roleIds: true } })
  return canHandleDepartment(user, department)
}

export async function allowedDepartmentSlugs(user: AuthedUser) {
  if (user.roleId == null || user.permissions?.includes('tickets.departments.manage')) return null
  const departments = await db.ticketDepartment.findMany({ select: { slug: true, roleIds: true } })
  return departments.filter(department => canHandleDepartment(user, department)).map(department => department.slug)
}
