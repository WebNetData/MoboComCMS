import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { StoreError } from '@/modules/store/domain/store'
import { counterReturnLookup, counterReturnResult, createCounterReturn } from '@/modules/store/server/returns'

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
const failure = (error: unknown) => {
  if (error instanceof StoreError) return reply({ error: error.message, code: error.code }, error.status)
  console.error('[store.counter.returns]', error)
  return reply({ error: 'خطای داخلی؛ با همان درخواست دوباره تلاش کنید' }, 500)
}
export async function GET_counter_returns(req: NextRequest) {
  const g = await adminGuard(req, 'store', ['orders.manage'])
  if ('response' in g) return g.response
  try {
    const requestId = req.nextUrl.searchParams.get('request')
    return requestId ? reply({ result: await counterReturnResult(requestId, g.admin.id) }) : reply({ order: await counterReturnLookup(req.nextUrl.searchParams.get('invoice') || '') })
  } catch (error) { return failure(error) }
}
export async function POST_counter_returns(req: NextRequest) {
  const g = await adminGuard(req, 'store', ['orders.manage'])
  if ('response' in g) return g.response
  if (!(await rateLimitStrict(`counter-return:${g.admin.id}`, 30, 60_000)).ok) return reply({ error: 'درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید' }, 429)
  const raw = await req.text()
  if (raw.length > 20_000) return reply({ error: 'درخواست بیش از حد بزرگ است' }, 413)
  try {
    const body = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'درخواست معتبر نیست' }, 400)
    const result = await createCounterReturn(body, g.admin.id, async tx => {
      if (!await requirePerm(req, 'orders.manage', tx)) throw new StoreError('دسترسی مرجوعی تغییر کرده است', 403)
    }, async (tx, id) => {
      await auditAdminStrict({ req, actor: g.admin, action: 'store.counter.return', targetType: 'return', targetId: id, metadata: { orderId: body.orderId, method: body.refund } }, tx)
    })
    return reply({ result })
  } catch (error) { return error instanceof SyntaxError ? reply({ error: 'درخواست معتبر نیست' }, 400) : failure(error) }
}
