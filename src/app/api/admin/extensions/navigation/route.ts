import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireAdmin } from '@/modules/identity/server/access'
import { listExtensionAdminState } from '@/extensions/server/state'
import { disabledAdminPaths } from '@/extensions/server/modules'

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return err('forbidden', 403)
  const rows = await listExtensionAdminState()
  return ok({
    items: rows.filter(row => row.state.enabled).flatMap(row => (row.manifest.adminNavigation || []).map(item => ({ ...item, pluginId: row.manifest.id }))),
    // Core admin sections of disabled feature modules — hidden from the menu.
    disabledPaths: await disabledAdminPaths(),
  })
}
