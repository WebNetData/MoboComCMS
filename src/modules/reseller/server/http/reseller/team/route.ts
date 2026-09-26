import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireReseller, parseResellerPermissions, RESELLER_PERMISSIONS } from '@/modules/reseller/server/reseller'
import { logEvent } from '@/platform/observability/logger'

async function owner(req: NextRequest) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard
  if (!guard.owner) return { ok: false as const, response: err('Only the reseller owner can manage the team', 403) }
  return guard
}

function parseInput(value: unknown) {
  if (!Array.isArray(value) || value.some(x => typeof x !== 'string' || !RESELLER_PERMISSIONS.includes(x as typeof RESELLER_PERMISSIONS[number]))) return null
  return parseResellerPermissions(value.join(','))
}

export async function GET(req: NextRequest) {
  const guard = await owner(req)
  if (!guard.ok) return guard.response
  const rows = await db.resellerMember.findMany({ where: { resellerId: guard.reseller.id }, include: { user: { select: { email: true, name: true, status: true } } }, orderBy: { id: 'desc' } })
  return ok({ permissions: RESELLER_PERMISSIONS, members: rows.map(row => ({ id: row.id, email: row.user.email, name: row.user.name, accountStatus: row.user.status, active: row.active, permissions: parseResellerPermissions(row.permissions), createdAt: row.createdAt })) })
}

export async function POST(req: NextRequest) {
  const guard = await owner(req)
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const email = String(body?.email || '').trim().toLowerCase()
  const permissions = parseInput(body?.permissions)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !permissions?.length) return err('A valid existing email and at least one permission are required')
  const user = await db.user.findUnique({ where: { email }, select: { id: true, status: true, role: true, reseller: { select: { id: true } } } })
  if (!user || user.status !== 'ACTIVE' || user.role !== 'CUSTOMER' || user.reseller || user.id === guard.auth.id) return err('This active customer account cannot join the team', 409)
  const existing = await db.resellerMember.findUnique({ where: { userId: user.id } })
  if (existing) return err('This account already belongs to a reseller team', 409)
  const member = await db.resellerMember.create({ data: { resellerId: guard.reseller.id, userId: user.id, permissions: permissions.join(',') } })
  logEvent('info', 'reseller.team.added', { resellerId: guard.reseller.id, memberId: member.id, actorId: guard.auth.id })
  return ok({ id: member.id }, 201)
}

export async function PATCH(req: NextRequest) {
  const guard = await owner(req)
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  const permissions = parseInput(body?.permissions)
  if (!Number.isSafeInteger(id) || id <= 0 || typeof body?.active !== 'boolean' || !permissions?.length) return err('Invalid team settings')
  const result = await db.resellerMember.updateMany({ where: { id, resellerId: guard.reseller.id }, data: { active: body.active, permissions: permissions.join(',') } })
  if (!result.count) return err('Team member not found', 404)
  logEvent('info', 'reseller.team.updated', { resellerId: guard.reseller.id, memberId: id, actorId: guard.auth.id, active: body.active })
  return ok({ id })
}

export async function DELETE(req: NextRequest) {
  const guard = await owner(req)
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  if (!Number.isSafeInteger(id) || id <= 0) return err('Invalid member')
  const result = await db.resellerMember.deleteMany({ where: { id, resellerId: guard.reseller.id } })
  if (!result.count) return err('Team member not found', 404)
  logEvent('info', 'reseller.team.removed', { resellerId: guard.reseller.id, memberId: id, actorId: guard.auth.id })
  return ok({ id })
}
