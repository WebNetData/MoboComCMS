import { ALL_PERMISSIONS } from '@/modules/identity/rbac'
import { siteGroupsOf } from '@/modules/account/server/site-groups'

/**
 * Who stays in while the whole site is closed. Full-access staff always, so the owner cannot be locked out; anyone else,
 * section managers too, only if named or in a named group. Read from the account as it is now.
 */
export async function opensDuringMaintenance(account: { id: number; role: string; roleId?: number | null; permissions: readonly string[] | null } | null, site: { users: readonly number[]; groups: readonly string[] }) {
  if (!account) return false
  if (account.role === 'ADMIN' && (account.roleId == null || account.permissions === null || ALL_PERMISSIONS.every((permission) => account.permissions?.includes(permission)))) return true
  if (site.users.includes(account.id)) return true
  return site.groups.length > 0 && (await siteGroupsOf(account.id, site.groups)).length > 0
}
