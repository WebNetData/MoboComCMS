import type { NextRequest } from 'next/server'
import { ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { cinemaDashboard, getCinemaSettings, saveCinemaSettings, cinemaPicker } from '@/modules/cinema/server/admin'

const cinemaAdmin = (req: NextRequest) => adminGuard(req, 'cinema', ['cinema.manage'])

/** GET /api/admin/cinema/dashboard */
export async function GET_dashboard(req: NextRequest) {
  const g = await cinemaAdmin(req)
  if ('response' in g) return g.response
  return ok(await cinemaDashboard())
}

/** GET /api/admin/cinema/settings → { settings, picker } */
export async function GET_settings(req: NextRequest) {
  const g = await cinemaAdmin(req)
  if ('response' in g) return g.response
  const [settings, picker] = await Promise.all([getCinemaSettings(), (async () => ({ titles: await cinemaPicker() }))()])
  return ok({ settings, picker })
}

/** POST /api/admin/cinema/settings */
export async function POST_settings(req: NextRequest) {
  const g = await adminGuard(req, 'cinema', ['cinema.manage', 'settings.manage'])
  if ('response' in g) return g.response
  const settings = await saveCinemaSettings(await req.json().catch(() => ({})))
  await auditAdmin({ req, actor: g.admin, action: 'cinema.settings.update', targetType: 'setting', targetId: 0, metadata: { rails: settings.rails.filter((rail) => rail.enabled).length } })
  return ok({ settings })
}
