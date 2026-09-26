import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { ALL_PERMISSIONS, ROLE_PRESETS } from '@/modules/identity/rbac'

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
    : preset && ROLE_PRESETS[preset]
      ? ROLE_PRESETS[preset].join(',')
      : ''
  const role = await db.role.create({ data: { name, nameFa: String(b?.nameFa || ''), nameEn: String(b?.nameEn || name), permissions: perms } })
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
  const updated = await db.role.update({ where: { id }, data })
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
  await db.role.delete({ where: { id } })
  return ok({ deleted: true })
}
