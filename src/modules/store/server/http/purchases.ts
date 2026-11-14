import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { LocationError } from '@/modules/catalog/server/locations'
import { cancelPurchase, createPurchase, listPurchases, purchasableItem, purchaseDetail, receivePurchase } from '@/modules/catalog/server/purchasing'

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
const failure = (error: unknown) => {
  if (error instanceof LocationError) return reply({ error: error.message }, error.status)
  console.error('[store.purchases]', error)
  return reply({ error: 'خطای داخلی؛ دوباره تلاش کنید' }, 500)
}

export async function GET_purchases(req: NextRequest) {
  const guard = await adminGuard(req, 'store', ['cms.products'])
  if ('response' in guard) return guard.response
  try {
    const params = req.nextUrl.searchParams
    if (params.has('product')) return reply({ item: await purchasableItem(params.get('product'), params.get('variant')) })
    if (params.has('purchase')) return reply(await purchaseDetail(params.get('purchase')))
    return reply(await listPurchases(Number(params.get('page')) || 1))
  } catch (error) { return failure(error) }
}

export async function POST_purchases(req: NextRequest) {
  const guard = await adminGuard(req, 'store', ['cms.products'])
  if ('response' in guard) return guard.response
  const raw = await req.text()
  if (raw.length > 100_000) return reply({ error: 'درخواست بیش از حد بزرگ است' }, 413)
  let body: Record<string, unknown>
  try { body = JSON.parse(raw) } catch { return reply({ error: 'درخواست معتبر نیست' }, 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'درخواست معتبر نیست' }, 400)
  let purchaseTarget: number | null = null, auditTargetType = 'stock_purchase'
  const audit = (action: string) => async (tx: Prisma.TransactionClient, targetId: number) => {
    if (!await requirePerm(req, 'cms.products', tx)) throw new LocationError('دسترسی مدیریت کالا تغییر کرده است', 403)
    await auditAdminStrict({ req, actor: guard.admin, action: `store.purchase.${action}`, targetType: auditTargetType, targetId, metadata: { purchaseId: purchaseTarget ?? targetId } }, tx)
  }
  try {
    const op = String(body.op || '')
    purchaseTarget = Number.isSafeInteger(Number(body.purchaseId)) && Number(body.purchaseId) > 0 ? Number(body.purchaseId) : null
    if (op === 'create') return reply(await createPurchase(body, guard.admin.id, audit('create')))
    if (op === 'receive') { auditTargetType = 'stock_purchase_receipt'; return reply(await receivePurchase(body, guard.admin.id, audit('receive'))) }
    if (op === 'cancel') return reply(await cancelPurchase(body, audit('cancel')))
    return reply({ error: 'عملیات سفارش خرید معتبر نیست' }, 400)
  } catch (error) { return failure(error) }
}
