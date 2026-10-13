import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requireUser } from '@/modules/identity/server/access'
import { MarketplaceError } from '@/modules/marketplace/domain/marketplace'
import { originIsThisSite } from '@/platform/http/origin-policy'
import {
  activeSeller, adjustSeller, adminPayouts, adminSellers, applySeller, categoryForm, decideProduct, decideSeller, getMarketplaceSettings, marketplaceEnabled,
  marketplaceOverview, moveLine, pendingProducts, processPayout, quickUpdate, replyReview, requestPayout, reviewSeller, reviewableSellers,
  saveMarketplaceSettings, saveSellerProduct, sellerDashboard, sellerFinance, sellerLedgerForAdmin, sellerOfUser, sellerOrders, sellerProduct, sellerProducts,
  sellerReviews, updateSellerProfile,
} from '@/modules/marketplace/server/marketplace'

const failure = (error: unknown) => {
  if (error instanceof MarketplaceError) return err(error.message, error.status, { code: error.code })
  throw error
}
const body = async (req: NextRequest) => ((await req.json().catch(() => null)) || {}) as Record<string, unknown>
const idOf = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0 }

async function seller(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) throw new MarketplaceError('ابتدا وارد حساب خود شوید', 401, 'NEED_LOGIN')
  return { user, seller: await activeSeller(user.id) }
}

// ------------------------------------------------------------------ seller: account

/** GET /api/seller — application state, or the dashboard of an approved shop. */
export async function GET_account(req: NextRequest) {
  if (!await marketplaceEnabled()) return err('not found', 404)
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401, { code: 'NEED_LOGIN' })
  const settings = await getMarketplaceSettings()
  const own = await sellerOfUser(user.id)
  return ok({
    signupOpen: settings.signupOpen, terms: settings.terms,
    seller: own ? { ...own, ratingSum: undefined } : null,
    dashboard: own?.status === 'ACTIVE' ? await sellerDashboard(own) : null,
  })
}

/** POST /api/seller — apply to become a seller. PUT — edit the shop profile. */
export async function POST_account(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401, { code: 'NEED_LOGIN' })
  if (!rateLimitHit(`seller-apply:${user.id}`, 5, 3_600_000).ok) return err('تعداد درخواست‌ها زیاد است؛ کمی بعد تلاش کنید', 429)
  try { return ok({ seller: await applySeller(user.id, await body(req)) }) } catch (error) { return failure(error) }
}

export async function PUT_account(req: NextRequest) {
  try {
    const { seller: shop } = await seller(req)
    return ok({ seller: await updateSellerProfile(shop, await body(req)) })
  } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ seller: products

/** GET /api/seller/products?q=&status=&page= | ?meta=1 (categories and brands for the form) | ?categoryId= (category fields). */
export async function GET_products(req: NextRequest) {
  try {
    const { seller: shop } = await seller(req)
    const q = req.nextUrl.searchParams
    if (q.get('meta') === '1') {
      const [categories, brands] = await Promise.all([
        db.productCategory.findMany({ select: { id: true, name: true, parentId: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
        db.productBrand.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      ])
      return ok({ categories, brands })
    }
    if (q.get('categoryId')) return ok(await categoryForm(idOf(q.get('categoryId'))).catch(() => ({ fields: [], appliesTo: 'ANY' })))
    if (q.get('id')) return ok(await sellerProduct(shop.id, idOf(q.get('id'))))
    return ok(await sellerProducts(shop.id, { q: q.get('q') || '', status: q.get('status') || '', page: Number(q.get('page')) || 1 }))
  } catch (error) { return failure(error) }
}

/** POST — create; PUT {id, ...} — full save; PATCH {id, active|stock|price} — quick edit from the list. */
export async function POST_products(req: NextRequest) {
  try {
    const { seller: shop } = await seller(req)
    const row = await saveSellerProduct(shop, await body(req))
    return ok({ id: row.id, approval: row.approval })
  } catch (error) { return failure(error) }
}

export async function PUT_products(req: NextRequest) {
  try {
    const { seller: shop } = await seller(req)
    const input = await body(req)
    const row = await saveSellerProduct(shop, input, idOf(input.id))
    return ok({ id: row.id, approval: row.approval })
  } catch (error) { return failure(error) }
}

export async function PATCH_products(req: NextRequest) {
  try {
    const { seller: shop } = await seller(req)
    const input = await body(req)
    const row = await quickUpdate(shop, idOf(input.id), input)
    return ok({ id: row.id, active: row.active, stock: row.stock })
  } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ seller: orders, money, reviews

export async function GET_orders(req: NextRequest) {
  try {
    const { seller: shop } = await seller(req)
    const q = req.nextUrl.searchParams
    return ok(await sellerOrders(shop, { tab: q.get('tab') || 'open', page: Number(q.get('page')) || 1 }))
  } catch (error) { return failure(error) }
}

/** POST {lineId, to: ACCEPTED|READY|SHIPPED, tracking?} */
export async function POST_orders(req: NextRequest) {
  try {
    const { seller: shop } = await seller(req)
    const input = await body(req)
    return ok(await moveLine(shop, idOf(input.lineId), String(input.to || ''), input.tracking))
  } catch (error) { return failure(error) }
}

export async function GET_finance(req: NextRequest) {
  try {
    const { seller: shop } = await seller(req)
    return ok(await sellerFinance(shop, Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1)))
  } catch (error) { return failure(error) }
}

/** POST {amount} — withdrawal request. */
export async function POST_finance(req: NextRequest) {
  try {
    const { seller: shop } = await seller(req)
    const payout = await requestPayout(shop, (await body(req)).amount)
    return ok({ id: payout.id })
  } catch (error) { return failure(error) }
}

export async function GET_reviews(req: NextRequest) {
  try {
    const { seller: shop } = await seller(req)
    return ok({ reviews: await sellerReviews(shop.id, 100) })
  } catch (error) { return failure(error) }
}

export async function POST_reviews(req: NextRequest) {
  try {
    const { seller: shop } = await seller(req)
    const input = await body(req)
    await replyReview(shop, idOf(input.id), input.reply)
    return ok({ ok: true })
  } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ customer

/** GET /api/store/seller-review?orderId= — sellers to rate; POST — rate one. */
export async function GET_customerReview(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401)
  if (!await marketplaceEnabled()) return ok({ sellers: [] })
  return ok({ sellers: await reviewableSellers(user.id, idOf(req.nextUrl.searchParams.get('orderId'))) })
}

export async function POST_customerReview(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401)
  try { return ok(await reviewSeller(user.id, await body(req))) } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ admin

const MANAGE = ['marketplace.manage', 'cms.products', 'settings.manage']

/** GET /api/admin/marketplace?view=overview|sellers|products|payouts|settings|ledger */
export async function GET_admin(req: NextRequest) {
  const guard = await adminGuard(req, 'marketplace', MANAGE)
  if ('response' in guard) return guard.response
  const q = req.nextUrl.searchParams
  try {
    switch (q.get('view')) {
      case 'sellers': return ok(await adminSellers({ status: q.get('status') || '', q: q.get('q') || '' }))
      case 'products': return ok({ rows: await pendingProducts() })
      case 'payouts': return ok({ rows: await adminPayouts(q.get('status') || 'REQUESTED') })
      case 'settings': return ok({ settings: await getMarketplaceSettings(), categories: await db.productCategory.findMany({ select: { id: true, name: true, parentId: true }, orderBy: { name: 'asc' } }) })
      case 'ledger': return ok(await sellerLedgerForAdmin(idOf(q.get('sellerId'))))
      default: return ok(await marketplaceOverview())
    }
  } catch (error) { return failure(error) }
}

/** POST {op: seller|product|payout|adjust, ...} */
export async function POST_admin(req: NextRequest) {
  const guard = await adminGuard(req, 'marketplace', MANAGE)
  if ('response' in guard) return guard.response
  const input = await body(req)
  const id = idOf(input.id)
  try {
    if (input.op === 'seller') await decideSeller({ id, action: String(input.action || ''), note: input.note, commissionPercent: input.commissionPercent })
    else if (input.op === 'product') await decideProduct({ id, action: String(input.action || ''), note: input.note })
    else if (input.op === 'payout') await processPayout({ id, action: String(input.action || ''), reference: input.reference, note: input.note, actorId: guard.admin.id })
    else if (input.op === 'adjust') await adjustSeller({ sellerId: idOf(input.sellerId), amount: input.amount, note: input.note, actorId: guard.admin.id })
    else return err('عملیات نامعتبر است', 400)
    await auditAdmin({ req, actor: guard.admin, action: `marketplace.${String(input.op)}.${String(input.action || '')}`.replace(/\.$/, ''), targetType: String(input.op), targetId: String(id || input.sellerId || ''), metadata: { note: input.note ?? null, reference: input.reference ?? null, amount: input.amount ?? null } })
    return ok({ ok: true })
  } catch (error) { return failure(error) }
}

export async function PUT_admin(req: NextRequest) {
  const guard = await adminGuard(req, 'marketplace', ['marketplace.manage', 'settings.manage'])
  if ('response' in guard) return guard.response
  const settings = await saveMarketplaceSettings((await body(req)).settings)
  await auditAdmin({ req, actor: guard.admin, action: 'marketplace.settings', targetType: 'settings', targetId: 'marketplace', metadata: { defaultCommission: settings.defaultCommission, holdDays: settings.holdDays } })
  return ok({ settings })
}

/** POST /api/seller/media — product photos for approved sellers (same pipeline as the admin: WebP, 2400px max). */
export async function POST_media(req: NextRequest) {
  if (!originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  try {
    const { user } = await seller(req)
    if (!rateLimitHit(`seller-media:${user.id}`, 120, 3_600_000).ok) return err('تعداد بارگذاری‌ها زیاد است؛ کمی بعد تلاش کنید', 429)
    const { receiveImage } = await import('@/modules/site/server/http/admin/media/route')
    return receiveImage(req)
  } catch (error) { return failure(error) }
}
