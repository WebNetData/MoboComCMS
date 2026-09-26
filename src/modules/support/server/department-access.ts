import { db } from '@/platform/database/prisma'
import type { AuthedUser } from '@/modules/identity/server/access'
import { canHandleDepartment } from '@/modules/support/domain/department-config'

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
