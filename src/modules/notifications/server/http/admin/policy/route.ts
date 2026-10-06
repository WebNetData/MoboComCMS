import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { deliveryReceipts, getNotificationPolicy, saveNotificationPolicy } from '@/modules/notifications/server/policy'

const guard = (req: NextRequest) => adminGuard(req, null, ['settings.manage'])

/** GET /api/admin/notifications — keeping times, the daily summary and the delivery receipts of the last week. */
export async function GET(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const [policy, receipts] = await Promise.all([getNotificationPolicy(), deliveryReceipts()])
  return ok({ policy, receipts })
}

/** PUT /api/admin/notifications { policy } */
export async function PUT(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  if (!body.policy || typeof body.policy !== 'object') return err('تنظیمات معتبر نیست', 400)
  const policy = await saveNotificationPolicy(body.policy)
  await auditAdmin({ req, actor: g.admin, action: 'notifications.policy', targetType: 'settings', targetId: null, metadata: { readDays: policy.readDays, unreadDays: policy.unreadDays, digest: policy.digest.enabled, hour: policy.digest.hour } })
  return ok({ policy })
}
