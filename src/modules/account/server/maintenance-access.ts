import { ALL_PERMISSIONS } from '@/modules/identity/rbac'
import { siteGroupsOf } from '@/modules/account/server/site-groups'
import { accountOf } from '@/modules/account/server/viewer-account'
import { loadMaintenance } from '@/modules/site/server/maintenance'
import { runsSection, type MaintenanceSectionId } from '@/modules/site/domain/maintenance'

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

/**
 * Whether a section in maintenance is closed to this person. A page is stopped by the proxy; this is for what a section
 * serves through a shared address or shows inside another section's page, so a closed section cannot be reached from elsewhere.
 */
export async function sectionClosedFor(section: MaintenanceSectionId, userId: number | null | undefined) {
  const state = await loadMaintenance().catch(() => null)
  if (!state?.[section]?.enabled) return false
  return !runsSection(userId ? await accountOf(userId) : null, section)
}
