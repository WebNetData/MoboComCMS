import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { accountChangeRefusal } from '@/modules/identity/server/staff-guard'
import { findPhoneCustomer, PhoneCustomerError } from '@/modules/identity/server/phone-customer'
import { auditAdmin } from '@/platform/audit/server'

/**
 * The team directory (owner 2026-11-13, docs/agent/handoffs/ADMIN_ORGANIZATION.md): who works in the Admin and with
 * which role. Adding someone always names a role — staff without one would be full access — and every change goes
 * through the same rule as the users page (accountChangeRefusal: roles.manage, never beyond the actor's own access,
 * never one's own standing, full access only from a full administrator). Accounts are found, never created, here.
 */
const team = (req: NextRequest) => requirePerm(req, 'roles.manage')
const STAFF = { id: true, name: true, email: true, phone: true, status: true, roleId: true, createdAt: true } as const
const userId = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0 }

/** GET — the staff and the roles; ?find=<email or mobile> — one existing account to add. */
export async function GET(req: NextRequest) {
  const admin = await team(req)
  if (!admin) return err('forbidden', 403)
  const find = (req.nextUrl.searchParams.get('find') || '').trim()
  if (find) {
    try {
      const account = find.includes('@')
        ? await db.user.findFirst({ where: { email: find.toLowerCase() }, select: { id: true, name: true, email: true, phone: true, role: true, roleId: true, status: true } })
        : await findPhoneCustomer(find).then(row => row && db.user.findUnique({ where: { id: row.id }, select: { id: true, name: true, email: true, phone: true, role: true, roleId: true, status: true } }))
      return ok({ account: account || null })
    } catch (error) {
      if (error instanceof PhoneCustomerError) return err(error.message, 400)
      throw error
    }
  }
  const [staff, roles] = await Promise.all([
    db.user.findMany({ where: { role: 'ADMIN' }, select: STAFF, orderBy: [{ roleId: 'asc' }, { id: 'asc' }], take: 500 }),
    db.role.findMany({ select: { id: true, name: true, nameFa: true, permissions: true, isSystem: true }, orderBy: { id: 'asc' } }),
  ])
  return ok({ staff, roles, me: admin.id })
}

async function setStanding(req: NextRequest, action: 'team.add' | 'team.role' | 'team.remove', id: number, role: 'ADMIN' | 'CUSTOMER', roleId: number | null) {
  const admin = await team(req)
  if (!admin) return err('forbidden', 403)
  if (!id) return err('کاربر را انتخاب کنید')
  if (role === 'ADMIN' && !roleId) return err('یک نقش انتخاب کنید؛ کارمند بدون نقش دسترسی کامل می‌گیرد')
  const target = await db.user.findUnique({ where: { id }, select: { role: true, roleId: true, status: true } })
  if (!target) return err('کاربر پیدا نشد', 404)
  if (action === 'team.add' && target.role === 'ADMIN') return err('این کاربر همین حالا جزو کارکنان است؛ نقشش را در فهرست تغییر دهید', 409)
  if (action !== 'team.add' && target.role !== 'ADMIN') return err('این کاربر جزو کارکنان نیست', 409)
  if (role === 'ADMIN' && target.status !== 'ACTIVE') return err('حساب این کاربر فعال نیست')
  const refusal = await accountChangeRefusal(admin, id, { role, roleId })
  if (refusal) return err(refusal, 403)
  // Only if nobody changed this account's standing meanwhile.
  const changed = await db.user.updateMany({ where: { id, role: target.role, roleId: target.roleId }, data: { role, roleId: role === 'ADMIN' ? roleId : null } })
  if (changed.count !== 1) return err('این حساب هم‌زمان تغییر کرد؛ صفحه را تازه کنید', 409)
  await auditAdmin({ req, actor: admin, action, targetType: 'user', targetId: id, metadata: { before: { role: target.role, roleId: target.roleId }, after: { role, roleId: role === 'ADMIN' ? roleId : null } } })
  return ok({ id, role, roleId: role === 'ADMIN' ? roleId : null })
}

/** POST { userId, roleId } — an existing account joins the staff with this role. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  return setStanding(req, 'team.add', userId(body?.userId), 'ADMIN', userId(body?.roleId) || null)
}

/** PATCH { userId, roleId } — a staff member's role changes. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  return setStanding(req, 'team.role', userId(body?.userId), 'ADMIN', userId(body?.roleId) || null)
}

/** DELETE ?userId= — leaves the staff; the account stays as a member. */
export async function DELETE(req: NextRequest) {
  return setStanding(req, 'team.remove', userId(req.nextUrl.searchParams.get('userId')), 'CUSTOMER', null)
}
