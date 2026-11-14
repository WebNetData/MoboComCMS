import type { NextRequest } from 'next/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser, requirePerm } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { auditAdminStrict } from '@/platform/audit/server'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { StoreError } from '@/modules/store/domain/store'
import { ShippingError } from '@/modules/shipping/domain/shipping'
import { adminDeliveryChanges, customerDeliveryChanges, decideDeliveryChange, requestDeliveryChange, withdrawDeliveryChange } from '@/modules/store/server/delivery-changes'

type Context = { params: Promise<{ id: string }> }
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
const failure = (error: unknown) => { if (error instanceof StoreError || error instanceof ShippingError) return reply({ error: error.message, code: error.code }, error.status); throw error }
const idOf = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : 0 }

export async function GET_customer(req: NextRequest, context: Context) {
  const off = await moduleGuard('store'); if (off) return off
  const user = await requireUser(req); if (!user) return reply({ error: 'unauthorized' }, 401)
  const id = idOf((await context.params).id); if (!id) return reply({ error: 'شناسه سفارش معتبر نیست' }, 400)
  const state = await customerDeliveryChanges(id, user.id)
  return state ? reply(state) : reply({ error: 'سفارش پیدا نشد' }, 404)
}

export async function POST_customer(req: NextRequest, context: Context) {
  const off = await moduleGuard('store'); if (off) return off
  const user = await requireUser(req); if (!user) return reply({ error: 'unauthorized' }, 401)
  const id = idOf((await context.params).id), body = await req.json().catch(() => null)
  if (!id || !body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'درخواست معتبر نیست' }, 400)
  if (!(await rateLimitStrict(`store-delivery-change:${user.id}:${id}`, 8, 300_000)).ok) return reply({ error: 'کمی بعد دوباره تلاش کنید' }, 429)
  try { return reply(await requestDeliveryChange({ orderId: id, userId: user.id, addressId: idOf(body.addressId), reason: body.reason }), 201) } catch (error) { return failure(error) }
}

export async function DELETE_customer(req: NextRequest, context: Context) {
  const off = await moduleGuard('store'); if (off) return off
  const user = await requireUser(req); if (!user) return reply({ error: 'unauthorized' }, 401)
  const body = await req.json().catch(() => null)
  const orderId = idOf((await context.params).id), changeId = idOf(body?.changeId)
  if (!orderId || !changeId) return reply({ error: 'درخواست معتبر نیست' }, 400)
  try { return reply(await withdrawDeliveryChange({ changeId, userId: user.id, orderId })) } catch (error) { return failure(error) }
}

export async function GET_admin(req: NextRequest, context: Context) {
  const g = await adminGuard(req, 'store', ['orders.manage']); if ('response' in g) return g.response
  const id = idOf((await context.params).id); if (!id) return reply({ error: 'شناسه سفارش معتبر نیست' }, 400)
  const state = await adminDeliveryChanges(id, { actorId: g.admin.id, manager: true })
  return state ? reply(state) : reply({ error: 'سفارش پیدا نشد' }, 404)
}

export async function POST_admin(req: NextRequest, context: Context) {
  const g = await adminGuard(req, 'store', ['orders.manage']); if ('response' in g) return g.response
  const id = idOf((await context.params).id), body = await req.json().catch(() => null)
  if (!id || !body || typeof body !== 'object' || Array.isArray(body) || !['approve', 'reject'].includes(body.action)) return reply({ error: 'تصمیم درخواست معتبر نیست' }, 400)
  if (!(await rateLimitStrict(`store-delivery-change-review:${g.admin.id}:${id}`, 20, 300_000)).ok) return reply({ error: 'کمی بعد دوباره تلاش کنید' }, 429)
  try {
    const result = await decideDeliveryChange({ orderId: id, changeId: idOf(body.changeId), expectedChangeUpdatedAt: String(body.expectedChangeUpdatedAt || ''), action: body.action, acknowledgeFeeDifference: body.acknowledgeFeeDifference, note: body.note, actorId: g.admin.id, scope: { actorId: g.admin.id, manager: true }, authorize: async tx => { if (!await requirePerm(req, 'orders.manage', tx)) throw new StoreError('دسترسی مدیریت سفارش تغییر کرده است', 403) }, audit: async (tx, changeId) => auditAdminStrict({ req, actor: g.admin, action: `store.order.delivery_change.${body.action}`, targetType: 'order_delivery_change', targetId: changeId, metadata: { orderId: id } }, tx) })
    return reply(result)
  } catch (error) { return failure(error) }
}
