// Customer self-service subscription actions (also exposed over the public API
// in /api/v1 — both go through lib/submanage so behaviour can never diverge).
import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { CUSTOMER_SUB_ACTIONS, subscriptionAction, type SubAction } from '@/modules/subscriptions/server/submanage'
import { getRenewalPreview } from '@/modules/subscriptions/server/renewal-preview'
import { getUserLocale } from '@/modules/notifications/server/telegram-locale'

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id < 1) return err('invalid id', 400)
  try {
    const locale = await getUserLocale(user.id) || (req.cookies.get('lang')?.value === 'fa' ? 'fa' : 'en')
    const preview = await getRenewalPreview(id, user.id, locale)
    if (!preview) return err('not found', 404)
    const response = ok(preview)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    const pending = error instanceof Error && error.message === 'RENEWAL_PENDING'
    return err(pending ? 'Renewal is already processing' : 'Cannot read current subscription allowance', pending ? 409 : 503, { code: pending ? 'RENEWAL_PENDING' : 'PREVIEW_UNAVAILABLE' })
  }
}



export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)

  const id = Number(params.id)
  if (!id) return err('invalid id')

  const sub = await db.subscription.findUnique({ where: { id }, select: { id: true, userId: true } })
  if (!sub || sub.userId !== user.id) return err('not found', 404)

  const body = await req.json().catch(() => null)
  const action = (body?.action === 'resetTraffic' ? 'reset-traffic' : body?.action) as SubAction
  if (action === 'reset-traffic') return err('بازنشانی ترافیک برای کاربر مجاز نیست', 403)
  if (!(CUSTOMER_SUB_ACTIONS as readonly string[]).includes(action)) return err(`unknown action "${body?.action}"`, 400)

  const res = await subscriptionAction(id, action, { expectedTerms: typeof body?.expectedTerms === 'string' ? body.expectedTerms : undefined, hwid: body?.hwid ? String(body.hwid) : undefined, idempotencyKey: req.headers.get('idempotency-key') || body?.idempotencyKey || undefined })
  if (!res.ok) {
    const status = res.code === 'RENEWAL_CHANGED' ? 409 : res.code === 'INSUFFICIENT_FUNDS' ? 402 : res.code === 'IDEMPOTENCY_REQUIRED' ? 400 : 502
    return err(res.message || 'action failed', status, res.code ? { code: res.code } : undefined)
  }
  return ok({ ok: true, action, ...(typeof res.data === 'object' && res.data ? (res.data as object) : { data: res.data }) })
}
