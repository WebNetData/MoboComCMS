import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requireAdmin } from '@/modules/identity/server/access'
import { listExtensionAdminState } from '@/extensions/server/state'
import { disabledAdminPaths } from '@/extensions/server/modules'
import { getSectionNames } from '@/modules/site/server/section-names'

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return err('forbidden', 403)
  const [rows, names] = await Promise.all([listExtensionAdminState(), getSectionNames()])
  return ok({
    items: rows.filter(row => row.state.enabled).flatMap(row => (row.manifest.adminNavigation || []).map(item => ({ ...item, pluginId: row.manifest.id }))),
    // Each enabled feature module's own admin group (store, forum, games …), in manifest order.
    sections: rows.filter(row => row.state.enabled && row.manifest.adminMenu).map(row => ({
      id: row.manifest.id,
      // The owner's own section name (Admin › sections) wins over the built-in menu title.
      title: names[row.manifest.id]?.fa || row.manifest.adminMenu!.title || row.manifest.name,
      titleEn: names[row.manifest.id]?.en || row.manifest.adminMenu!.titleEn || row.manifest.nameEn || row.manifest.name,
      icon: row.manifest.adminMenu!.icon || row.manifest.icon || 'grid',
      order: row.manifest.adminMenu!.order ?? 100,
      area: row.manifest.adminMenu!.area ?? 'system',
      items: row.manifest.adminMenu!.items,
    })).sort((a, b) => a.order - b.order),
    // Core admin sections of disabled feature modules — hidden from the menu.
    disabledPaths: await disabledAdminPaths(),
  })
}
