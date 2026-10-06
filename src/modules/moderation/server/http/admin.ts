import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireAdmin } from '@/modules/identity/server/access'
import { hasPermission } from '@/modules/identity/rbac'
import { getModuleStates } from '@/extensions/server/modules'
import { visibleSources } from '@/modules/moderation/domain/queue'
import { moderationQueue } from '@/modules/moderation/server/queue'

/** GET /api/admin/moderation — what waits for a staff decision, limited to what this staff member may moderate. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return err('forbidden', 403)
  // Same rule as requirePerm: an administrator without a role is unrestricted.
  const permissions = admin.permissions
  const can = (permission: string) => !permissions || permissions.length === 0 ? admin.roleId == null : hasPermission(permissions, permission)
  const states = await getModuleStates()
  if (!visibleSources(states, can).length) return err('forbidden', 403)
  const response = ok(await moderationQueue(states, can))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
