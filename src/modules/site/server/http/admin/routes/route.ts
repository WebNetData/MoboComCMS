import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { getModuleStates } from '@/extensions/server/modules'
import { RouteAliasError, loadRouteAliases, routableSections, saveRouteAliases } from '@/modules/site/server/routes'

/** GET /api/admin/site/routes — every routable section with its current public address. */
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('دسترسی مجاز نیست', 403)
  const [aliases, states] = await Promise.all([loadRouteAliases(), getModuleStates()])
  return ok({ aliases, sections: routableSections().map((section) => ({ ...section, enabled: states[section.module] !== false, alias: aliases[section.base] || '' })) })
}

/** PUT /api/admin/site/routes { "/games": "/game", … } — publish sections under new addresses (old ones redirect). */
export async function PUT(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('دسترسی مجاز نیست', 403)
  const body = await req.json().catch(() => null)
  const before = await loadRouteAliases()
  try {
    const aliases = await saveRouteAliases(body?.aliases ?? body)
    await auditAdmin({ req, actor: admin, action: 'site.routes.update', targetType: 'setting', targetId: 0, metadata: { before, after: aliases } })
    return ok({ aliases })
  } catch (error) {
    if (error instanceof RouteAliasError) return err(error.message, 400)
    throw error
  }
}
