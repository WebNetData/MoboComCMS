import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { softwareDashboard, getSoftwareSettings, saveSoftwareSettings, softwarePicker } from '@/modules/software/server/admin'
import { deleteSoftwareRelease, saveSoftwareRelease, softwareReleases, SoftwareReleaseError } from '@/modules/software/server/releases'
import { db } from '@/platform/database/prisma'

const softwareAdmin = (req: NextRequest) => adminGuard(req, 'software', ['software.manage', 'cms.posts'])
const positive = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0 }
const failure = (error: unknown) => error instanceof SoftwareReleaseError ? err(error.message, error.status) : (console.error('[software releases]', error), err('خطای داخلی؛ دوباره تلاش کنید', 500))

/** GET /api/admin/software/releases?softwareId= */
export async function GET_releases(req: NextRequest) {
  const g = await softwareAdmin(req)
  if ('response' in g) return g.response
  const softwareId = positive(req.nextUrl.searchParams.get('softwareId'))
  if (!softwareId) {
    if (req.nextUrl.searchParams.has('softwareId')) return err('نرم‌افزار نامعتبر است')
    const q = String(req.nextUrl.searchParams.get('q') || '').trim().slice(0, 80)
    const selectedId = positive(req.nextUrl.searchParams.get('selectedId'))
    const where = q ? { OR: [{ title: { contains: q } }, { titleEn: { contains: q } }, { slug: { contains: q.toLowerCase() } }] } : {}
    const [rows, selected] = await Promise.all([
      db.softwareTitle.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, title: true, slug: true, status: true } }),
      selectedId ? db.softwareTitle.findUnique({ where: { id: selectedId }, select: { id: true, title: true, slug: true, status: true } }) : null,
    ])
    return ok({ picker: selected && !rows.some((row) => row.id === selected.id) ? [selected, ...rows] : rows })
  }
  try { return ok(await softwareReleases(softwareId, Number(req.nextUrl.searchParams.get('page')) || 1, req.nextUrl.searchParams.get('size') || 20)) } catch (error) { return failure(error) }
}

/** POST /api/admin/software/releases */
export async function POST_releases(req: NextRequest) {
  const g = await softwareAdmin(req)
  if ('response' in g) return g.response
  const input = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const softwareId = positive(input?.softwareId)
  if (!softwareId || !input) return err('نرم‌افزار نامعتبر است')
  try {
    const result = await saveSoftwareRelease(softwareId, input)
    await auditAdmin({ req, actor: g.admin, action: result.created ? 'software.release.create' : 'software.release.update', targetType: 'software_release', targetId: result.id, metadata: { softwareId, version: String(input.version || '').slice(0, 60) } })
    return ok(result, result.created ? 201 : 200)
  } catch (error) { return failure(error) }
}

/** DELETE /api/admin/software/releases?softwareId=&id= */
export async function DELETE_releases(req: NextRequest) {
  const g = await softwareAdmin(req)
  if ('response' in g) return g.response
  const softwareId = positive(req.nextUrl.searchParams.get('softwareId'))
  const id = positive(req.nextUrl.searchParams.get('id'))
  if (!softwareId || !id) return err('شناسه نامعتبر است')
  try {
    const row = await deleteSoftwareRelease(softwareId, id)
    await auditAdmin({ req, actor: g.admin, action: 'software.release.delete', targetType: 'software_release', targetId: id, metadata: { softwareId, version: row.version } })
    return ok({ deleted: true })
  } catch (error) { return failure(error) }
}

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
