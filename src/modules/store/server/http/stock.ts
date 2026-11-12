import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { StoreError } from '@/modules/store/domain/store'
import { LocationError } from '@/modules/catalog/server/locations'
import { listLocations, saveLocation, locationStockView, itemLedger, transferItem, setOnlineReserve } from '@/modules/catalog/server/location-admin'
import { createReceipt, listReceipts, receiptDetail, startCount, countLine, removeCountLine, countDetail, postCount, cancelCount, listCounts } from '@/modules/catalog/server/stock-documents'
import { scanCounterProduct, counterProducts } from '@/modules/store/server/counter-sales'

// Private Admin API for stock locations, transfers, goods receiving and stock counts (/api/admin/store/stock).
// Reading and moving stock: catalog managers or counter staff; location settings and the online reserve: catalog managers.

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
const failure = (error: unknown) => {
  if (error instanceof LocationError || error instanceof StoreError) return reply({ error: error.message }, error.status)
  console.error('[store.stock]', error)
  return reply({ error: 'خطای داخلی؛ دوباره تلاش کنید' }, 500)
}
const guard = (req: NextRequest) => adminGuard(req, 'store', ['cms.products', 'orders.manage'])

export async function GET_stock(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const p = req.nextUrl.searchParams
  try {
    if (p.has('locations')) return reply({ locations: await listLocations(), manager: !!await requirePerm(req, 'cms.products') })
    if (p.has('view')) return reply(await locationStockView({ q: p.get('q'), locationId: p.get('location'), page: p.get('page'), filter: p.get('filter') }))
    if (p.has('ledger')) return reply({ movements: await itemLedger(p.get('product'), p.get('variant')) })
    if (p.has('receipts')) return reply(await listReceipts(Number(p.get('page')) || 1))
    if (p.has('receipt')) return reply({ receipt: await receiptDetail(p.get('receipt')) })
    if (p.has('counts')) return reply({ counts: await listCounts() })
    if (p.has('count')) return reply({ count: await countDetail(p.get('count')) })
    if (p.has('scan')) return reply(await scanCounterProduct(p.get('scan') || ''))
    return reply({ products: (await counterProducts(p.get('q') || '')).filter((row) => row.kind === 'PHYSICAL') })
  } catch (error) { return failure(error) }
}

export async function POST_stock(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return reply({ error: 'درخواست معتبر نیست' }, 400)
  const op = String(body.op || '')
  const audit = (action: string, targetId: number, metadata: Record<string, unknown> = {}) => auditAdmin({ req, actor: g.admin, action: `store.stock.${action}`, targetType: 'stock', targetId, metadata })
  try {
    if (op === 'location.save' || op === 'reserve.set') {
      if (!await requirePerm(req, 'cms.products')) return reply({ error: 'تنظیم انبارها با مدیر محصولات است' }, 403)
      if (op === 'reserve.set') { const result = await setOnlineReserve(body); await audit('reserve', Number(body.productId), result); return reply(result) }
      const saved = await saveLocation(body, body.id ? Number(body.id) : undefined)
      await audit('location', saved.id, { name: saved.name, sellsOnline: saved.sellsOnline, active: saved.active })
      return reply({ location: saved })
    }
    if (op === 'transfer') { const result = await transferItem(body, g.admin.id); await audit('transfer', Number(body.productId), { from: body.from, to: body.to, quantity: body.quantity }); return reply(result) }
    if (op === 'receipt.create') { const result = await createReceipt(body, g.admin.id); if (!result.replayed) await audit('receipt', result.id); return reply(result) }
    if (op === 'count.start') { const count = await startCount(body, g.admin.id); await audit('count.start', count.id); return reply({ count }) }
    if (op === 'count.line') return reply({ line: await countLine(body) })
    if (op === 'count.remove') return reply(await removeCountLine(body))
    if (op === 'count.post') { const result = await postCount(body, g.admin.id); await audit('count.post', Number(body.countId), { ...result, full: body.full === true }); return reply(result) }
    if (op === 'count.cancel') { const result = await cancelCount(body); await audit('count.cancel', Number(body.countId)); return reply(result) }
    return reply({ error: 'عملیات انبار معتبر نیست' }, 400)
  } catch (error) { return failure(error) }
}
