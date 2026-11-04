import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { getModuleStates } from '@/extensions/server/modules'
import { RouteAliasError, loadRoutingState, routableSections, saveRouting } from '@/modules/site/server/routes'
import { PERMALINK_TYPES } from '@/shared/routing/permalinks'
import { originIsThisSite } from '@/platform/http/origin-policy'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('دسترسی مجاز نیست', 403)
  try {
    const [state, states] = await Promise.all([loadRoutingState(true), getModuleStates()])
    const response = ok({ ...state, types: PERMALINK_TYPES, sections: routableSections().map(section => ({ ...section, enabled: states[section.module] !== false, alias: state.aliases[section.base] || '' })) })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) { if (error instanceof RouteAliasError) return err(error.message, error.status); throw error }
}

/** Existing aliases body remains supported; templates/revision are additive. */
export async function PUT(req: NextRequest) {
  if (!originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('دسترسی مجاز نیست', 403)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return err('داده معتبر نیست', 400)
  try {
    const state = await saveRouting({ aliases: body.templates !== undefined ? body.aliases : body.aliases ?? body, templates: body.templates }, { req, actor: admin, expected: req.headers.get('if-match') || body.revision })
    return ok(state)
  } catch (error) { if (error instanceof RouteAliasError) return err(error.message, error.status); throw error }
}
