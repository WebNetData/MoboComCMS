import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { visitorHash } from '@/platform/http/visitor'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { getViewer } from '@/modules/membership/server/membership'
import { REPORT_REASONS } from '@/modules/downloads/domain/downloads'
import { getDownloadSettings, publicDownloadSettings, saveDownloadSettings } from '@/modules/downloads/server/guard'
import { DownloadError, downloadStats, probeLink, reportLink, reportQueue, resolveLinkReports } from '@/modules/downloads/server/admin'

type Ctx = { params: Promise<{ id: string }> }

function failure(error: unknown) {
  if (error instanceof DownloadError) return err(error.message, error.status)
  console.error('[downloads]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}

/** POST /api/media/link/:id/report { reason, note } — open to guests (rate limited). */
export async function POST_report(req: NextRequest, { params }: Ctx) {
  const linkId = Number((await params).id)
  if (!Number.isSafeInteger(linkId) || linkId <= 0) return err('invalid id')
  const body = (await req.json().catch(() => null)) || {}
  const viewer = await getViewer()
  try {
    return ok(await reportLink({ linkId, userId: viewer.userId, visitor: visitorHash(req.headers), reason: body.reason, note: body.note }), 201)
  } catch (error) { return failure(error) }
}

/** GET /api/admin/downloads — settings, stats and the broken-link queue. */
export async function GET(req: NextRequest) {
  const g = await adminGuard(req, 'download-guard', ['downloads.manage', 'settings.manage'])
  if ('response' in g) return g.response
  const [settings, stats, queue] = await Promise.all([getDownloadSettings(), downloadStats(), reportQueue()])
  return ok({ settings: publicDownloadSettings(settings), stats, queue, reasons: REPORT_REASONS })
}

/** PATCH /api/admin/downloads { ...settings } */
export async function PATCH(req: NextRequest) {
  const g = await adminGuard(req, 'download-guard', ['downloads.manage', 'settings.manage'])
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  const saved = await saveDownloadSettings(body)
  await auditAdmin({ req, actor: g.admin, action: 'downloads.settings.update', targetType: 'setting', targetId: 'downloads.config.v1', metadata: { hosts: saved.hosts.map((host) => host.host) } })
  return ok({ settings: publicDownloadSettings(saved) })
}

/** POST /api/admin/downloads { action: fixed | dismiss | disable | enable | probe, linkId } */
export async function POST(req: NextRequest) {
  const g = await adminGuard(req, 'download-guard', ['downloads.manage', 'settings.manage'])
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  const linkId = Number(body.linkId)
  if (!Number.isSafeInteger(linkId) || linkId <= 0) return err('invalid link')
  try {
    if (body.action === 'probe') return ok(await probeLink(linkId))
    if (!['fixed', 'dismiss', 'disable', 'enable'].includes(body.action)) return err('invalid action')
    const result = await resolveLinkReports(linkId, body.action)
    await auditAdmin({ req, actor: g.admin, action: `downloads.link.${body.action}`, targetType: 'media-link', targetId: linkId })
    return ok(result)
  } catch (error) { return failure(error) }
}
