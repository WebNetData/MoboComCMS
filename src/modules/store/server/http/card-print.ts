import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { auditAdmin } from '@/platform/audit/server'
import { printBrand, printProducts, orderPrint } from '@/modules/store/server/card-print'

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })

/**
 * GET /api/admin/store/print?q=        products to start a card from, and the site's brand
 * GET /api/admin/store/print?order=ID  a delivered order's card (recorded: it shows the buyer's secrets)
 */
export async function GET_print(req: NextRequest) {
  const guard = await adminGuard(req, 'store', ['orders.manage', 'store.orders.handle']); if ('response' in guard) return guard.response
  const params = req.nextUrl.searchParams
  if (params.has('order')) {
    const id = Number(params.get('order'))
    if (!Number.isSafeInteger(id) || id <= 0) return reply({ error: 'شمارهٔ سفارش معتبر نیست' }, 400)
    const scope = { actorId: guard.admin.id, manager: guard.admin.roleId == null || !!guard.admin.permissions?.includes('orders.manage') }
    const order = await orderPrint(id, scope)
    if (!order) return reply({ error: 'سفارش مجازیِ تحویل‌شده‌ای با این شماره در دسترس شما نیست' }, 404)
    await auditAdmin({ req, actor: guard.admin, action: 'store.order.delivery.print', targetType: 'order', targetId: id })
    return reply({ order, brand: await printBrand() })
  }
  const [products, brand] = await Promise.all([printProducts(params.get('q') || ''), printBrand()])
  return reply({ products, brand })
}
