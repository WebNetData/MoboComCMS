import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { StoreError } from '@/modules/store/domain/store'
import { orderPacking, saveOrderPacking } from '@/modules/store/server/packing'

type Context = { params: Promise<{ id: string }> }
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
const failure = (error: unknown) => { if (error instanceof StoreError) return reply({ error: error.message, code: error.code }, error.status); throw error }
export async function GET(req: NextRequest, context: Context) {
  const g = await adminGuard(req, 'store', ['orders.manage', 'store.orders.handle'])
  if ('response' in g) return g.response
  const id = Number((await context.params).id)
  if (!Number.isSafeInteger(id) || id <= 0) return reply({ error: 'سفارش نامعتبر است' }, 400)
  const scope = { actorId: g.admin.id, manager: g.admin.roleId == null || !!g.admin.permissions?.includes('orders.manage') }
  try { return reply(await orderPacking(id, scope)) } catch (error) { return failure(error) }
}
export async function POST(req: NextRequest, context: Context) {
  const g = await adminGuard(req, 'store', ['orders.manage', 'store.orders.handle'])
  if ('response' in g) return g.response
  const id = Number((await context.params).id), body = await req.json().catch(() => null)
  if (!Number.isSafeInteger(id) || id <= 0 || !body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'درخواست چک‌لیست نامعتبر است' }, 400)
  if (!(await rateLimitStrict(`store-packing:${g.admin.id}:${id}`, 30, 300_000)).ok) return reply({ error: 'کمی بعد دوباره تلاش کنید' }, 429)
  const scope = { actorId: g.admin.id, manager: g.admin.roleId == null || !!g.admin.permissions?.includes('orders.manage') }
  try { return reply(await saveOrderPacking(id, body, scope, async tx => {
    if (!await requirePerm(req, scope.manager ? 'orders.manage' : 'store.orders.handle', tx)) throw new StoreError('دسترسی تغییر کرده است', 403)
  }, async tx => { await auditAdminStrict({ req, actor: g.admin, action: 'store.order.packing', targetType: 'order', targetId: id }, tx) })) } catch (error) { return failure(error) }
}
