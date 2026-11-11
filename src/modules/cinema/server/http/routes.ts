import { sectionSettingsRead, sectionSettingsWrite } from '@/modules/settings/server/http/section-history'
import type { NextRequest } from 'next/server'
import { ok } from '@/platform/http/response'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { auditAdmin } from '@/platform/audit/server'
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

/** GET /api/admin/cinema/subtitles → what the look for subtitles beside and inside video files has found. */
export async function GET_subtitles(req: NextRequest) {
  const g = await cinemaAdmin(req)
  if ('response' in g) return g.response
  const [{ foundSubtitleStatus }, { cleanTools }] = await Promise.all([import('@/modules/media/server/found-subtitles/scan'), import('@/modules/downloads/server/clean')])
  const [status, tools] = await Promise.all([foundSubtitleStatus(), cleanTools()])
  return ok({ ...status, ffmpeg: tools.ffmpeg })
}

/** POST /api/admin/cinema/subtitles { again } → queues a look at existing film and episode files. */
export async function POST_subtitles(req: NextRequest) {
  const g = await adminGuard(req, 'cinema', ['cinema.manage', 'settings.manage'])
  if ('response' in g) return g.response
  const body = await req.json().catch(() => ({})) as { again?: unknown }
  const { startSubtitleBackfill } = await import('@/modules/media/server/found-subtitles/scan')
  const result = await startSubtitleBackfill(body.again === true)
  await auditAdmin({ req, actor: g.admin, action: 'cinema.subtitles.scan', targetType: 'BackgroundJob', targetId: result.id, metadata: { again: body.again === true, started: result.started } })
  return ok(result)
}
