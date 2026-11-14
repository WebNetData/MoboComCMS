import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { toMinor, normalizeCurrency } from '@/shared/money'
import { db } from '@/platform/database/prisma'
import { ShippingError } from '@/modules/shipping/domain/shipping'
import { CART_COOKIE, cartView } from '@/modules/store/server/cart'
import {
  adminShipment, adminShipments, createShipment, shipmentsForLabels, getCarrierSettings, orderShipment, publicTracking, quoteOptions, saveCarrierSettings, updateShipment,
} from '@/modules/shipping/server/carriers'
import { tierStanding } from '@/modules/membership/server/tiers'
import { quotationByToken, quotationPreview } from '@/modules/store/server/quotations'
import { StoreError } from '@/modules/store/domain/store'

function failure(error: unknown) {
  if (error instanceof ShippingError || error instanceof StoreError) return err(error.message, error.status, { code: error.code })
  console.error('[shipping.carriers]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}
const positiveId = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0 }
type IdContext = { params: Promise<{ id: string }> }

/** GET /api/shipping/quotes?addressId= — carrier options and prices for the cart to one of the customer's addresses. */
export async function GET_quotes(req: NextRequest) {
  const off = await moduleGuard('store')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401)
  const address = await db.userAddress.findFirst({ where: { id: positiveId(req.nextUrl.searchParams.get('addressId')), userId: user.id }, select: { province: true, city: true } })
  if (!address) return err('آدرس پیدا نشد', 404)
  let cart
  const quotationToken = req.nextUrl.searchParams.get('quotation')
  if (quotationToken) {
    const row = await quotationByToken(quotationToken)
    if (!row || row.userId !== user.id) return err('پیشنهاد برای این حساب در دسترس نیست', 404)
    const preview = await quotationPreview(quotationToken)
    if (!preview?.available || !preview.cart) return err(preview?.reason || 'پیشنهاد قابل پرداخت نیست', 409)
    cart = preview.cart
  } else cart = await cartView({ userId: user.id, token: req.cookies.get(CART_COOKIE)?.value || null })
  const physical = cart.lines.filter((line) => line.kind === 'PHYSICAL')
  const currency = normalizeCurrency(cart.currency, 'IRT')
  const itemMinor = quotationToken ? toMinor(cart.itemsTotal, currency) : physical.reduce((sum, line) => sum + toMinor(line.lineTotal, currency), 0n)
  const priced = await quoteOptions({ memberFree: (await tierStanding(user.id))?.freeShipping, lines: physical.map((line) => ({ productId: line.productId, quantity: line.quantity })), dest: address, itemMinor, currency })
  return ok({ enabled: priced.enabled, weightGrams: priced.weightGrams, currency, options: priced.options.map((item) => item.ok ? { ...item, feeMinor: item.feeMinor.toString() } : item) })
}

/** GET /api/track?code= — public parcel tracking (no personal details). */
export async function GET_track(req: NextRequest) {
  const found = await publicTracking(req.nextUrl.searchParams.get('code'))
  return found ? ok(found) : err('مرسوله‌ای با این کد پیدا نشد', 404)
}

// ------------------------------------------------------------------ staff

const shipAdmin = (req: NextRequest) => adminGuard(req, 'store', ['orders.manage'])

/** GET/PUT /api/admin/shipping/carriers — carriers, rate tables and the store's origin. */
export async function GET_carriers(req: NextRequest) {
  const g = await adminGuard(req, 'store', ['settings.manage', 'orders.manage'])
  if ('response' in g) return g.response
  return ok({ settings: await getCarrierSettings() })
}

export async function PUT_carriers(req: NextRequest) {
  const g = await adminGuard(req, 'store', ['settings.manage', 'orders.manage'])
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  const settings = await saveCarrierSettings(body?.settings)
  await auditAdmin({ req, actor: g.admin, action: 'shipping.carriers.update', targetType: 'setting', targetId: 'shipping.carriers.v1', metadata: { enabled: settings.enabled, carriers: settings.carriers.filter((item) => item.enabled).map((item) => item.id) } })
  return ok({ settings })
}

/** GET /api/admin/shipping/shipments?status=&carrier=&q=&page= */
export async function GET_shipments(req: NextRequest) {
  const g = await shipAdmin(req)
  if ('response' in g) return g.response
  const params = req.nextUrl.searchParams
  const ids = (params.get('ids') || '').split(',').map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
  if (ids.length) return ok({ rows: await shipmentsForLabels(ids) })
  return ok(await adminShipments({ status: params.get('status') || '', carrier: params.get('carrier') || '', q: params.get('q') || '', page: Number(params.get('page')) || 1 }))
}

/** POST /api/admin/shipping/shipments { orderId, carrier, trackingCode?, weightGrams?, parcels?, costRial?, note? } — issue a waybill. */
export async function POST_shipments(req: NextRequest) {
  const g = await shipAdmin(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    const shipment = await createShipment({ orderId: positiveId(body.orderId), carrier: body.carrier, trackingCode: body.trackingCode, weightGrams: body.weightGrams, parcels: body.parcels, costRial: body.costRial, note: body.note, actorId: g.admin.id })
    await auditAdmin({ req, actor: g.admin, action: 'shipping.waybill.create', targetType: 'order', targetId: shipment.orderId, metadata: { waybill: shipment.waybill, carrier: shipment.carrier } })
    return ok(await adminShipment(shipment.id), 201)
  } catch (error) { return failure(error) }
}

/** GET /api/admin/shipping/shipments/:id  (or ?order=1 to look up by order id) */
export async function GET_shipment(req: NextRequest, { params }: IdContext) {
  const g = await shipAdmin(req)
  if ('response' in g) return g.response
  const id = positiveId((await params).id)
  const view = req.nextUrl.searchParams.get('order') === '1' ? await orderShipment(id) : await adminShipment(id)
  return view ? ok(view) : err('بارنامه پیدا نشد', 404)
}

/** PATCH /api/admin/shipping/shipments/:id { status?, trackingCode?, note?, location?, costRial? } */
export async function PATCH_shipment(req: NextRequest, { params }: IdContext) {
  const g = await shipAdmin(req)
  if ('response' in g) return g.response
  const id = positiveId((await params).id)
  const body = (await req.json().catch(() => null)) || {}
  try {
    await updateShipment({ id, status: body.status, trackingCode: body.trackingCode, note: body.note, location: body.location, costRial: body.costRial, actorId: g.admin.id })
    await auditAdmin({ req, actor: g.admin, action: 'shipping.waybill.update', targetType: 'shipment', targetId: id, metadata: { status: body.status, trackingCode: body.trackingCode } })
    return ok(await adminShipment(id))
  } catch (error) { return failure(error) }
}
