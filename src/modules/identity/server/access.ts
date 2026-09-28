import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/modules/identity/auth'
import { db } from '@/platform/database/prisma'
import { hasPermission, parsePermissions } from '@/modules/identity/rbac'
import { sessionRevoked } from '@/modules/identity/domain/account-security'

export interface AuthedUser {
  id: number
  email: string
  role: string
  roleId?: number | null
  permissions: string[] | null
  /** Whether the account has 2-step sign-in on. */
  twoFactor?: boolean
}

// The "staff must use 2-step sign-in" switch, cached briefly (read on every admin request).
let policyCache: { at: number; required: boolean } | null = null
async function adminTwoFactorRequired() {
  if (policyCache && Date.now() - policyCache.at < 30_000) return policyCache.required
  const row = await db.setting.findUnique({ where: { key: 'security.policy.v1' } }).catch(() => null)
  let required = false
  try { required = row ? JSON.parse(row.value)?.requireAdmin2fa === true : false } catch { required = false }
  policyCache = { at: Date.now(), required }
  return required
}
export const clearAdminPolicyCache = () => { policyCache = null }

/** Whether this admin is held back until they turn on 2-step sign-in. */
export async function adminNeedsTwoFactor(user: AuthedUser) {
  return user.role === 'ADMIN' && !user.twoFactor && await adminTwoFactorRequired()
}

export function getRawToken(req: NextRequest) {
  return getToken({ req, secret: authOptions.secret })
}

export async function requireUser(req: NextRequest): Promise<AuthedUser | null> {
  const token = await getRawToken(req)
  if (!token?.uid) return null

  // Resolve current role/status from storage so revocation takes effect immediately.
  const current = await db.user.findUnique({
    where: { id: Number(token.uid) },
    include: { roleRef: true },
  })
  if (!current || current.status !== 'ACTIVE') return null
  // A password reset signs out every session that started before it.
  if (sessionRevoked(token.authAt, current.passwordChangedAt)) return null

  const permissions =
    current.role === 'ADMIN' && current.roleId != null
      ? parsePermissions(current.roleRef?.permissions || '')
      : null

  return {
    id: current.id,
    email: current.email,
    role: current.role,
    roleId: current.roleId,
    permissions: current.role === 'ADMIN' ? permissions : null,
    twoFactor: !!current.totpEnabledAt,
  }
}

export async function requireAdmin(req: NextRequest): Promise<AuthedUser | null> {
  const user = await requireUser(req)
  if (user?.role !== 'ADMIN') return null
  // With the staff 2-step policy on, the admin API stays closed until it is set up.
  return await adminNeedsTwoFactor(user) ? null : user
}

/** Legacy admin without a roleId is the super-admin compatibility path. */
export async function requirePerm(req: NextRequest, permission: string): Promise<AuthedUser | null> {
  const user = await requireAdmin(req)
  if (!user) return null

  if (user.permissions === null || user.permissions.length === 0) {
    return user.roleId == null ? user : null
  }

  return hasPermission(user.permissions, permission) ? user : null
}

export async function effectivePermissions(userId: number): Promise<string[] | null> {
  const user = await db.user.findUnique({ where: { id: userId }, include: { roleRef: true } })
  if (!user || user.role !== 'ADMIN' || !user.roleId) return null
  return parsePermissions(user.roleRef?.permissions || '')
}
