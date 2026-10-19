import { sectionSettingsRead, sectionSettingsWrite } from '@/modules/settings/server/http/section-history'
import type { NextRequest } from 'next/server'
import { ok } from '@/platform/http/response'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { musicDashboard, getMusicSettings, saveMusicSettings, musicPickers } from '@/modules/music/server/admin'

const musicAdmin = (req: NextRequest) => adminGuard(req, 'music', ['music.manage'])

/** GET /api/admin/music/dashboard */
export async function GET_dashboard(req: NextRequest) {
  const g = await musicAdmin(req)
  if ('response' in g) return g.response
  return ok(await musicDashboard())
}

/** GET /api/admin/music/settings → { settings, picker } */
export async function GET_settings(req: NextRequest) {
  const g = await musicAdmin(req)
  if ('response' in g) return g.response
  return sectionSettingsRead(async () => {
    const [settings, picker] = await Promise.all([getMusicSettings(true), musicPickers()])
    return { settings, picker }
  })
}

/** POST /api/admin/music/settings */
export async function POST_settings(req: NextRequest) {
  const g = await adminGuard(req, 'music', ['music.manage', 'settings.manage'])
  if ('response' in g) return g.response
  return sectionSettingsWrite(req, g.admin, saveMusicSettings)
}
