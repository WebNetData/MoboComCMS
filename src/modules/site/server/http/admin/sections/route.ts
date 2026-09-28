import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { listExtensionAdminState, saveExtensionState } from '@/extensions/server/state'
import { RouteAliasError, loadRouteAliases, saveRouteAliases } from '@/modules/site/server/routes'

// Section hub: every feature module that owns a public area — its address,
// on/off state, declared settings and admin menu — managed in one place.

async function sections() {
  const [rows, aliases] = await Promise.all([listExtensionAdminState(), loadRouteAliases()])
  return rows.filter((row) => row.manifest.kind === 'module' && row.manifest.adminMenu).map(({ manifest, state }) => ({
    id: manifest.id, name: manifest.name, nameEn: manifest.nameEn || '', description: manifest.description || '', icon: manifest.icon || 'grid', version: manifest.version,
    enabled: state.enabled, settings: state.settings, definitions: manifest.settings || [], menu: manifest.adminMenu!,
    order: manifest.adminMenu!.order ?? 100,
    bases: (manifest.publicPaths || []).filter((path) => /^\/[a-z0-9-]+$/.test(path)).map((base) => ({ base, alias: aliases[base] || '' })),
  })).sort((a, b) => a.order - b.order)
}

/** GET /api/admin/sections[?id=] */
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('دسترسی مجاز نیست', 403)
  const list = await sections()
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const one = list.find((section) => section.id === id)
    return one ? ok({ section: one }) : err('بخش پیدا نشد', 404)
  }
  return ok({ sections: list })
}

/** POST /api/admin/sections { id, enabled?, settings?, addresses?: { "/games": "game" } } */
export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('دسترسی مجاز نیست', 403)
  const body = await req.json().catch(() => null) as { id?: unknown; enabled?: unknown; settings?: unknown; addresses?: unknown } | null
  const id = String(body?.id || '')
  const section = (await sections()).find((row) => row.id === id)
  if (!section) return err('بخش پیدا نشد', 404)
  try {
    if (body?.addresses && typeof body.addresses === 'object') {
      const own = new Set(section.bases.map((row) => row.base))
      const next = { ...await loadRouteAliases() }
      for (const [base, alias] of Object.entries(body.addresses as Record<string, unknown>)) {
        if (!own.has(base)) return err(`مسیر ${base} متعلق به این بخش نیست`)
        next[base] = String(alias ?? '')
      }
      await saveRouteAliases(next)
    }
    if (typeof body?.enabled === 'boolean' || (body?.settings && typeof body.settings === 'object')) {
      await saveExtensionState(id, { enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined, settings: body?.settings && typeof body.settings === 'object' ? body.settings as Record<string, unknown> : undefined })
    }
  } catch (error) {
    if (error instanceof RouteAliasError) return err(error.message)
    return err(error instanceof Error ? error.message : 'ذخیره نشد')
  }
  await auditAdmin({ req, actor: admin, action: 'site.section.update', targetType: 'extension', targetId: 0, metadata: { id, enabled: body?.enabled, addresses: body?.addresses, settings: body?.settings ? Object.keys(body.settings as object) : [] } })
  return ok({ section: (await sections()).find((row) => row.id === id) })
}
