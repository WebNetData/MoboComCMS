import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireReseller, resellerAccount, resellerCan } from '@/modules/reseller/server/reseller'
import { getPanelAdapter } from '@/modules/providers/server/panels'
import { SUB_ACTIONS, subscriptionAction, type SubAction } from '@/modules/subscriptions/server/submanage'


const RESELLER_ACTIONS: SubAction[] = [
  'enable',
  'disable',
  'rotate',
  'renew',
  'reset-traffic',
  'reset-devices',
  'devices',
  'delete-device',
  'sync',
]

/** POST /api/reseller/accounts/:id — the same self-service actions, for their customers. */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!resellerCan(guard, 'accounts.manage')) return err('forbidden', 403)

  const id = Number(params.id)
  if (!id) return err('invalid id', 400)
  const sub = await resellerAccount(guard.reseller.id, id)
  if (!sub) return err('account not found', 404, { code: 'NOT_FOUND' })

  const body = await req.json().catch(() => null)
  const action = (body?.action === 'resetTraffic' ? 'reset-traffic' : body?.action) as SubAction
  if (!SUB_ACTIONS.includes(action) || !RESELLER_ACTIONS.includes(action)) {
    return err(`unknown action "${body?.action}"`, 400)
  }

  const res = await subscriptionAction(id, action, { hwid: body?.hwid ? String(body.hwid) : undefined, idempotencyKey: req.headers.get('idempotency-key') || body?.idempotencyKey || undefined })
  if (!res.ok) {
    return err(res.message || 'action failed', res.code === 'INSUFFICIENT_FUNDS' ? 402 : 502, res.code ? { code: res.code } : undefined)
  }
  return ok({ ok: true, action, ...(typeof res.data === 'object' && res.data ? (res.data as object) : {}) })
}

/** DELETE /api/reseller/accounts/:id — removes the panel user and the record. */
export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!resellerCan(guard, 'accounts.manage')) return err('forbidden', 403)

  const id = Number(params.id)
  if (!id) return err('invalid id', 400)
  const sub = await resellerAccount(guard.reseller.id, id)
  if (!sub) return err('account not found', 404, { code: 'NOT_FOUND' })

  let panelError = ''
  if (sub.plan.panel) {
    const adapter = getPanelAdapter(sub.plan.panel)
    if (adapter) {
      const res = await adapter.deleteUser(sub.username)
      if (!res.ok) panelError = res.message || 'panel delete failed'
    }
  }
  if (panelError) return err(`the account is still on the panel: ${panelError}`, 502)

  await db.subscription.delete({ where: { id: sub.id } })
  return ok({ ok: true, deleted: true })
}
