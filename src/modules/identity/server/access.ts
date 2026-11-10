import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { authSecret } from '@/platform/config/env'
import { db } from '@/platform/database/prisma'
import { hasPermission, parsePermissions } from '@/modules/identity/rbac'
import { sessionRevoked, staffTwoFactorRule } from '@/modules/identity/domain/account-security'
import { logEvent } from '@/platform/observability/logger'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'

// Match NextAuth's startup secret without importing the authentication-provider graph.
const tokenSecret = authSecret()

export interface AuthedUser {
  id: number
  email: string
  role: string
  roleId?: number | null
  permissions: string[] | null
  /** Whether the account has 2-step sign-in on. */
  twoFactor?: boolean
}

// The "staff must use 2-step sign-in" switch, cached briefly (read on every admin request). Fail-safe: a policy that
// cannot be read (database error, corrupt value) holds staff without 2-step back instead of letting them through.
let policyCache: { at: number; required: boolean } | null = null
async function adminTwoFactorRequired(reader: Pick<typeof db, 'setting'> = db) {
  const shared = reader === db
  if (shared && policyCache && Date.now() - policyCache.at < 30_000) return policyCache.required
  let row: { value: string } | null
  try {
    row = await reader.setting.findUnique({ where: { key: 'security.policy.v1' } })
  } catch (error) {
    if (!shared) throw new Error('Security policy unavailable')
    // Not cached: the next request reads again once the database answers.
    logEvent('warn', 'security.policy.unreadable', { reason: 'read-failed', errorName: error instanceof Error ? error.name : 'Unknown' })
    return true
  }
  const rule = staffTwoFactorRule(row?.value)
  if (!rule.readable) {
    if (!shared) throw new Error('Security policy unavailable')
    logEvent('warn', 'security.policy.unreadable', { reason: 'invalid-value' })
  }
  if (shared) policyCache = { at: Date.now(), required: rule.required }
  return rule.required
}
export const clearAdminPolicyCache = () => { policyCache = null }

/** Whether this admin is held back until they turn on 2-step sign-in. */
export async function adminNeedsTwoFactor(user: AuthedUser, reader: Pick<typeof db, 'setting'> = db) {
  return user.role === 'ADMIN' && !user.twoFactor && await adminTwoFactorRequired(reader)
}

export function getRawToken(req: NextRequest) {
  return getToken({ req, secret: tokenSecret })
}

/** A command may resolve identity/policy in its transaction; ordinary callers retain the default reader. */
export async function requireUser(req: NextRequest, reader: Pick<typeof db, 'user' | 'accessRestriction'> = db): Promise<AuthedUser | null> {
  const token = await getRawToken(req)
  if (!token?.uid) return null

  return resolveCurrentUser(Number(token.uid), token.authAt, reader)
}

/** Current identity for a previously authorized human action, including queued work. */
export async function resolveCurrentUser(userId: number, authAt: unknown, reader: Pick<typeof db, 'user' | 'accessRestriction'> = db): Promise<AuthedUser | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null

  // Resolve current role/status from storage so revocation takes effect immediately.
  const current = await reader.user.findUnique({
    where: { id: userId },
    include: { roleRef: true },
  })
  if (!current || current.status !== 'ACTIVE') return null
  if (await globalAuthenticationDenied(current.id, new Date(), reader)) return null
  // A password reset signs out every session that started before it.
  if (sessionRevoked(authAt, current.passwordChangedAt)) return null

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

export async function requireAdmin(req: NextRequest, reader: Pick<typeof db, 'user' | 'accessRestriction' | 'setting'> = db): Promise<AuthedUser | null> {
  const user = await requireUser(req, reader)
  if (user?.role !== 'ADMIN') return null
  // With the staff 2-step policy on, the admin API stays closed until it is set up.
  return await adminNeedsTwoFactor(user, reader) ? null : user
}

/** Legacy admin without a roleId is the super-admin compatibility path. */
export async function requirePerm(req: NextRequest, permission: string, reader: Pick<typeof db, 'user' | 'accessRestriction' | 'setting'> = db): Promise<AuthedUser | null> {
  const user = await requireAdmin(req, reader)
  if (!user) return null

  if (user.permissions === null || user.permissions.length === 0) {
    return user.roleId == null ? user : null
  }

  return hasPermission(user.permissions, permission) ? user : null
}

/**
 * The caller as a manager or an author of one section (see `contentScope`): `authorId` is null for a manager and
 * the caller's own id for an author, who is then held to the items they created. Null when they are neither.
 */
export async function requireContentScope(req: NextRequest, manage: string, author: string | null, reader: Pick<typeof db, 'user' | 'accessRestriction' | 'setting'> = db): Promise<{ admin: AuthedUser; authorId: number | null } | null> {
  const manager = await requirePerm(req, manage, reader)
  if (manager) return { admin: manager, authorId: null }
  const writer = author ? await requirePerm(req, author, reader) : null
  // A caller without a role passes every requirePerm and was returned above; here the permission is really held.
  return writer ? { admin: writer, authorId: writer.id } : null
}

export async function effectivePermissions(userId: number): Promise<string[] | null> {
  const user = await db.user.findUnique({ where: { id: userId }, include: { roleRef: true } })
  if (!user || user.role !== 'ADMIN' || !user.roleId) return null
  return parsePermissions(user.roleRef?.permissions || '')
}
