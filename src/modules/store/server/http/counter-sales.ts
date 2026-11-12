import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { StoreError } from '@/modules/store/domain/store'
import { counterProducts, counterCustomers, counterReceipt, createCounterSale } from '@/modules/store/server/counter-sales'
import { db } from '@/platform/database/prisma'

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
const failure = (error: unknown) => { if (error instanceof StoreError) return reply({ error: error.message, code: error.code }, error.status); throw error }

export async function GET_counter(req: NextRequest) {
  const guard = await adminGuard(req, 'store', ['orders.manage'])
  if ('response' in guard) return guard.response
  const params = req.nextUrl.searchParams
  try {
    if (params.has('request')) {
      const request = params.get('request') || ''
      if (!/^[0-9a-f-]{36}$/i.test(request)) throw new StoreError('شناسهٔ درخواست معتبر نیست')
      const order = await db.order.findUnique({ where: { idempotencyKey: `counter:${guard.admin.id}:${request}` }, select: { id: true, status: true, saleSource: true } })
      return reply({ orderId: order?.status === 'PAID' && order.saleSource === 'COUNTER' ? order.id : null })
    }
    if (params.has('order')) {
      const id = Number(params.get('order'))
      if (!Number.isSafeInteger(id) || id <= 0) throw new StoreError('شمارهٔ فروش معتبر نیست')
      const receipt = await counterReceipt(id)
      await auditAdminStrict({ req, actor: guard.admin, action: 'store.counter.receipt', targetType: 'order', targetId: id, metadata: { codes: receipt.cards.length } })
      return reply({ receipt })
    }
    if (params.has('customers')) return reply({ customers: await counterCustomers(params.get('customers') || '') })
    return reply({ products: await counterProducts(params.get('q') || '') })
  } catch (error) { return failure(error) }
}

export async function POST_counter(req: NextRequest) {
  const guard = await adminGuard(req, 'store', ['orders.manage'])
  if ('response' in guard) return guard.response
  const limit = await rateLimitStrict(`counter-sale:${guard.admin.id}`, 60, 60_000)
  if (!limit.ok) return reply({ error: 'درخواست‌های ثبت فروش زیاد است؛ کمی بعد دوباره تلاش کنید' }, 429)
  const raw = await req.text()
  if (raw.length > 100_000) return reply({ error: 'اطلاعات فروش بیش از حد بزرگ است' }, 413)
  let body: unknown
  try { body = JSON.parse(raw) } catch { return reply({ error: 'اطلاعات فروش معتبر نیست' }, 400) }
  try {
    const result = await createCounterSale(body, guard.admin.id, async (tx) => {
      if (!(await requirePerm(req, 'orders.manage', tx))) throw new StoreError('دسترسی ثبت فروش تغییر کرده است', 403)
    }, async (tx, orderId) => { await auditAdminStrict({ req, actor: guard.admin, action: 'store.counter.sale', targetType: 'order', targetId: orderId, metadata: { source: 'COUNTER' } }, tx) })
    return reply(result)
  } catch (error) { return failure(error) }
}
