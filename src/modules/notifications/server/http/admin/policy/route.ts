import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { RevisionError } from '@/modules/content/server/revisions'
import { sectionSettingsRevision } from '@/modules/settings/server/section-history'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { deliveryReceipts, getNotificationPolicy, saveNotificationPolicy } from '@/modules/notifications/server/policy'

const guard = (req: NextRequest) => adminGuard(req, null, ['settings.manage'])

/** GET /api/admin/notifications — keeping times, the daily summary and the delivery receipts of the last week. */
export async function GET(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const [policy, receipts] = await Promise.all([getNotificationPolicy(), deliveryReceipts()])
  const response = ok({ policy, receipts, revision: sectionSettingsRevision(policy) }); response.headers.set('Cache-Control', 'private, no-store'); return response
}

/** PUT /api/admin/notifications { policy } */
export async function PUT(req: NextRequest) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const g = await guard(req)
  if ('response' in g) return g.response
  try {
  const body = await readJsonObject(req, 8192)
  if (!body.policy || typeof body.policy !== 'object') return err('تنظیمات معتبر نیست', 400)
  const policy = await saveNotificationPolicy(body.policy, { req, actor: g.admin, expected: req.headers.get('if-match') })
  return ok({ policy, revision: sectionSettingsRevision(policy) })
  } catch (error) {
    if (error instanceof RevisionError || error instanceof JsonBodyError) return err(error.message, error.status)
    if ((error as { code?: string }).code === 'P2034') return err('تنظیمات هم‌زمان تغییر کرده است.', 409)
    console.error('[notifications.policy]', error); return err('ذخیره نشد.', 500)
  }
}
