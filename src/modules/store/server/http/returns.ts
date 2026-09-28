import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requirePerm, requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { StoreError } from '@/modules/store/domain/store'
import {
  RETURN_TABS, adminReturn, adminReturns, createReturnRequest, customerReturnInfo, decideReturn, getReturnSettings, refundReturn,
  returnPhoto, saveReturnSettings, withdrawReturn,
} from '@/modules/store/server/returns'

const positiveId = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0 }
type IdContext = { params: Promise<{ id: string }> }

function failure(error: unknown) {
  if (error instanceof StoreError) return err(error.message, error.status, { code: error.code })
  console.error('[store.returns]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}

// ------------------------------------------------------------------ customer

/** GET /api/store/orders/:id/returns — what the customer may request, and their requests. */
export async function GET_order_returns(req: NextRequest, { params }: IdContext) {
  const off = await moduleGuard('store')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const info = await customerReturnInfo(user.id, positiveId((await params).id))
  return info ? ok(info) : err('سفارش پیدا نشد', 404)
}

/** POST multipart /api/store/orders/:id/returns — cancellation or return request. */
export async function POST_order_returns(req: NextRequest, { params }: IdContext) {
  const off = await moduleGuard('store')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const id = positiveId((await params).id)
  if (!id) return err('invalid id')
  try {
    const row = await createReturnRequest(req, user.id, id)
    return ok({ id: row.id, number: row.number, status: row.status }, 201)
  } catch (error) { return failure(error) }
}

/** DELETE /api/store/returns/:id — withdraw a request still waiting for review. */
export async function DELETE_return(req: NextRequest, { params }: IdContext) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  try {
    await withdrawReturn(user.id, positiveId((await params).id))
    return ok({ ok: true })
  } catch (error) { return failure(error) }
}

/** GET /api/store/returns/:id/photos/:n — owner or staff; sandboxed and never cached. */
export async function GET_return_photo(req: NextRequest, { params }: { params: Promise<{ id: string; n: string }> }) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const { id, n } = await params
  const staff = user.role === 'ADMIN' && Boolean(await requirePerm(req, 'orders.manage'))
  const file = await returnPhoto(positiveId(id), Math.max(0, Math.floor(Number(n) || 0)), { id: user.id, staff })
  if (!file) return err('not found', 404)
  return new Response(new Uint8Array(file.bytes), { headers: {
    'content-type': file.type, 'content-length': String(file.bytes.length), 'content-disposition': 'inline',
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox",
  } })
}

// ------------------------------------------------------------------ staff

const returnsAdmin = (req: NextRequest) => adminGuard(req, 'store', ['orders.manage'])

/** GET /api/admin/store/returns?tab=&q=&page= — the queue, its tabs and the return policy settings. */
export async function GET_returns(req: NextRequest) {
  const g = await returnsAdmin(req)
  if ('response' in g) return g.response
  const params = req.nextUrl.searchParams
  const [list, settings] = await Promise.all([adminReturns({ tab: params.get('tab') || 'open', q: params.get('q') || '', page: Number(params.get('page')) || 1 }), getReturnSettings()])
  return ok({ ...list, tabs: RETURN_TABS, settings })
}

/** PUT /api/admin/store/returns { settings } — return window, self-cancel stage, auto refund, policy text. */
export async function PUT_returns(req: NextRequest) {
  const g = await adminGuard(req, 'store', ['settings.manage', 'orders.manage'])
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  const settings = await saveReturnSettings(body?.settings)
  await auditAdmin({ req, actor: g.admin, action: 'store.returns.settings', targetType: 'setting', targetId: 'store.returns.v1', metadata: settings })
  return ok({ settings })
}

/** GET /api/admin/store/returns/:id */
export async function GET_return(req: NextRequest, { params }: IdContext) {
  const g = await returnsAdmin(req)
  if ('response' in g) return g.response
  const view = await adminReturn(positiveId((await params).id))
  return view ? ok(view) : err('درخواست پیدا نشد', 404)
}

/**
 * POST /api/admin/store/returns/:id
 *   { action: 'approve' | 'reject', note? }
 *   { action: 'refund', amount?, restock?, note? }
 */
export async function POST_return(req: NextRequest, { params }: IdContext) {
  const g = await returnsAdmin(req)
  if ('response' in g) return g.response
  const id = positiveId((await params).id)
  if (!id) return err('invalid id')
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (body.action === 'approve' || body.action === 'reject') {
      await decideReturn({ id, action: body.action, note: body.note, actorId: g.admin.id })
    } else if (body.action === 'refund') {
      const row = await refundReturn({ id, actorId: g.admin.id, amount: body.amount, restock: body.restock !== false, note: body.note })
      await auditAdmin({ req, actor: g.admin, action: 'store.return.refund', targetType: 'return', targetId: id, metadata: { orderId: row.orderId, refundMinor: row.refundMinor.toString(), currency: row.currency, restock: body.restock !== false } })
      return ok(await adminReturn(id))
    } else return err('unknown action')
    await auditAdmin({ req, actor: g.admin, action: `store.return.${body.action}`, targetType: 'return', targetId: id })
    return ok(await adminReturn(id))
  } catch (error) { return failure(error) }
}
