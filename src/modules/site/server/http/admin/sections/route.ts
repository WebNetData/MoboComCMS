import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { listExtensionAdminState, saveExtensionState } from '@/extensions/server/state'
import { RouteAliasError, loadRouteAliases, saveRouting } from '@/modules/site/server/routes'
import { saveBusinessSettings } from '@/modules/businesses/server/businesses'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { getSectionNames, saveSectionName } from '@/modules/site/server/section-names'

// Section hub: every feature module that owns a public area — its address,
// on/off state, declared settings and admin menu — managed in one place.

async function sections() {
  const [rows, aliases, names] = await Promise.all([listExtensionAdminState(), loadRouteAliases(), getSectionNames()])
  return rows.filter((row) => row.manifest.kind === 'module' && row.manifest.adminMenu).map(({ manifest, state }) => ({
    // `name`/`nameEn` are what the site shows (the owner's name when set); `defaultName` is the built-in one.
    id: manifest.id, name: names[manifest.id]?.fa || manifest.name, nameEn: names[manifest.id]?.en || manifest.nameEn || '', defaultName: manifest.name, defaultNameEn: manifest.nameEn || '', customName: names[manifest.id] || { fa: '', en: '' }, description: manifest.description || '', icon: manifest.icon || 'grid', version: manifest.version,
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
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('دسترسی مجاز نیست', 403)
  const body = await req.json().catch(() => null) as { id?: unknown; enabled?: unknown; settings?: unknown; addresses?: unknown; names?: unknown } | null
  const id = String(body?.id || '')
  const section = (await sections()).find((row) => row.id === id)
  if (!section) return err('بخش پیدا نشد', 404)
  try {
    if (body?.addresses && typeof body.addresses === 'object') {
      const own = new Set(section.bases.map((row) => row.base))
      for (const base of Object.keys(body.addresses)) {
        if (!own.has(base)) return err(`مسیر ${base} متعلق به این بخش نیست`)
      }
      await saveRouting({ aliasPatch: body.addresses as Record<string, unknown> }, { req, actor: admin })
    }
    if (body?.names && typeof body.names === 'object' && !Array.isArray(body.names)) {
      const names = body.names as Record<string, unknown>
      await saveSectionName(id, { fa: typeof names.fa === 'string' ? names.fa : undefined, en: typeof names.en === 'string' ? names.en : undefined }, { req, actor: admin })
    }
    if (typeof body?.enabled === 'boolean' || (body?.settings && typeof body.settings === 'object')) {
      const input = { enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined, settings: body?.settings && typeof body.settings === 'object' ? body.settings as Record<string, unknown> : undefined }
      if (id === 'businesses') await saveBusinessSettings(req, admin, input)
      else await saveExtensionState(id, input)
    }
  } catch (error) {
    if (error instanceof RouteAliasError) return err(error.message, error.status)
    return err(error instanceof Error ? error.message : 'ذخیره نشد')
  }
  await auditAdmin({ req, actor: admin, action: 'site.section.update', targetType: 'extension', targetId: 0, metadata: { id, enabled: body?.enabled, addresses: body?.addresses, settings: body?.settings ? Object.keys(body.settings as object) : [] } })
  return ok({ section: (await sections()).find((row) => row.id === id) })
}
