import { sectionSettingsRead, sectionSettingsWrite } from '@/modules/settings/server/http/section-history'
import type { NextRequest } from 'next/server'
import { ok } from '@/platform/http/response'
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
  return sectionSettingsRead(async () => {
    const [settings, titles] = await Promise.all([getCinemaSettings(true), cinemaPicker()])
    return { settings, picker: { titles } }
  })
}

/** POST /api/admin/cinema/settings */
export async function POST_settings(req: NextRequest) {
  const g = await adminGuard(req, 'cinema', ['cinema.manage', 'settings.manage'])
  if ('response' in g) return g.response
  return sectionSettingsWrite(req, g.admin, saveCinemaSettings)
}
