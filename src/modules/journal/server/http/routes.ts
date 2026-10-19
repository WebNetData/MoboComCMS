import { sectionSettingsRead, sectionSettingsWrite } from '@/modules/settings/server/http/section-history'
import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { journalDashboard, getJournalSettings, saveJournalSettings, journalPickers, searchJournalPicker } from '@/modules/journal/server/admin'
import { searchPostLinkItems, searchPostLinkProducts, parsePostLinkRefs } from '@/modules/journal/server/item-links'

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
  return sectionSettingsRead(async () => {
    const settings = await getJournalSettings(true)
    const picker = await journalPickers([...settings.heroIds, ...settings.editorIds])
    return { settings, picker }
  })
}

/** GET /api/admin/journal/picker?q=... */
export async function GET_picker(req: NextRequest) {
  const g = await journalAdmin(req)
  if ('response' in g) return g.response
  return ok({ posts: await searchJournalPicker(new URL(req.url).searchParams.get('q')) })
}

/** GET /api/admin/journal/link-items?type=game&q=...&refs=product:5,game:3 */
export async function GET_linkItems(req: NextRequest) {
  const g = await journalAdmin(req)
  if ('response' in g) return g.response
  const params = new URL(req.url).searchParams
  const refs = parsePostLinkRefs(params.get('refs'))
  if (!refs) return err('invalid refs', 400)
  return ok(await searchPostLinkItems(params.get('type'), params.get('q'), refs))
}

/** GET /api/admin/journal/link-products?q=...&ids=1,2 — legacy product-only picker kept for older admin clients. */
export async function GET_linkProducts(req: NextRequest) {
  const g = await journalAdmin(req)
  if ('response' in g) return g.response
  const params = new URL(req.url).searchParams
  const rawIds = params.get('ids') || ''
  const parts = rawIds ? rawIds.split(',') : []
  if (parts.length > 12 || parts.some((part) => !/^[1-9]\d*$/.test(part) || !Number.isSafeInteger(Number(part)))) return err('invalid ids', 400)
  const ids = [...new Set(parts.map(Number))]
  return ok(await searchPostLinkProducts(params.get('q'), ids))
}

/** POST /api/admin/journal/settings */
export async function POST_settings(req: NextRequest) {
  const g = await adminGuard(req, 'journal', ['cms.posts', 'settings.manage'])
  if ('response' in g) return g.response
  return sectionSettingsWrite(req, g.admin, saveJournalSettings)
}
