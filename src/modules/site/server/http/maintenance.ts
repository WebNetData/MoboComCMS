import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { DEFAULT_MESSAGE, DEFAULT_TITLE, MAINTENANCE_LIMITS, MAINTENANCE_SECTIONS, isMaintenanceSection } from '@/modules/site/domain/maintenance'
import { loadMaintenance, maintenanceBases, saveSectionMaintenance } from '@/modules/site/server/maintenance'

const view = async (fresh: boolean) => {
  const state = await loadMaintenance(fresh), bases = maintenanceBases()
  return { sections: MAINTENANCE_SECTIONS.map((section) => ({ id: section.id, label: section.label, paths: bases[section.id], ...state[section.id] })), defaults: { title: DEFAULT_TITLE, message: DEFAULT_MESSAGE }, limits: MAINTENANCE_LIMITS }
}

/** GET /api/admin/maintenance — every section with its state and words (site settings). */
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  return ok(await view(true))
}

/** PUT /api/admin/maintenance { section, enabled?, title?, message? } — one section at a time. */
export async function PUT(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  if (!isMaintenanceSection(body?.section)) return err('unknown section')
  const change: Record<string, unknown> = {}
  if (body.enabled !== undefined) { if (typeof body.enabled !== 'boolean') return err('enabled must be true or false'); change.enabled = body.enabled }
  for (const field of ['title', 'message'] as const) if (body[field] !== undefined) {
    if (typeof body[field] !== 'string') return err(`${field} must be text`)
    if (body[field].trim().length > MAINTENANCE_LIMITS[field]) return err(`${field} is longer than ${MAINTENANCE_LIMITS[field]} characters`)
    change[field] = body[field]
  }
  if (!Object.keys(change).length) return err('nothing to change')
  const state = await saveSectionMaintenance(body.section, change)
  await auditAdmin({ req, actor: admin, action: 'maintenance.section', targetType: 'setting', targetId: `maintenance:${body.section}`, metadata: { section: body.section, enabled: state[body.section as keyof typeof state].enabled, fields: Object.keys(change) } })
  return ok(await view(false))
}
