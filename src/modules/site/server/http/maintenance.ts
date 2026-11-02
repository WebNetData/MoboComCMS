import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { sectionSettingsRevision } from '@/modules/settings/server/section-history'
import { sectionSettingsSaveWith } from '@/modules/settings/server/http/section-history'
import { db } from '@/platform/database/prisma'
import { DEFAULT_MESSAGE, DEFAULT_TITLE, MAINTENANCE_LIMITS, MAINTENANCE_MODES, MAINTENANCE_SECTIONS, SITE_LIMITS, isMaintenanceSection } from '@/modules/site/domain/maintenance'
import { loadMaintenance, maintenanceBases, saveSectionMaintenance, saveSiteMaintenance } from '@/modules/site/server/maintenance'
import { siteGroupCatalog } from '@/modules/account/server/site-groups'

const view = async (fresh: boolean) => {
  const state = await loadMaintenance(fresh), bases = maintenanceBases()
  const people = state.site.users.length ? await db.user.findMany({ where: { id: { in: state.site.users } }, select: { id: true, name: true, email: true } }) : []
  return { modes: MAINTENANCE_MODES, site: state.site, people, catalog: await siteGroupCatalog(), sections: MAINTENANCE_SECTIONS.map((section) => ({ id: section.id, label: section.label, paths: bases[section.id], ...state[section.id] })), defaults: { title: DEFAULT_TITLE, message: DEFAULT_MESSAGE }, limits: MAINTENANCE_LIMITS, settingsRevision: sectionSettingsRevision(state) }
}

/** GET /api/admin/maintenance — every section with its state and words (site settings). */
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  const who = String(req.nextUrl.searchParams.get('user') || '').trim().toLowerCase().slice(0, 190)
  if (who) {
    const user = await db.user.findFirst({ where: /^\d{1,9}$/.test(who) ? { id: Number(who) } : who.includes('@') ? { email: who } : { phone: who }, select: { id: true, name: true, email: true } })
    return user ? ok({ user }) : err('کاربری با این مشخصات پیدا نشد', 404)
  }
  return ok(await view(true))
}

/** PUT /api/admin/maintenance { section, enabled?, title?, message? } — one section at a time. */
export async function PUT(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  if (body?.site && typeof body.site === 'object' && !Array.isArray(body.site)) {
    const { title, message } = body.site
    if (typeof title === 'string' && title.trim().length > SITE_LIMITS.title) return err('title is too long')
    if (typeof message === 'string' && message.trim().length > SITE_LIMITS.message) return err('message is too long')
    return sectionSettingsSaveWith(req, admin, context => saveSiteMaintenance(body.site, context), () => view(false))
  }
  if (!isMaintenanceSection(body?.section)) return err('unknown section')
  const change: Record<string, unknown> = {}
  if (body.enabled !== undefined) { if (typeof body.enabled !== 'boolean') return err('enabled must be true or false'); change.enabled = body.enabled }
  if (body.mode !== undefined) { if (!MAINTENANCE_MODES.some((mode) => mode.id === body.mode)) return err('unknown mode'); change.mode = body.mode }
  for (const field of ['title', 'message'] as const) if (body[field] !== undefined) {
    if (typeof body[field] !== 'string') return err(`${field} must be text`)
    if (body[field].trim().length > MAINTENANCE_LIMITS[field]) return err(`${field} is longer than ${MAINTENANCE_LIMITS[field]} characters`)
    change[field] = body[field]
  }
  if (!Object.keys(change).length) return err('nothing to change')
  return sectionSettingsSaveWith(req, admin, context => saveSectionMaintenance(body.section, change, context), () => view(false))
}
