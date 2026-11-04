import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { HostingError } from '@/modules/hosting/domain/catalog'
import { HostingRefusal, adminHostingServices, changeServiceStatus, deliverService } from '@/modules/hosting/server/services'
import { completeHostingTask } from '@/modules/hosting/server/addons'

const PERMISSIONS = ['hosting.manage']

/** GET /api/admin/hosting/services?status=&q=&page= */
export async function GET_admin_services(req: NextRequest) {
  const g = await adminGuard(req, 'hosting', PERMISSIONS)
  if ('response' in g) return g.response
  const url = new URL(req.url)
  const response = ok(await adminHostingServices({ status: url.searchParams.get('status') || '', q: url.searchParams.get('q') || '', page: Number(url.searchParams.get('page')) || 1 }))
  response.headers.set('cache-control', 'private, no-store')
  return response
}

/** POST /api/admin/hosting/services { op: deliver | SUSPEND | UNSUSPEND | TERMINATE | complete-task, id, … } */
export async function POST_admin_services(req: NextRequest) {
  const g = await adminGuard(req, 'hosting', PERMISSIONS)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  const id = Number(body?.id) || 0
  if (!id) return err('سرویس پیدا نشد', 404)
  try {
    if (body?.op === 'complete-task') {
      const result = await completeHostingTask(id, g.admin.id)
      await auditAdmin({ req, actor: g.admin, action: 'hosting.task.complete', targetType: 'hosting-action', targetId: id })
      return ok(result)
    }
    if (body?.op === 'deliver') {
      const input = body.service && typeof body.service === 'object' ? body.service : {}
      const result = await deliverService(id, input, g.admin.id)
      // The password itself never reaches the audit row.
      await auditAdmin({ req, actor: g.admin, action: result.delivered ? 'hosting.service.deliver' : 'hosting.service.update', targetType: 'hosting-service', targetId: id, metadata: { passwordChanged: Boolean(String(input.password || '')) } })
      return ok(result)
    }
    if (body?.op === 'SUSPEND' || body?.op === 'UNSUSPEND' || body?.op === 'TERMINATE') {
      const result = await changeServiceStatus(id, body.op, g.admin.id, String(body.reason || ''))
      await auditAdmin({ req, actor: g.admin, action: `hosting.service.${String(body.op).toLowerCase()}`, targetType: 'hosting-service', targetId: id })
      return ok(result)
    }
    return err('عملیات نامعتبر است')
  } catch (error) {
    if (error instanceof HostingRefusal) return err(error.message, error.status)
    if (error instanceof HostingError) return err(error.message)
    throw error
  }
}
