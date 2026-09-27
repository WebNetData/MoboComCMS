import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { getSettings } from '@/modules/settings/server'
import { executeCheckout } from '@/modules/checkout/server/checkout'
import { StoreError } from '@/modules/store/domain/store'
import { CART_COOKIE, addToCart, cartCheckoutLines, cartView, clearCart, removePurchasedLines, updateCartLine, type CartOwner } from '@/modules/store/server/cart'
import { getStoreSettings, saveStoreSettings } from '@/modules/store/server/catalog'
import { addOrderNote, adminOrder, adminOrders, transitionOrder } from '@/modules/store/server/orders'
import { adminProducts, bulkProducts, deleteBrand, inventoryList, listBrands, saveBrand, storeCustomers, storeDashboard, updateStock } from '@/modules/store/server/admin'

function failure(error: unknown) {
  if (error instanceof StoreError) return err(error.message, error.status, { code: error.code })
  console.error('[store]', error)
  return err('خطای داخلی؛ دوباره تلاش کنید', 500)
}

const COOKIE_AGE = 60 * 60 * 24 * 60

async function owner(req: NextRequest): Promise<CartOwner> {
  const user = await requireUser(req)
  return { userId: user?.id ?? null, token: req.cookies.get(CART_COOKIE)?.value || null }
}

/** JSON response that keeps the browser's cart cookie in sync. */
function withCart(body: unknown, token: string, status = 200) {
  const response = ok(body, status)
  if (token) response.cookies.set(CART_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: COOKIE_AGE })
  return response
}

// ------------------------------------------------------------------ cart (public)

/** GET /api/cart — the cart with live prices and stock. */
export async function GET_cart(req: NextRequest) {
  const off = await moduleGuard('store')
  if (off) return off
  const who = await owner(req)
  const view = await cartView(who)
  return withCart({ cart: view }, view.token)
}

/** POST /api/cart { productId, variantId?, quantity? } — adds to the cart. */
export async function POST_cart(req: NextRequest) {
  const off = await moduleGuard('store')
  if (off) return off
  const who = await owner(req)
  const body = (await req.json().catch(() => null)) || {}
  try {
    const added = await addToCart(who, body)
    const view = await cartView({ ...who, token: added.token })
    return withCart({ cart: view, limited: added.limited }, view.token || added.token)
  } catch (error) { return failure(error) }
}

/** PATCH /api/cart { lineId, quantity } — changes a line (0 removes it). */
export async function PATCH_cart(req: NextRequest) {
  const off = await moduleGuard('store')
  if (off) return off
  const who = await owner(req)
  const body = (await req.json().catch(() => null)) || {}
  const lineId = Number(body.lineId)
  if (!Number.isSafeInteger(lineId) || lineId <= 0) return err('ردیف نامعتبر است')
  try {
    await updateCartLine(who, lineId, body.quantity)
    const view = await cartView(who)
    return withCart({ cart: view }, view.token)
  } catch (error) { return failure(error) }
}

/** DELETE /api/cart — empties the cart. */
export async function DELETE_cart(req: NextRequest) {
  const off = await moduleGuard('store')
  if (off) return off
  const who = await owner(req)
  await clearCart(who)
  const view = await cartView(who)
  return withCart({ cart: view }, view.token)
}

/**
 * POST /api/cart/checkout { addressId?, delivery?, gatewayRef?, discountCode?, payWith? }
 * Places one order for every line in the cart; the bought lines leave the cart.
 */
export async function POST_cartCheckout(req: NextRequest) {
  const off = await moduleGuard('store')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401, { code: 'NEED_LOGIN' })
  const who: CartOwner = { userId: user.id, token: req.cookies.get(CART_COOKIE)?.value || null }
  const body = (await req.json().catch(() => null)) || {}
  const settings = await getSettings()
  const siteUrl = (settings.siteUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const idempotencyKey = String(req.headers.get('idempotency-key') || body.idempotencyKey || '').trim()
  let lines
  try { lines = await cartCheckoutLines(who) } catch (error) {
    // A retry after a lost response finds the cart already emptied: replay the placed order.
    if (error instanceof StoreError && error.code === 'CART_EMPTY' && idempotencyKey) {
      const replay = await executeCheckout({ userId: user.id, idempotencyKey, siteUrl })
      if (replay.ok) return ok(replay.data)
    }
    return failure(error)
  }
  const result = await executeCheckout({
    userId: user.id,
    email: user.email,
    lines: lines.lines,
    addressId: Number.isSafeInteger(Number(body.addressId)) && Number(body.addressId) > 0 ? Number(body.addressId) : null,
    delivery: body.delivery && typeof body.delivery === 'object' ? { date: String(body.delivery.date || '').slice(0, 10), slotId: String(body.delivery.slotId || '').slice(0, 20) } : null,
    payWith: body.payWith === 'wallet' ? 'wallet' : body.payWith === 'gateway' ? 'gateway' : undefined,
    gatewayRef: typeof body.gatewayRef === 'string' ? body.gatewayRef.trim() : undefined,
    discountCode: typeof body.discountCode === 'string' ? body.discountCode : undefined,
    idempotencyKey,
    siteUrl,
    channel: 'web',
  })
  if (!result.ok) return err(result.message, result.status, { code: result.code, ...(result.meta || {}) })
  await removePurchasedLines(who, lines.lines.map((line) => line.lineId)).catch(() => {})
  return ok(result.data)
}

// ------------------------------------------------------------------ admin

const orderAdmin = (req: NextRequest) => adminGuard(req, 'store', ['orders.manage'])
const catalogAdmin = (req: NextRequest) => adminGuard(req, 'store', ['cms.products'])
const anyStoreAdmin = (req: NextRequest) => adminGuard(req, 'store', ['orders.manage', 'cms.products', 'settings.manage'])
const positiveId = (value: unknown) => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}
type IdContext = { params: Promise<{ id: string }> }

/** GET /api/admin/store/dashboard */
export async function GET_dashboard(req: NextRequest) {
  const g = await anyStoreAdmin(req)
  if ('response' in g) return g.response
  return ok(await storeDashboard())
}

/** GET /api/admin/store/orders?tab=&q=&page=&date= */
export async function GET_orders(req: NextRequest) {
  const g = await orderAdmin(req)
  if ('response' in g) return g.response
  const params = req.nextUrl.searchParams
  return ok(await adminOrders({ tab: params.get('tab') || 'all', q: params.get('q') || '', page: Number(params.get('page')) || 1, date: params.get('date') || '' }))
}

/** GET /api/admin/store/orders/:id */
export async function GET_order(req: NextRequest, { params }: IdContext) {
  const g = await orderAdmin(req)
  if ('response' in g) return g.response
  const id = positiveId((await params).id)
  const order = id ? await adminOrder(id) : null
  return order ? ok(order) : err('سفارش پیدا نشد', 404)
}

/**
 * POST /api/admin/store/orders/:id
 *   { action: 'status', to, trackingCode?, note?, digitalDelivery?, notify?, restock? }
 *   { action: 'note', note, visible }
 */
export async function POST_order(req: NextRequest, { params }: IdContext) {
  const g = await orderAdmin(req)
  if ('response' in g) return g.response
  const id = positiveId((await params).id)
  if (!id) return err('invalid id')
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (body.action === 'status') {
      const result = await transitionOrder({ orderId: id, to: String(body.to || ''), actorId: g.admin.id, trackingCode: body.trackingCode, note: body.note, digitalDelivery: body.digitalDelivery, notify: body.notify !== false, restock: body.restock === true })
      await auditAdmin({ req, actor: g.admin, action: 'store.order.status', targetType: 'order', targetId: id, metadata: { to: result.status, restock: body.restock === true } })
    } else if (body.action === 'note') {
      await addOrderNote({ orderId: id, note: body.note, visible: body.visible === true, actorId: g.admin.id })
      await auditAdmin({ req, actor: g.admin, action: 'store.order.note', targetType: 'order', targetId: id, metadata: { visible: body.visible === true } })
    } else return err('unknown action')
    return ok(await adminOrder(id))
  } catch (error) { return failure(error) }
}

/** GET /api/admin/store/products?q=&category=&brand=&status=&stock=&kind=&sort=&page= */
export async function GET_products(req: NextRequest) {
  const g = await catalogAdmin(req)
  if ('response' in g) return g.response
  const params = Object.fromEntries(req.nextUrl.searchParams)
  return ok(await adminProducts({ ...params, page: Number(params.page) || 1 }))
}

/** POST /api/admin/store/products { ids, action, value?, round?, endsAt? } — bulk edit. */
export async function POST_products(req: NextRequest) {
  const g = await catalogAdmin(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    const result = await bulkProducts(body)
    await auditAdmin({ req, actor: g.admin, action: 'store.products.bulk', targetType: 'product', targetId: 0, metadata: { action: String(body.action), count: Array.isArray(body.ids) ? body.ids.length : 0, value: String(body.value ?? '') } })
    return ok(result)
  } catch (error) { return failure(error) }
}

/** GET /api/admin/store/inventory?q=&filter=&page= */
export async function GET_inventory(req: NextRequest) {
  const g = await catalogAdmin(req)
  if ('response' in g) return g.response
  const params = req.nextUrl.searchParams
  return ok(await inventoryList({ q: params.get('q') || '', filter: params.get('filter') || '', page: Number(params.get('page')) || 1 }))
}

/** POST /api/admin/store/inventory { items: [{ productId, variantId?, stock, lowStockAt? }] } */
export async function POST_inventory(req: NextRequest) {
  const g = await catalogAdmin(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    const result = await updateStock(body.items)
    await auditAdmin({ req, actor: g.admin, action: 'store.inventory.update', targetType: 'product', targetId: 0, metadata: { items: result.updated } })
    return ok(result)
  } catch (error) { return failure(error) }
}

/** GET/POST /api/admin/store/brands, PATCH/DELETE /api/admin/store/brands/:id */
export async function GET_brands(req: NextRequest) {
  const g = await catalogAdmin(req)
  if ('response' in g) return g.response
  return ok({ brands: await listBrands() })
}

export async function POST_brands(req: NextRequest) {
  const g = await catalogAdmin(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    const brand = await saveBrand(body)
    await auditAdmin({ req, actor: g.admin, action: 'store.brand.create', targetType: 'brand', targetId: brand.id, metadata: { slug: brand.slug } })
    return ok({ brand }, 201)
  } catch (error) { return failure(error) }
}

export async function PATCH_brand(req: NextRequest, { params }: IdContext) {
  const g = await catalogAdmin(req)
  if ('response' in g) return g.response
  const id = positiveId((await params).id)
  if (!id) return err('invalid id')
  const body = (await req.json().catch(() => null)) || {}
  try {
    const brand = await saveBrand(body, id)
    await auditAdmin({ req, actor: g.admin, action: 'store.brand.update', targetType: 'brand', targetId: id, metadata: { slug: brand.slug } })
    return ok({ brand })
  } catch (error) { return failure(error) }
}

export async function DELETE_brand(req: NextRequest, { params }: IdContext) {
  const g = await catalogAdmin(req)
  if ('response' in g) return g.response
  const id = positiveId((await params).id)
  if (!id) return err('invalid id')
  try {
    await deleteBrand(id)
    await auditAdmin({ req, actor: g.admin, action: 'store.brand.delete', targetType: 'brand', targetId: id, metadata: {} })
    return ok({ deleted: true })
  } catch (error) { return failure(error) }
}

/** GET /api/admin/store/customers?q=&page=&sort= */
export async function GET_customers(req: NextRequest) {
  const g = await adminGuard(req, 'store', ['orders.manage', 'users.manage'])
  if ('response' in g) return g.response
  const params = req.nextUrl.searchParams
  return ok(await storeCustomers({ q: params.get('q') || '', page: Number(params.get('page')) || 1, sort: params.get('sort') || '' }))
}

/** GET/POST /api/admin/store/settings — shop landing slides, banners, badges and thresholds. */
export async function GET_storeSettings(req: NextRequest) {
  const g = await adminGuard(req, 'store', ['settings.manage', 'cms.products'])
  if ('response' in g) return g.response
  return ok({ settings: await getStoreSettings() })
}

export async function POST_storeSettings(req: NextRequest) {
  const g = await adminGuard(req, 'store', ['settings.manage', 'cms.products'])
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  const settings = await saveStoreSettings(body)
  await auditAdmin({ req, actor: g.admin, action: 'store.settings.update', targetType: 'setting', targetId: 0, metadata: { slides: settings.slides.length, banners: settings.banners.length } })
  return ok({ settings })
}
