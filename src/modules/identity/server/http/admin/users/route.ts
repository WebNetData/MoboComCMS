import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { randomPassword } from '@/shared/security/random'
import { walletBalancesForUsers } from '@/modules/wallet/server/wallet'
import bcrypt from 'bcryptjs'
import { auditAdmin } from '@/platform/audit/server'

export async function GET(req: NextRequest) {
  const admin =
    (await requirePerm(req, 'users.manage' as Permission)) ||
    // billing staff need a customer picker without full CRM access
    (await requirePerm(req, 'invoices.manage' as Permission))
  if (!admin) return err('forbidden', 403)
  const q = req.nextUrl.searchParams.get('q') || ''
  const slim = req.nextUrl.searchParams.get('slim') === '1'
  if (slim) {
    const basic = await db.user.findMany({
      where: q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : undefined,
      select: { id: true, email: true, name: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return ok({ users: basic.map((u) => ({ ...u, role: 'CUSTOMER', status: 'ACTIVE', orders: 0, subs: 0, tickets: 0 })), roles: [] })
  }
  const users = await db.user.findMany({
    where: q
      ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] }
      : undefined,
    include: {
      roleRef: true,
      _count: { select: { orders: true, subscriptions: true, tickets: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  const [roles, balanceMap] = await Promise.all([
    db.role.findMany({ select: { id: true, name: true, nameFa: true } }),
    walletBalancesForUsers(users.map((u) => u.id)),
  ])
  return ok({
    roles,
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      roleId: u.roleId,
      roleName: u.roleRef?.name || null,
      status: u.status,
      createdAt: u.createdAt,
      walletBalance: Math.round((u.walletBalance || 0) * 100) / 100, // legacy USD compatibility
      walletBalances: balanceMap.get(u.id) || [],
      orders: u._count.orders,
      subs: u._count.subscriptions,
      tickets: u._count.tickets,
    })),
  })
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'users.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const email = String(body?.email || '').trim().toLowerCase()
  const name = String(body?.name || '').trim()
  const role = body?.role === 'ADMIN' ? 'ADMIN' : 'CUSTOMER'
  if (!/^\S+@\S+\.\S+$/.test(email)) return err('ایمیل معتبر نیست')

  const exists = await db.user.findUnique({ where: { email } })
  if (exists) return err('این ایمیل قبلاً ثبت شده است')

  const password = String(body?.password || '') || randomPassword(10)
  const user = await db.user.create({
    data: { email, name, role, roleId: role === 'ADMIN' && body?.roleId ? Number(body.roleId) : null, passwordHash: await bcrypt.hash(password, 10) },
  })
  await auditAdmin({ req, actor: admin, action: 'user.create', targetType: 'user', targetId: user.id, metadata: { email: user.email, role: user.role, roleId: user.roleId } })
  return ok({ id: user.id, email: user.email, generatedPassword: body?.password ? undefined : password })
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'users.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  if (!id) return err('invalid id')
  const data: Record<string, unknown> = {}
  if (body?.status === 'ACTIVE' || body?.status === 'BANNED') data.status = body.status
  if (body?.role === 'ADMIN' || body?.role === 'CUSTOMER') data.role = body.role
  if (body?.roleId !== undefined) data.roleId = body.roleId ? Number(body.roleId) : null
  if (typeof body?.note === 'string') data.note = body.note
  if (typeof body?.name === 'string') data.name = body.name
  if (typeof body?.password === 'string' && body.password.length >= 6) {
    data.passwordHash = await bcrypt.hash(body.password, 10)
  }
  const user = await db.user.update({ where: { id }, data })
  await auditAdmin({ req, actor: admin, action: 'user.update', targetType: 'user', targetId: user.id, metadata: { fields: Object.keys(data), status: user.status, role: user.role, roleId: user.roleId } })
  return ok({ id: user.id, status: user.status, role: user.role })
}
