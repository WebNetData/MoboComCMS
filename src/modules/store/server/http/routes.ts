import type { NextRequest } from 'next/server'
import { recordStoreFunnelEvent } from '@/modules/analytics/server/collect'
import { addCodes, listCodes, removeCode, replaceCode, setCodesWhenEmpty, setDigitalMode } from '@/modules/store/server/digital-codes'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { getSettings } from '@/modules/settings/server'
import { executeCheckout } from '@/modules/checkout/server/checkout'
import { StoreError } from '@/modules/store/domain/store'
import { LocationError } from '@/modules/catalog/server/locations'
import { addProductBundle } from '@/modules/store/server/bundles'
import { CART_COOKIE, addToCart, cartCheckoutLines, cartView, clearCart, removePurchasedLines, updateCartLine, type CartOwner } from '@/modules/store/server/cart'
import { getStoreSettings, saveStoreSettings } from '@/modules/store/server/catalog'
import { publishedPageOptions } from '@/modules/site/server/public-pages'
import { sectionSettingsSaveWith } from '@/modules/settings/server/http/section-history'
import { sectionSettingsRevision } from '@/modules/settings/server/section-history'
import { markCartRecovered } from '@/modules/store/server/marketing'
import { addOrderNote, adminOrder, adminOrders, eraseOrderInputs, revealOrderInputs, transitionOrder } from '@/modules/store/server/orders'
import { db } from '@/platform/database/prisma'
import { OrderInputError, parseOpenAmount } from '@/modules/store/domain/order-inputs'
import { openAmountPrice } from '@/modules/store/server/order-inputs'
import { isPublishedProduct } from '@/modules/catalog/domain/product-publication'
import { minorToNumber } from '@/shared/money'
import { adminProducts, bulkProducts, deleteBrand, inventoryList, listBrands, saveBrand, storeCustomers, storeDashboard, updateStock } from '@/modules/store/server/admin'
import { enqueue } from '@/modules/operations/server/queue'
import { assignOrder, orderSpecialists } from '@/modules/store/server/order-work'
import { opensAudience } from '@/modules/account/server/item-audience'

function failure(error: unknown) {
  if (error instanceof StoreError) return err(error.message, error.status, { code: error.code })
  if (error instanceof LocationError) return err(error.message, error.status)
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
    if (body.bundleId !== undefined && (body.productId !== undefined || body.variantId !== undefined || body.quantity !== undefined)) throw new StoreError('یک کالا یا یک بسته را انتخاب کنید')
    const added = body.bundleId === undefined ? await addToCart(who, body) : await addProductBundle(who, body.bundleId)
    const view = await cartView({ ...who, token: added.token })
    await recordStoreFunnelEvent('cart', req.headers).catch(() => false)
    return withCart({ cart: view, limited: added.limited }, view.token || added.token)
  } catch (error) { return failure(error) }
}

/**
 * POST /api/cart/quote { productId, amount, currency } — what a typed foreign amount costs right now
 * (rate + the product's percentage + its fixed profit). The cart and checkout price it again themselves.
 */
export async function POST_cartQuote(req: NextRequest) {
  const off = await moduleGuard('store')
  if (off) return off
  const body = (await req.json().catch(() => null)) || {}
  const id = Number(body.productId)
  const product = Number.isSafeInteger(id) && id > 0 ? await db.product.findUnique({ where: { id } }) : null
  if (!product || !(isPublishedProduct(product) && await opensAudience(product.audienceGroups, 'product')) || !product.openAmount) return err('این خدمت پیدا نشد', 404, { code: 'PRODUCT_NOT_FOUND' })
  try {
    const typed = parseOpenAmount(product, body)
    const quote = await openAmountPrice(product, typed.amountMinor, typed.currency)
    const show = (minor: bigint) => minorToNumber(minor, quote.currency)
    return ok({ price: show(quote.priceMinor), currency: quote.currency, rate: quote.rate, conversion: show(quote.conversionMinor), fee: show(quote.priceMinor - quote.conversionMinor), amount: (Number(typed.amountMinor) / 100).toFixed(2), amountCurrency: typed.currency })
  } catch (error) {
    if (error instanceof OrderInputError) return err(error.message, error.status, { code: error.code })
    return failure(error)
  }
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
  try {
    await clearCart(who)
    const view = await cartView(who)
    return withCart({ cart: view }, view.token)
  } catch (error) { return failure(error) }
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
    surface: body?.surface === 'dashboard' ? 'dashboard' : undefined,
    addressId: Number.isSafeInteger(Number(body.addressId)) && Number(body.addressId) > 0 ? Number(body.addressId) : null,
    delivery: body.delivery && typeof body.delivery === 'object' ? { date: String(body.delivery.date || '').slice(0, 10), slotId: String(body.delivery.slotId || '').slice(0, 20) } : null,
    carrierId: typeof body?.carrierId === 'string' ? body.carrierId.slice(0, 30) : null,
    shippingMode: body?.shippingMode === 'PICKUP' ? 'PICKUP' : 'SHIP',
    gift: body.gift,
    payWith: body.payWith === 'wallet' ? 'wallet' : body.payWith === 'gateway' ? 'gateway' : undefined,
    gatewayRef: typeof body.gatewayRef === 'string' ? body.gatewayRef.trim() : undefined,
    discountCode: typeof body.discountCode === 'string' ? body.discountCode : undefined,
    idempotencyKey,
    siteUrl,
    channel: 'web',
  })
  if (!result.ok) return err(result.message, result.status, { code: result.code, ...(result.meta || {}) })
  // A replay returns the old order; today's cart may contain a new purchase.
  if (!result.data.replayed) {
    await removePurchasedLines(who, lines.lines.map((line) => line.lineId), lines.snapshot).catch(() => {})
    if (typeof result.data.orderId === 'number') await markCartRecovered(user.id, result.data.orderId).catch(() => {})
  }
  return ok(result.data)
}

// ------------------------------------------------------------------ admin

const orderAdmin = (req: NextRequest) => adminGuard(req, 'store', ['orders.manage'])
const orderWorker = (req: NextRequest) => adminGuard(req, 'store', ['orders.manage', 'store.orders.handle'])
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
  const g = await orderWorker(req)
  if ('response' in g) return g.response
  const params = req.nextUrl.searchParams
  return ok(await adminOrders({ tab: params.get('tab') || 'all', q: params.get('q') || '', page: Number(params.get('page')) || 1, date: params.get('date') || '', work: params.get('work') || '' }, { actorId: g.admin.id, manager: (g.admin.roleId == null || !!g.admin.permissions?.includes('orders.manage')) }))
}

/** GET /api/admin/store/orders/:id */
export async function GET_order(req: NextRequest, { params }: IdContext) {
  const g = await orderWorker(req)
  if ('response' in g) return g.response
  const id = positiveId((await params).id)
  const manager = (g.admin.roleId == null || !!g.admin.permissions?.includes('orders.manage'))
  const order = id ? await adminOrder(id, { actorId: g.admin.id, manager }) : null
  return order ? ok({ ...order, specialists: manager ? await orderSpecialists() : [] }) : err('سفارش پیدا نشد', 404)
}

/**
 * POST /api/admin/store/orders/:id
 *   { action: 'status', to, trackingCode?, note?, digitalDelivery?, notify?, restock? }
 *   { action: 'note', note, visible }
 *   { action: 'reveal-inputs', lineId } — the buyer's answers in full (recorded)
 *   { action: 'erase-inputs', lineId? } — wipes them
 */
export async function POST_order(req: NextRequest, { params }: IdContext) {
  const g = await orderWorker(req)
  if ('response' in g) return g.response
  const id = positiveId((await params).id)
  if (!id) return err('invalid id')
  const body = (await req.json().catch(() => null)) || {}
  const scope = { actorId: g.admin.id, manager: (g.admin.roleId == null || !!g.admin.permissions?.includes('orders.manage')) }
  try {
    if (body.action === 'assign' || body.action === 'take') {
      const result = await assignOrder(id, body.action === 'take' ? g.admin.id : body.assigneeId, scope)
      await auditAdmin({ req, actor: g.admin, action: 'store.order.assign', targetType: 'order', targetId: id, metadata: result })
      return ok(result)
    }
    if (!scope.manager && (body.action === 'erase-inputs' || body.restock === true || ['CANCELLED', 'RETURNED'].includes(String(body.to || '')))) return err('این عملیات فقط با مدیر سفارش‌ها است', 403)
    if (body.action === 'status') {
      const result = await transitionOrder({ orderId: id, to: String(body.to || ''), actorId: g.admin.id, trackingCode: body.trackingCode, note: body.note, digitalDelivery: body.digitalDelivery, notify: body.notify !== false, restock: body.restock === true, scope })
      await auditAdmin({ req, actor: g.admin, action: 'store.order.status', targetType: 'order', targetId: id, metadata: { to: result.status, restock: body.restock === true } })
    } else if (body.action === 'note') {
      await addOrderNote({ orderId: id, note: body.note, visible: body.visible === true, actorId: g.admin.id, scope })
      await auditAdmin({ req, actor: g.admin, action: 'store.order.note', targetType: 'order', targetId: id, metadata: { visible: body.visible === true } })
    } else if (body.action === 'reveal-inputs') {
      const lineId = positiveId(body.lineId)
      const inputs = await revealOrderInputs(id, lineId, scope)
      // Who read a customer's login is on the record, before the answer leaves the server.
      await auditAdmin({ req, actor: g.admin, action: 'store.order.inputs_reveal', targetType: 'order', targetId: id, metadata: { lineId, fields: inputs.map((answer) => answer.key) } })
      return ok({ lineId, inputs })
    } else if (body.action === 'erase-inputs') {
      const lineId = positiveId(body.lineId) || null
      const erased = await eraseOrderInputs({ orderId: id, lineId, actorId: g.admin.id })
      await auditAdmin({ req, actor: g.admin, action: 'store.order.inputs_erase', targetType: 'order', targetId: id, metadata: { lineId, erased } })
    } else return err('unknown action')
    return ok(await adminOrder(id, scope))
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

/** GET /api/admin/store/products/:id/codes — the code pool of a virtual product (codes masked). */
export async function GET_productCodes(req: NextRequest, { params }: IdContext) {
  const g = await catalogAdmin(req)
  if ('response' in g) return g.response
  const id = positiveId((await params).id)
  if (!id) return err('شناسهٔ محصول معتبر نیست', 400)
  try { return ok(await listCodes(id)) } catch (error) { return failure(error) }
}

/**
 * POST /api/admin/store/products/:id/codes
 *   { action: 'mode', mode: MANUAL | CODES } · { action: 'add', text, variantId? } · { action: 'remove', codeId }
 *   { action: 'replace', codeId, note? } — a delivered code that did not work: void it and give the buyer another
 */
export async function POST_productCodes(req: NextRequest, { params }: IdContext) {
  const g = await catalogAdmin(req)
  if ('response' in g) return g.response
  const id = positiveId((await params).id)
  if (!id) return err('شناسهٔ محصول معتبر نیست', 400)
  const body = (await req.json().catch(() => null)) || {}
  try {
    const action = String(body.action || '')
    let result: Record<string, unknown>
    if (action === 'mode') result = await setDigitalMode(id, body.mode)
    else if (action === 'empty') result = await setCodesWhenEmpty(id, body.value)
    else if (action === 'add') result = await addCodes({ productId: id, variantId: body.variantId, text: body.text })
    else if (action === 'remove') result = await removeCode(id, positiveId(body.codeId))
    else if (action === 'replace') result = await replaceCode({ productId: id, codeId: positiveId(body.codeId), actorId: g.admin.id, note: body.note })
    else return err('عملیات ناشناخته است', 400)
    // The codes themselves are never written to the audit log.
    await auditAdmin({ req, actor: g.admin, action: `store.product.codes.${action}`, targetType: 'product', targetId: id, metadata: action === 'add' ? { added: Number(result.added) || 0 } : action === 'mode' ? { mode: String(result.mode) } : action === 'empty' ? { codesWhenEmpty: String(result.codesWhenEmpty) } : { codeId: positiveId(body.codeId) } })
    return ok(result)
  } catch (error) {
    // No encryption key configured: say so instead of a bare server error.
    if (error instanceof Error && /STORE_DELIVERY_KEY/.test(error.message)) return err('برای ذخیرهٔ کد، کلید رمزنگاری فروشگاه (STORE_DELIVERY_KEY) باید روی سرور تنظیم شود', 503)
    return failure(error)
  }
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
    const result = await updateStock(body.items, g.admin.id)
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
  const settings = await getStoreSettings()
  return ok({ settings, settingsRevision: sectionSettingsRevision(settings), purchaseGuidePages: await publishedPageOptions() })
}

export async function POST_storeSettings(req: NextRequest) {
  const g = await adminGuard(req, 'store', ['settings.manage', 'cms.products'])
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  if (body.op === 'price-history-baseline') {
    const job = await enqueue('store.price-history-baseline', {}, { dedupeKey: 'price-history-baseline:0' })
    await auditAdmin({ req, actor: g.admin, action: 'store.price-history.baseline', targetType: 'job', targetId: job.id })
    return ok({ jobId: job.id })
  }
  return sectionSettingsSaveWith(req, g.admin, (context) => saveStoreSettings(body, context), (settings) => ({ settings }))
}
