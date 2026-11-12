import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
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
  const raw = await req.text()
  if (raw.length > 100_000) return reply({ error: 'درخواست بیش از حد بزرگ است' }, 413)
  let body: Record<string, unknown> | null
  try { body = JSON.parse(raw) } catch { return reply({ error: 'درخواست معتبر نیست' }, 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'درخواست معتبر نیست' }, 400)
  const op = String(body.op || '')
  const audit = (action: string, manager = false) => async (tx: Prisma.TransactionClient, targetId: number) => {
    if (!await requirePerm(req, 'cms.products', tx) && (manager || !await requirePerm(req, 'orders.manage', tx))) throw new StoreError('دسترسی انبار تغییر کرده است', 403)
    await auditAdminStrict({ req, actor: g.admin, action: `store.stock.${action}`, targetType: 'stock', targetId }, tx)
  }
  try {
    if (op === 'location.save' || op === 'reserve.set') {
      if (!await requirePerm(req, 'cms.products')) return reply({ error: 'تنظیم انبارها با مدیر محصولات است' }, 403)
      if (op === 'reserve.set') { const result = await setOnlineReserve(body, audit('reserve', true)); return reply(result) }
      const saved = await saveLocation(body, body.id ? Number(body.id) : undefined, audit('location', true))
      return reply({ location: saved })
    }
    if (op === 'transfer') { const result = await transferItem(body, g.admin.id, audit('transfer')); return reply(result) }
    if (op === 'receipt.create') { const result = await createReceipt(body, g.admin.id, audit('receipt')); return reply(result) }
    if (op === 'count.start') { const count = await startCount(body, g.admin.id, audit('count.start')); return reply({ count }) }
    if (op === 'count.line') return reply({ line: await countLine(body, audit('count.line')) })
    if (op === 'count.remove') return reply(await removeCountLine(body, audit('count.remove')))
    if (op === 'count.post') { const result = await postCount(body, g.admin.id, audit('count.post')); return reply(result) }
    if (op === 'count.cancel') { const result = await cancelCount(body, audit('count.cancel')); return reply(result) }
    return reply({ error: 'عملیات انبار معتبر نیست' }, 400)
  } catch (error) { return failure(error) }
}
