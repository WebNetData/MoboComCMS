import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { ALL_PERMISSIONS, FULL_ACCESS, ROLE_PRESETS, isFullAccess, parsePermissions } from '@/modules/identity/rbac'
import { actorHasFullAccess } from '@/modules/identity/server/staff-guard'
import type { AuthedUser } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'

/**
 * A role is shaped only up to what its maker holds: someone with "roles" but not full access can neither make
 * a full-access role nor put into a role a permission they do not have, nor edit the role they hold themselves.
 * Otherwise "roles" alone would be full access by one edit.
 */
function roleRefusal(actor: AuthedUser, permissions: string, roleId?: number): string | null {
  if (actorHasFullAccess(actor)) return null
  if (roleId && roleId === actor.roleId) return 'نمی‌توانید نقش خودتان را تغییر دهید'
  if (isFullAccess(permissions)) return 'نقش با دسترسی کامل را فقط مدیر کل می‌سازد یا تغییر می‌دهد'
  const beyond = parsePermissions(permissions).find((permission) => !actor.permissions?.includes(permission))
  return beyond ? `دسترسی «${beyond}» را خودتان ندارید و نمی‌توانید به نقشی بدهید` : null
}

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'roles.manage')
  if (!admin) return err('forbidden', 403)
  const roles = await db.role.findMany({ include: { _count: { select: { users: true } } }, orderBy: { id: 'asc' } })
  return ok({ roles, allPermissions: ALL_PERMISSIONS, presets: ROLE_PRESETS })
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'roles.manage')
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const name = String(b?.name || '').trim().toLowerCase()
  if (!name) return err('نام نقش الزامی است')
  const exists = await db.role.findUnique({ where: { name } })
  if (exists) return err('این نقش قبلاً ساخته شده')
  const preset = String(b?.preset || '')
  const perms: string = Array.isArray(b?.permissions) && b.permissions.length
    ? b.permissions.join(',')
    : preset === 'admin'
      ? FULL_ACCESS // every capability, including ones added by future plugins
      : preset && ROLE_PRESETS[preset]
        ? ROLE_PRESETS[preset].join(',')
      : ''
  const refusal = roleRefusal(admin, perms)
  if (refusal) return err(refusal, 403)
  const role = await db.role.create({ data: { name, nameFa: String(b?.nameFa || ''), nameEn: String(b?.nameEn || name), permissions: perms } })
  await auditAdmin({ req, actor: admin, action: 'role.create', targetType: 'role', targetId: role.id, metadata: { name: role.name, permissions: role.permissions } })
  return ok(role)
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'roles.manage')
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  if (!id) return err('invalid id')
  const role = await db.role.findUnique({ where: { id } })
  if (!role) return err('not found', 404)
  if (role.isSystem && typeof b?.permissions !== 'undefined') return err('نقش سیستمی قابل تغییر نیست', 400)
  const data: Record<string, unknown> = {}
  if (typeof b?.nameFa === 'string') data.nameFa = b.nameFa
  if (typeof b?.nameEn === 'string') data.nameEn = b.nameEn
  if (Array.isArray(b?.permissions)) data.permissions = b.permissions.join(',')
  // Both what the role held and what it would hold must be within the editor's reach.
  const refusal = roleRefusal(admin, role.permissions, id) || (typeof data.permissions === 'string' ? roleRefusal(admin, data.permissions, id) : null)
  if (refusal) return err(refusal, 403)
  const updated = await db.role.update({ where: { id }, data })
  await auditAdmin({ req, actor: admin, action: 'role.update', targetType: 'role', targetId: id, metadata: { name: role.name, before: role.permissions, after: updated.permissions } })
  return ok(updated)
}

export async function DELETE(req: NextRequest) {
  const admin = await requirePerm(req, 'roles.manage')
  if (!admin) return err('forbidden', 403)
  const id = Number(req.nextUrl.searchParams.get('id'))
  const role = await db.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } })
  if (!role) return err('not found', 404)
  if (role.isSystem) return err('نقش سیستمی قابل حذف نیست', 400)
  if (role._count.users > 0) return err('ابتدا کاربران این نقش را تغییر دهید', 400)
  const refusal = roleRefusal(admin, role.permissions, id)
  if (refusal) return err(refusal, 403)
  await db.role.delete({ where: { id } })
  await auditAdmin({ req, actor: admin, action: 'role.delete', targetType: 'role', targetId: id, metadata: { name: role.name } })
  return ok({ deleted: true })
}
