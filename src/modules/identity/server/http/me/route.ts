import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { adminNeedsTwoFactor, requireUser } from '@/modules/identity/server/access'
import { walletBalances } from '@/modules/wallet/server/wallet'
import { parseResellerPermissions, RESELLER_PERMISSIONS } from '@/modules/reseller/server/reseller'

/** Current user with freshly resolved role + permissions (used by the panel shells). */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth) return err('unauthorized', 401)
  const user = await db.user.findUnique({
    where: { id: auth.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      roleId: true,
      avatarColor: true,
      walletBalance: true,
      roleRef: { select: { name: true, nameFa: true, nameEn: true } },
    },
  })
  if (!user) return err('unauthorized', 401)

  const balances = await walletBalances(user.id)

  // resellers reach their own panel without any admin permission
  const reseller = await db.reseller.findUnique({ where: { userId: user.id }, select: { id: true, active: true } })
  const membership = reseller ? null : await db.resellerMember.findUnique({ where: { userId: user.id }, include: { reseller: { select: { active: true } } } })
  const teamActive = Boolean(membership?.active && membership.reseller.active)

  return ok({
    isReseller: Boolean(reseller || teamActive),
    resellerActive: Boolean(reseller?.active || teamActive),
    resellerIsOwner: Boolean(reseller),
    resellerPermissions: reseller ? [...RESELLER_PERMISSIONS] : teamActive ? parseResellerPermissions(membership?.permissions || '') : [],
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    roleId: user.roleId,
    walletBalance: balances.find((item) => item.currency === 'USD')?.balance || 0,
    walletBalances: balances.map((item) => ({ currency: item.currency, balance: item.balance })),
    roleName: user.roleRef?.name || null,
    roleLabel: user.roleRef ? (user.roleRef.nameFa || user.roleRef.nameEn || user.roleRef.name) : null,
    permissions: auth.permissions,
    twoFactor: !!auth.twoFactor,
    needsTwoFactor: await adminNeedsTwoFactor(auth),
  })
}
