import type { NextRequest } from 'next/server'
import { ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { softwareDashboard, getSoftwareSettings, saveSoftwareSettings, softwarePicker } from '@/modules/software/server/admin'

const softwareAdmin = (req: NextRequest) => adminGuard(req, 'software', ['software.manage', 'cms.posts'])

/** GET /api/admin/software/dashboard */
export async function GET_dashboard(req: NextRequest) {
  const g = await softwareAdmin(req)
  if ('response' in g) return g.response
  return ok(await softwareDashboard())
}

/** GET /api/admin/software/settings → { settings, picker } */
export async function GET_settings(req: NextRequest) {
  const g = await softwareAdmin(req)
  if ('response' in g) return g.response
  const [settings, picker] = await Promise.all([getSoftwareSettings(), (async () => ({ titles: await softwarePicker() }))()])
  return ok({ settings, picker })
}

/** POST /api/admin/software/settings */
export async function POST_settings(req: NextRequest) {
  const g = await adminGuard(req, 'software', ['software.manage', 'settings.manage'])
  if ('response' in g) return g.response
  const settings = await saveSoftwareSettings(await req.json().catch(() => ({})))
  await auditAdmin({ req, actor: g.admin, action: 'software.settings.update', targetType: 'setting', targetId: 0, metadata: { rails: settings.rails.filter((rail) => rail.enabled).length } })
  return ok({ settings })
}
