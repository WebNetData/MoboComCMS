import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser, requirePerm } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { auditAdminStrict } from '@/platform/audit/server'
import { rateLimitStrict, clientIp } from '@/platform/http/rate-limit'
import { getSettings } from '@/modules/settings/server'
import { StoreError } from '@/modules/store/domain/store'
import { ShippingError } from '@/modules/shipping/domain/shipping'
import { createQuotation, cancelQuotation, listQuotations, quotationByToken, quotationPreview } from '@/modules/store/server/quotations'
import { counterProducts, counterCustomers } from '@/modules/store/server/counter-sales'
import { executeCheckout } from '@/modules/checkout/server/checkout'
import { readQuotationLines } from '@/modules/store/server/quotations/read'

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' } })
const failure = (error: unknown) => { if (error instanceof StoreError || error instanceof ShippingError) return reply({ error: error.message, code: error.code }, error.status); throw error }
const idOf = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : 0 }
type Context = { params: Promise<{ token: string }> }

export async function GET_admin(req: NextRequest) {
  const g = await adminGuard(req, 'store', ['orders.manage']); if ('response' in g) return g.response
  const params = req.nextUrl.searchParams
  if (params.has('options')) { const q = params.get('q') || ''; const [products, customers] = await Promise.all([counterProducts(q), counterCustomers(q)]); return reply({ products: products.filter(row => row.kind === 'PHYSICAL' && !row.fields.length), customers }) }
  if (params.has('id')) {
    const row = await db.storeQuotation.findUnique({ where: { id: idOf(params.get('id')) }, include: { customer: { select: { id: true, name: true, phone: true, email: true } } } })
    if (!row) return reply({ error: 'پیش‌فاکتور پیدا نشد' }, 404)
    const preview = await quotationPreview(row.token, 'COUNTER')
    const products = (await Promise.all(readQuotationLines(row.lines).map(line => counterProducts('', line.productId)))).flat()
    return reply({ preview, customer: row.customer, products })
  }
  return reply({ quotations: await listQuotations() })
}
export async function POST_admin(req: NextRequest) {
  const g = await adminGuard(req, 'store', ['orders.manage']); if ('response' in g) return g.response
  if (!(await rateLimitStrict(`quotation-admin:${g.admin.id}`, 20, 60_000)).ok) return reply({ error: 'کمی بعد دوباره تلاش کنید' }, 429)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'درخواست معتبر نیست' }, 400)
  const authorize = async (tx: Parameters<typeof requirePerm>[2]) => { if (!await requirePerm(req, 'orders.manage', tx)) throw new StoreError('دسترسی مدیریت سفارش تغییر کرده است', 403) }
  try {
    if (body.action === 'cancel') { await cancelQuotation(idOf(body.id), String(body.updatedAt || ''), authorize, async (tx, id) => auditAdminStrict({ req, actor: g.admin, action: 'store.quotation.cancel', targetType: 'quotation', targetId: id }, tx)); return reply({ saved: true }) }
    return reply(await createQuotation(body, g.admin.id, authorize, async (tx, id) => auditAdminStrict({ req, actor: g.admin, action: 'store.quotation.create', targetType: 'quotation', targetId: id }, tx)), 201)
  } catch (error) { return failure(error) }
}

export async function POST_checkout(req: NextRequest, context: Context) {
  const off = await moduleGuard('store'); if (off) return off
  const user = await requireUser(req); if (!user) return reply({ error: 'برای پرداخت وارد حساب مشتری شوید', code: 'NEED_LOGIN' }, 401)
  if (!(await rateLimitStrict(`quotation-pay:${user.id}:${clientIp(req.headers)}`, 8, 60_000)).ok) return reply({ error: 'کمی بعد دوباره تلاش کنید' }, 429)
  const row = await quotationByToken((await context.params).token)
  if (!row || row.userId !== user.id) return reply({ error: 'پیشنهاد برای این حساب در دسترس نیست' }, 404)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || body.confirmed !== true || !/^[a-f0-9]{64}$/.test(String(body.fingerprint || ''))) return reply({ error: 'قیمت و شرایط فعلی را بررسی و تأیید کنید' }, 400)
  const settings = await getSettings()
  const siteUrl = (settings.siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/$/, '')
  try {
    const result = await executeCheckout({ userId: user.id, email: user.email, lines: readQuotationLines(row.lines), storeQuotation: { id: row.id, fingerprint: body.fingerprint }, idempotencyKey: `quotation:${row.id}:customer:${row.userId}`, siteUrl, channel: 'web', addressId: idOf(body.addressId) || null, carrierId: typeof body.carrierId === 'string' ? body.carrierId.slice(0, 30) : null, shippingMode: body.shippingMode === 'PICKUP' ? 'PICKUP' : 'SHIP', delivery: body.delivery && typeof body.delivery === 'object' ? { date: String(body.delivery.date || '').slice(0, 10), slotId: String(body.delivery.slotId || '').slice(0, 20) } : null, gatewayRef: typeof body.gatewayRef === 'string' ? body.gatewayRef.slice(0, 80) : undefined, payWith: body.payWith === 'wallet' ? 'wallet' : undefined })
    return result.ok ? reply(result.data) : reply({ error: result.message, code: result.code, ...result.meta }, result.status)
  } catch (error) { return failure(error) }
}
