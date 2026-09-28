import type { NextRequest } from 'next/server'
import { ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { musicDashboard, getMusicSettings, saveMusicSettings, musicPickers } from '@/modules/music/server/admin'

const musicAdmin = (req: NextRequest) => adminGuard(req, 'music', ['music.manage', 'cms.posts'])

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
  const [settings, picker] = await Promise.all([getMusicSettings(), (async () => (await musicPickers()))()])
  return ok({ settings, picker })
}

/** POST /api/admin/music/settings */
export async function POST_settings(req: NextRequest) {
  const g = await adminGuard(req, 'music', ['music.manage', 'settings.manage'])
  if ('response' in g) return g.response
  const settings = await saveMusicSettings(await req.json().catch(() => ({})))
  await auditAdmin({ req, actor: g.admin, action: 'music.settings.update', targetType: 'setting', targetId: 0, metadata: { rails: settings.rails.filter((rail) => rail.enabled).length } })
  return ok({ settings })
}
