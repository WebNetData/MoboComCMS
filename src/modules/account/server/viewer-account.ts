import { ALL_PERMISSIONS } from '@/modules/identity/rbac'
import { resolveCurrentUser } from '@/modules/identity/server/access'

export type ViewerAccount = { id: number; role: string; roleId: number | null; permissions: readonly string[] }

/** A user's standing as it is now, read from storage, or null for an account that cannot be used. */
export async function accountOf(userId: number): Promise<ViewerAccount | null> {
  const user = await resolveCurrentUser(userId, undefined)
  if (!user) return null
  const permissions = user.role !== 'ADMIN' ? [] : user.roleId == null ? ALL_PERMISSIONS : user.permissions || []
  return { id: userId, role: user.role, roleId: user.roleId ?? null, permissions }
}
