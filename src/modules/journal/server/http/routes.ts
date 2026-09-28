import type { NextRequest } from 'next/server'
import { ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { journalDashboard, getJournalSettings, saveJournalSettings, journalPickers } from '@/modules/journal/server/admin'

const journalAdmin = (req: NextRequest) => adminGuard(req, 'journal', ['cms.posts'])

/** GET /api/admin/journal/dashboard */
export async function GET_dashboard(req: NextRequest) {
  const g = await journalAdmin(req)
  if ('response' in g) return g.response
  return ok(await journalDashboard())
}

/** GET /api/admin/journal/settings → { settings, picker } */
export async function GET_settings(req: NextRequest) {
  const g = await journalAdmin(req)
  if ('response' in g) return g.response
  const [settings, picker] = await Promise.all([getJournalSettings(), (async () => (await journalPickers()))()])
  return ok({ settings, picker })
}

/** POST /api/admin/journal/settings */
export async function POST_settings(req: NextRequest) {
  const g = await adminGuard(req, 'journal', ['cms.posts', 'settings.manage'])
  if ('response' in g) return g.response
  const settings = await saveJournalSettings(await req.json().catch(() => ({})))
  await auditAdmin({ req, actor: g.admin, action: 'journal.settings.update', targetType: 'setting', targetId: 0, metadata: { rails: settings.rails.filter((rail) => rail.enabled).length } })
  return ok({ settings })
}
