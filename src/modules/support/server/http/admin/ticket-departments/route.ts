import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { validateDepartment } from '@/modules/support/domain/department-config'
import { auditAdmin } from '@/platform/audit/server'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'tickets.departments.manage')) return err('forbidden', 403)
  const [departments, roles] = await Promise.all([
    db.ticketDepartment.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    db.role.findMany({ where: { permissions: { contains: 'tickets.handle' } }, select: { id: true, name: true, nameFa: true, nameEn: true }, orderBy: { name: 'asc' } }),
  ])
  return ok({ departments: departments.map(d => ({ ...d, fields: JSON.parse(d.fields), roleIds: JSON.parse(d.roleIds) })), roles })
}

async function checkedInput(body: unknown) {
  const data = validateDepartment(body)
  const roleIds: number[] = JSON.parse(data.roleIds)
  if (roleIds.length) {
    const count = await db.role.count({ where: { id: { in: roleIds }, permissions: { contains: 'tickets.handle' } } })
    if (count !== roleIds.length) throw Error('Every assigned role must have ticket access')
  }
  return data
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'tickets.departments.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  let data
  try { data = await checkedInput(body) } catch (e) { return err(e instanceof Error ? e.message : 'Invalid department') }
  if (await db.ticketDepartment.findUnique({ where: { slug: data.slug } })) return err('Department key already exists', 409)
  const created = await db.ticketDepartment.create({ data })
  await auditAdmin({ req, actor: admin, action: 'ticket_department.create', targetType: 'TicketDepartment', targetId: created.id, metadata: { slug: created.slug, roleIds: data.roleIds } })
  return ok({ id: created.id })
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'tickets.departments.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  if (!Number.isSafeInteger(id) || id <= 0) return err('Invalid department id')
  const existing = await db.ticketDepartment.findUnique({ where: { id } })
  if (!existing) return err('Department not found', 404)
  let data
  try { data = await checkedInput({ ...body, slug: existing.slug }) } catch (e) { return err(e instanceof Error ? e.message : 'Invalid department') }
  await db.ticketDepartment.update({ where: { id }, data })
  await auditAdmin({ req, actor: admin, action: 'ticket_department.update', targetType: 'TicketDepartment', targetId: id, metadata: { slug: existing.slug, active: data.active, roleIds: data.roleIds } })
  return ok({ id })
}
