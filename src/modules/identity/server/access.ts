import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/modules/identity/auth'
import { db } from '@/platform/database/prisma'
import { hasPermission, parsePermissions } from '@/modules/identity/rbac'

export interface AuthedUser {
  id: number
  email: string
  role: string
  roleId?: number | null
  permissions: string[] | null
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
  }
}

export async function requireAdmin(req: NextRequest): Promise<AuthedUser | null> {
  const user = await requireUser(req)
  return user?.role === 'ADMIN' ? user : null
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
