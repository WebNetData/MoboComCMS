import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { visitorHash } from '@/platform/http/visitor'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { CopyrightError } from '@/modules/copyright/domain/copyright'
import { decideReport, reportDetail, reportList, reportStatus, submitReport } from '@/modules/copyright/server/copyright'

function failure(error: unknown) {
  if (error instanceof CopyrightError) return err(error.message, error.status)
  console.error('[copyright]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}

/** POST /api/copyright { ...report } — public takedown request. */
export async function POST(req: NextRequest) {
  const off = await moduleGuard('copyright')
  if (off) return off
  const body = (await req.json().catch(() => null)) || {}
  try { return ok(await submitReport(body, visitorHash(req.headers)), 201) } catch (error) { return failure(error) }
}

/** GET /api/copyright?code=CR-XXXX&email=… — status for the reporter. */
export async function GET(req: NextRequest) {
  const off = await moduleGuard('copyright')
  if (off) return off
  if (!rateLimitHit(`copyright-status:${clientIp(req.headers)}`, 20, 600_000).ok) return err('تعداد درخواست‌ها زیاد است؛ کمی بعد امتحان کنید', 429)
  try { return ok(await reportStatus(req.nextUrl.searchParams.get('code'), req.nextUrl.searchParams.get('email'))) } catch (error) { return failure(error) }
}

const guard = (req: NextRequest) => adminGuard(req, 'copyright', ['copyright.manage', 'settings.manage'])

/** GET /api/admin/copyright?status=NEW | ?id=12 */
export async function GET_admin(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const id = Number(req.nextUrl.searchParams.get('id'))
  try {
    return ok(id ? await reportDetail(id) : await reportList(req.nextUrl.searchParams.get('status') || 'NEW'))
  } catch (error) { return failure(error) }
}

/** POST /api/admin/copyright { id, status, resolution, unpublish: ["software:12"], disableLinks: [4, 5] } */
export async function POST_admin(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  const id = Number(body.id)
  if (!Number.isSafeInteger(id) || id <= 0) return err('invalid id')
  try {
    const result = await decideReport(id, body, g.admin.id)
    await auditAdmin({ req, actor: g.admin, action: `copyright.${String(result.status).toLowerCase()}`, targetType: 'copyright-report', targetId: id, metadata: { actions: result.actions } })
    return ok(result)
  } catch (error) { return failure(error) }
}
