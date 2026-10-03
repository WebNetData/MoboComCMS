import { cache } from 'react'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { productInput, saveVariants } from '@/modules/catalog/server/product-input'
import { attributeGroupForCategory } from '@/modules/catalog/server/product-config'
import { contentChanged } from '@/modules/content/server/events'
import { minorToNumber, normalizeCurrency, toMinor } from '@/shared/money'
import {
  LINE_STATUS, MarketplaceError, balanceOf, canMoveLine, checkPayout, commissionOf, commissionPercent, normalizeMarketplaceSettings,
  performanceLabel, ratingSummary, refundShare, validateSellerProfile, validateSellerReview,
  type MarketplaceSettings,
} from '@/modules/marketplace/domain/marketplace'

/**
 * Multi-vendor marketplace: sellers apply and run their own shop (products,
 * stock, their order lines), earn sales minus commission into a ledger with a
 * returns hold, withdraw to their IBAN, and get rated by buyers. The site
 * itself stays the merchant of record: customers pay the site, the site pays
 * sellers.
 */

const KEY = 'store.marketplace.v1'
const DAY = 86_400_000

export const marketplaceEnabled = cache(() => isModuleEnabled('marketplace'))

export async function getMarketplaceSettings(): Promise<MarketplaceSettings & { sellerShipsDirectly: boolean }> {
  const raw = (await readJsonSetting(KEY)) as Record<string, unknown> | null
  return { ...normalizeMarketplaceSettings(raw), sellerShipsDirectly: raw?.sellerShipsDirectly === true }
}

export async function saveMarketplaceSettings(input: unknown) {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const next = { ...normalizeMarketplaceSettings(raw), sellerShipsDirectly: raw.sellerShipsDirectly === true }
  await writeJsonSetting(KEY, next)
  return next
}

// ------------------------------------------------------------------ identity

export type SellerRow = NonNullable<Awaited<ReturnType<typeof sellerOfUser>>>

export async function sellerOfUser(userId: number) {
  return db.seller.findUnique({ where: { userId } })
}

/** The signed-in user's shop, which must be approved (seller panel APIs). */
export async function activeSeller(userId: number) {
  if (!await marketplaceEnabled()) throw new MarketplaceError('بازار فروشندگان فعال نیست', 404, 'DISABLED')
  const seller = await sellerOfUser(userId)
  if (!seller) throw new MarketplaceError('هنوز فروشنده نیستید', 403, 'NOT_SELLER')
  if (seller.status !== 'ACTIVE') throw new MarketplaceError(seller.status === 'PENDING' ? 'درخواست فروشندگی شما در حال بررسی است' : 'پنل فروشندگی شما فعال نیست', 403, 'SELLER_' + seller.status)
  return seller
}

async function notifyAdmins(title: string, body: string, href: string, dedupeKey: string) {
  const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true }, take: 20 })
  await Promise.all(admins.map((admin) => createInboxEvent({ userId: admin.id, kind: 'MARKETPLACE', dedupeKey: `${dedupeKey}:${admin.id}`, titleFa: title, titleEn: title, bodyFa: body, bodyEn: body, href }).catch(() => undefined)))
}

async function notifySeller(seller: { id: number; userId: number }, title: string, body: string, href: string, dedupeKey: string) {
  await createInboxEvent({ userId: seller.userId, kind: 'MARKETPLACE', dedupeKey, titleFa: title, titleEn: title, bodyFa: body, bodyEn: body, href }).catch(() => undefined)
}

/** "Become a seller": creates the application (or goes live at once when auto-approve is on). */
export async function applySeller(userId: number, input: Record<string, unknown>) {
  if (!await marketplaceEnabled()) throw new MarketplaceError('بازار فروشندگان فعال نیست', 404)
  const settings = await getMarketplaceSettings()
  const existing = await sellerOfUser(userId)
  if (existing && existing.status !== 'REJECTED') throw new MarketplaceError('شما قبلاً درخواست فروشندگی داده‌اید', 409)
  if (!existing && !settings.signupOpen) throw new MarketplaceError('ثبت‌نام فروشنده در حال حاضر بسته است', 403)
  if (input.acceptTerms !== true) throw new MarketplaceError('برای ادامه، قوانین فروشندگی را بپذیرید')
  const profile = validateSellerProfile(input)
  if (!profile.phone) throw new MarketplaceError('شمارهٔ تماس فروشگاه را وارد کنید')
  const taken = await db.seller.findFirst({ where: { slug: profile.slug, NOT: { userId } }, select: { id: true } })
  if (taken) throw new MarketplaceError('این نشانی فروشگاه قبلاً گرفته شده است', 409)
  const status = settings.autoApproveSellers ? 'ACTIVE' : 'PENDING'
  const data = { ...profile, status, statusNote: '', approvedAt: status === 'ACTIVE' ? new Date() : null }
  const seller = existing ? await db.seller.update({ where: { id: existing.id }, data }) : await db.seller.create({ data: { ...data, userId } })
  if (status === 'PENDING') await notifyAdmins('درخواست فروشندگی تازه', `«${seller.shopName}» منتظر بررسی است.`, '/admin/marketplace?status=PENDING', `seller-apply:${seller.id}:${Date.now()}`)
  return seller
}

export async function updateSellerProfile(seller: SellerRow, input: Record<string, unknown>) {
  const profile = validateSellerProfile({ ...seller, ...input }, { requireLegal: false })
  if (profile.slug !== seller.slug && await db.seller.findFirst({ where: { slug: profile.slug, NOT: { id: seller.id } }, select: { id: true } })) throw new MarketplaceError('این نشانی فروشگاه قبلاً گرفته شده است', 409)
  // Legal identity is fixed after approval; the admin changes it if needed.
  const { legalName: _legal, nationalId: _national, kind: _kind, ...editable } = profile
  return db.seller.update({ where: { id: seller.id }, data: editable })
}

// ------------------------------------------------------------------ dashboard

export async function sellerDashboard(seller: SellerRow) {
  const since = new Date(Date.now() - 30 * DAY)
  const [ledger, lines30, openLines, products, pendingProducts, lowStock, reviews] = await Promise.all([
    db.sellerLedger.findMany({ where: { sellerId: seller.id }, select: { kind: true, amountMinor: true, availableAt: true } }),
    db.orderLine.findMany({ where: { sellerId: seller.id, order: { status: { in: ['PAID', 'REFUNDED'] } }, createdAt: { gte: since } }, select: { totalMinor: true, quantity: true, commissionMinor: true, createdAt: true } }),
    db.orderLine.count({ where: { sellerId: seller.id, order: { status: 'PAID' }, sellerStatus: { in: ['', 'ACCEPTED', 'READY'] } } }),
    db.product.count({ where: { sellerId: seller.id, active: true } }),
    db.product.count({ where: { sellerId: seller.id, approval: 'PENDING' } }),
    db.product.findMany({ where: { sellerId: seller.id, active: true, stock: { gte: 0, lte: 3 } }, select: { id: true, name: true, stock: true }, take: 8 }),
    db.sellerReview.findMany({ where: { sellerId: seller.id, status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ])
  const money = balanceOf(ledger)
  const byDay = new Map<string, bigint>()
  for (const line of lines30) { const day = line.createdAt.toISOString().slice(0, 10); byDay.set(day, (byDay.get(day) || 0n) + line.totalMinor) }
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * DAY).toISOString().slice(0, 10))
  const rating = ratingSummary(seller.ratingSum, seller.ratingCount)
  return {
    shop: publicSeller(seller),
    money: { balance: Number(money.balance), available: Number(money.available), pending: Number(money.pending) },
    sales30: Number(lines30.reduce((sum, line) => sum + line.totalMinor, 0n)), items30: lines30.reduce((sum, line) => sum + line.quantity, 0), orders30: lines30.length,
    chart: days.map((day) => ({ day, total: Number(byDay.get(day) || 0n) })),
    openLines, products, pendingProducts, lowStock, rating, performance: performanceLabel(rating.average, rating.count),
    reviews: reviews.map((row) => ({ id: row.id, rating: row.rating, body: row.body, createdAt: row.createdAt.toISOString() })),
  }
}

// ------------------------------------------------------------------ products

const SELLER_FIELDS = ['name', 'nameEn', 'slug', 'categoryId', 'brandId', 'kind', 'price', 'compareAtPrice', 'stock', 'sku', 'image', 'gallery', 'shortDescription', 'description', 'weightGrams', 'warranty', 'maxPerOrder', 'specifications', 'variants', 'currency'] as const

function sellerBody(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const key of SELLER_FIELDS) if (input[key] !== undefined) out[key] = input[key]
  return out
}

export async function sellerProducts(sellerId: number, input: { q?: string; status?: string; page?: number }) {
  const where: Prisma.ProductWhereInput = { sellerId }
  if (input.status === 'active') Object.assign(where, { active: true })
  if (input.status === 'inactive') Object.assign(where, { active: false, approval: 'APPROVED' })
  if (input.status === 'pending') Object.assign(where, { approval: 'PENDING' })
  if (input.status === 'rejected') Object.assign(where, { approval: 'REJECTED' })
  if (input.status === 'out') Object.assign(where, { stock: 0 })
  const q = String(input.q || '').trim().slice(0, 80)
  if (q) where.OR = [{ name: { contains: q } }, { sku: { contains: q } }]
  const page = Math.max(1, Number(input.page) || 1)
  const [rows, total, counts] = await Promise.all([
    db.product.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * 30, take: 30, include: { category: { select: { name: true } }, variants: { where: { active: true }, select: { id: true } } } }),
    db.product.count({ where }),
    db.product.groupBy({ by: ['approval'], where: { sellerId }, _count: { _all: true } }),
  ])
  return {
    rows: rows.map((row) => ({
      id: row.id, slug: row.slug, name: row.name, image: row.image, category: row.category?.name || '', price: minorToNumber(row.priceMinor, row.currency), currency: row.currency,
      stock: row.stock, active: row.active, approval: row.approval, approvalNote: row.approvalNote, soldCount: row.soldCount, views: row.views, variants: row.variants.length, updatedAt: row.updatedAt.toISOString(),
    })),
    total, page, pages: Math.max(1, Math.ceil(total / 30)),
    counts: Object.fromEntries(counts.map((row) => [row.approval, row._count._all])),
  }
}

export async function sellerProduct(sellerId: number, id: number) {
  const row = await db.product.findFirst({ where: { id, sellerId }, include: { variants: { where: { active: true }, orderBy: { id: 'asc' } } } })
  if (!row) throw new MarketplaceError('محصول پیدا نشد', 404)
  const price = (minor: bigint) => (minor ? minorToNumber(minor, row.currency) : '')
  return {
    id: row.id, name: row.name, nameEn: row.nameEn, slug: row.slug, categoryId: row.categoryId, brandId: row.brandId, kind: row.kind,
    price: minorToNumber(row.priceMinor, row.currency), compareAtPrice: price(row.compareAtMinor), currency: row.currency, stock: row.stock, sku: row.sku,
    image: row.image, gallery: JSON.parse(row.gallery || '[]'), shortDescription: row.shortDescription, description: row.description, weightGrams: row.weightGrams,
    warranty: row.warranty, maxPerOrder: row.maxPerOrder, specifications: JSON.parse(row.specifications || '{}'), active: row.active, approval: row.approval, approvalNote: row.approvalNote,
    variants: row.variants.map((v) => ({ id: v.id, sku: v.sku, name: v.name, attributes: JSON.parse(v.attributes || '{}'), price: minorToNumber(v.priceMinor, row.currency), compareAt: v.compareAtMinor ? minorToNumber(v.compareAtMinor, row.currency) : '', stock: v.stock, active: v.active })),
  }
}

/** Category fields (specifications and variant attributes) for the seller's product form. */
export async function categoryForm(categoryId: number) {
  const { fields, appliesTo } = await attributeGroupForCategory(categoryId)
  return { fields, appliesTo }
}

export async function saveSellerProduct(seller: SellerRow, input: Record<string, unknown>, id?: number) {
  const settings = await getMarketplaceSettings()
  const body: Record<string, unknown> = { ...sellerBody(input), currency: input.currency || 'IRT' }
  // Seller slugs are namespaced so they never collide with the shop's own products.
  if (!id && !String(body.slug || '').trim()) body.slug = `s${seller.id}-${Date.now().toString(36)}`
  if (body.slug !== undefined && !/^[a-z0-9-]{3,80}$/.test(String(body.slug))) throw new MarketplaceError('نامک محصول فقط حروف انگلیسی کوچک، عدد و خط تیره')
  // Sellers rarely keep SKUs; a variant without one gets a unique shop-scoped code.
  if (Array.isArray(body.variants)) {
    const stamp = Date.now().toString(36)
    body.variants = body.variants.slice(0, 100).map((variant: Record<string, unknown>, index: number) => ({ ...variant, sku: String(variant?.sku || '').trim() || `S${seller.id}-${stamp}-${index + 1}` }))
  }
  if (id) {
    const current = await db.product.findFirst({ where: { id, sellerId: seller.id }, select: { price: true, currency: true, categoryId: true, specifications: true, faqs: true, gallery: true, kind: true, stock: true, active: true, approval: true, name: true, priceMinor: true } })
    if (!current) throw new MarketplaceError('محصول پیدا نشد', 404)
    const parsed = await productInput(body, current).catch((error: Error) => { throw new MarketplaceError(error.message) })
    // A rejected product goes back to review when edited.
    const approval = current.approval === 'REJECTED' ? (settings.autoApproveProducts ? 'APPROVED' : 'PENDING') : current.approval
    const saved = await db.$transaction(async (tx) => {
      const row = await tx.product.update({ where: { id }, data: { ...(parsed.data as Prisma.ProductUpdateInput), approval, ...(approval !== 'APPROVED' ? { active: false } : {}) } })
      if (parsed.variants) await saveVariants(tx, id, parsed.variants)
      return row
    }).catch((error: { code?: string }) => { throw error?.code === 'P2002' ? new MarketplaceError('این نامک یا کد تنوع (SKU) تکراری است', 409) : error })
    contentChanged({ type: 'product', id }, current, saved)
    if (approval === 'PENDING' && current.approval === 'REJECTED') await notifyAdmins('محصول ویرایش‌شده منتظر بررسی', `«${saved.name}» از ${seller.shopName}`, '/admin/marketplace?tab=products', `product-review:${id}:${Date.now()}`)
    return saved
  }
  const parsed = await productInput(body).catch((error: Error) => { throw new MarketplaceError(error.message) })
  const approval = settings.autoApproveProducts ? 'APPROVED' : 'PENDING'
  const created = await db.$transaction(async (tx) => {
    const row = await tx.product.create({ data: { ...(parsed.data as Prisma.ProductUncheckedCreateInput), sellerId: seller.id, approval, active: approval === 'APPROVED', featured: false } })
    if (parsed.variants) await saveVariants(tx, row.id, parsed.variants)
    return row
  }).catch((error: { code?: string }) => { throw error?.code === 'P2002' ? new MarketplaceError('این نامک یا SKU تکراری است', 409) : error })
  contentChanged({ type: 'product', id: created.id }, null, created)
  if (approval === 'PENDING') await notifyAdmins('محصول تازهٔ فروشنده', `«${created.name}» از ${seller.shopName} منتظر بررسی است.`, '/admin/marketplace?tab=products', `product-review:${created.id}`)
  return created
}

/** Seller switches a product on/off (only approved products can go live) or updates stock. */
export async function quickUpdate(seller: SellerRow, id: number, input: { active?: unknown; stock?: unknown; price?: unknown }) {
  const product = await db.product.findFirst({ where: { id, sellerId: seller.id } })
  if (!product) throw new MarketplaceError('محصول پیدا نشد', 404)
  const data: Prisma.ProductUpdateInput = {}
  if (input.active !== undefined) {
    if (input.active === true && product.approval !== 'APPROVED') throw new MarketplaceError('محصول پس از تأیید مدیر قابل انتشار است', 409)
    data.active = input.active === true
  }
  if (input.stock !== undefined) {
    const stock = input.stock === '' ? -1 : Number(input.stock)
    if (!Number.isSafeInteger(stock) || stock < -1 || stock > 1_000_000) throw new MarketplaceError('موجودی معتبر نیست')
    data.stock = stock
  }
  if (input.price !== undefined) {
    const priceMinor = toMinor(String(input.price), normalizeCurrency(product.currency, 'IRT'))
    if (priceMinor <= 0n) throw new MarketplaceError('قیمت معتبر نیست')
    if (product.compareAtMinor && product.compareAtMinor <= priceMinor) data.compareAtMinor = 0n
    data.priceMinor = priceMinor
    data.price = minorToNumber(priceMinor, product.currency)
  }
  return db.product.update({ where: { id }, data })
}

// ------------------------------------------------------------------ orders

export async function sellerOrders(seller: SellerRow, input: { tab?: string; page?: number }) {
  const settings = await getMarketplaceSettings()
  const tab = input.tab || 'open'
  const where: Prisma.OrderLineWhereInput = { sellerId: seller.id, order: { status: tab === 'refunded' ? 'REFUNDED' : 'PAID' } }
  if (tab === 'open') where.sellerStatus = { in: ['', 'ACCEPTED', 'READY'] }
  if (tab === 'shipped') where.sellerStatus = 'SHIPPED'
  const page = Math.max(1, Number(input.page) || 1)
  const [lines, total, open] = await Promise.all([
    db.orderLine.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 40, take: 40, include: { order: { select: { id: true, createdAt: true, meta: true, productDelivery: { select: { status: true } }, shipment: { select: { trackingCode: true, carrierName: true } } } } } }),
    db.orderLine.count({ where }),
    db.orderLine.count({ where: { sellerId: seller.id, order: { status: 'PAID' }, sellerStatus: { in: ['', 'ACCEPTED', 'READY'] } } }),
  ])
  return {
    open, total, page, pages: Math.max(1, Math.ceil(total / 40)), shipsDirectly: settings.sellerShipsDirectly,
    lines: lines.map((line) => {
      let meta: Record<string, any> = {}
      try { meta = JSON.parse(line.order.meta || '{}') } catch { /* ignore */ }
      const address = meta.shippingAddress || {}
      return {
        id: line.id, orderId: line.orderId, createdAt: line.order.createdAt.toISOString(), name: line.name, variantName: line.variantName, sku: line.sku, image: line.image,
        quantity: line.quantity, total: minorToNumber(line.totalMinor, line.currency), commission: minorToNumber(line.commissionMinor, line.currency), currency: line.currency,
        status: line.sellerStatus, statusLabel: LINE_STATUS[line.sellerStatus] || line.sellerStatus, tracking: line.sellerTracking, delivery: line.order.productDelivery?.status || '',
        city: String(address.city || ''), deliveryDate: meta.delivery?.date || '',
        // Recipient details only when sellers ship to customers themselves.
        recipient: settings.sellerShipsDirectly ? { name: String(address.recipient || ''), phone: String(address.phone || ''), address: [address.province, address.city, address.address, address.postalCode && `کد پستی ${address.postalCode}`].filter(Boolean).join('، ') } : null,
      }
    }),
  }
}

export async function moveLine(seller: SellerRow, lineId: number, to: string, tracking?: unknown) {
  const line = await db.orderLine.findFirst({ where: { id: lineId, sellerId: seller.id }, include: { order: { select: { status: true, userId: true } } } })
  if (!line || line.order.status !== 'PAID') throw new MarketplaceError('سفارش پیدا نشد', 404)
  if (!canMoveLine(line.sellerStatus, to)) throw new MarketplaceError('این تغییر وضعیت مجاز نیست', 409)
  const code = String(tracking ?? '').replace(/[^\w-]/g, '').slice(0, 60)
  const claimed = await db.orderLine.updateMany({ where: { id: line.id, sellerStatus: line.sellerStatus }, data: { sellerStatus: to, ...(code ? { sellerTracking: code } : {}) } })
  if (claimed.count !== 1) throw new MarketplaceError('وضعیت تغییر کرده است؛ صفحه را تازه کنید', 409)
  await db.orderEvent.create({ data: { orderId: line.orderId, status: `SELLER_${to}`, note: `${seller.shopName}: «${line.name}» — ${LINE_STATUS[to]}${code ? ` (کد رهگیری ${code})` : ''}`, visible: false, actorId: seller.userId } })
  return { status: to }
}

// ------------------------------------------------------------------ ledger

async function categoryChain(categoryId: number | null) {
  const chain: number[] = []
  let id = categoryId
  while (id && !chain.includes(id) && chain.length < 10) {
    chain.push(id)
    id = (await db.productCategory.findUnique({ where: { id }, select: { parentId: true } }))?.parentId ?? null
  }
  return chain
}

/**
 * Paid store order → each seller line credits the seller (sale) and debits
 * the commission, withdrawable after the hold. Idempotent per line.
 */
export async function recordMarketplaceSale(orderId: number) {
  if (!await marketplaceEnabled()) return
  const lines = await db.orderLine.findMany({ where: { orderId, sellerId: { not: null } }, include: { product: { select: { categoryId: true } } } })
  if (!lines.length) return
  const settings = await getMarketplaceSettings()
  const availableAt = new Date(Date.now() + settings.holdDays * DAY)
  const touched = new Set<number>()
  for (const line of lines) {
    const seller = await db.seller.findUnique({ where: { id: line.sellerId! } })
    if (!seller) continue
    const rate = commissionPercent(settings, seller.commissionPercent, await categoryChain(line.product?.categoryId ?? null))
    const commission = commissionOf(line.totalMinor, rate)
    try {
      await db.$transaction([
        db.sellerLedger.create({ data: { sellerId: seller.id, kind: 'SALE', amountMinor: line.totalMinor, currency: line.currency, orderId, orderLineId: line.id, availableAt, dedupeKey: `sale:line:${line.id}`, note: `${line.name} × ${line.quantity}` } }),
        db.sellerLedger.create({ data: { sellerId: seller.id, kind: 'COMMISSION', amountMinor: -commission, currency: line.currency, orderId, orderLineId: line.id, availableAt, dedupeKey: `commission:line:${line.id}`, note: `کارمزد ${rate.toLocaleString('fa-IR')}٪` } }),
        db.orderLine.update({ where: { id: line.id }, data: { commissionMinor: commission } }),
        db.seller.update({ where: { id: seller.id }, data: { salesCount: { increment: line.quantity } } }),
      ])
      touched.add(seller.id)
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error // already recorded
    }
  }
  for (const sellerId of touched) {
    const seller = await db.seller.findUnique({ where: { id: sellerId }, select: { id: true, userId: true } })
    if (seller) await notifySeller(seller, 'سفارش تازه در فروشگاه شما', `سفارش #${orderId.toLocaleString('fa-IR')} پرداخت شد؛ آن را تأیید و آمادهٔ ارسال کنید.`, '/seller/orders', `seller-order:${orderId}:${sellerId}`)
  }
}

/**
 * A refund (cancel or return) takes the refunded part back from the seller
 * and returns the matching commission. `lines` narrows it to returned lines.
 */
export async function reverseSellerShare(orderId: number, refundedMinor: bigint, key: string, lines?: number[]) {
  if (refundedMinor <= 0n) return
  const all = await db.orderLine.findMany({ where: { orderId }, select: { id: true, line: true, sellerId: true, totalMinor: true, commissionMinor: true, currency: true, name: true } })
  const scope = lines?.length ? all.filter((row) => lines.includes(row.line)) : all
  const base = scope.reduce((sum, row) => sum + row.totalMinor, 0n)
  for (const row of scope) {
    if (!row.sellerId) continue
    const share = refundShare(row.totalMinor, base, refundedMinor)
    if (share <= 0n) continue
    const commissionBack = row.totalMinor ? (row.commissionMinor * share) / row.totalMinor : 0n
    await db.$transaction([
      db.sellerLedger.create({ data: { sellerId: row.sellerId, kind: 'REFUND', amountMinor: -share, currency: row.currency, orderId, orderLineId: row.id, dedupeKey: `refund:${key}:line:${row.id}`, note: `برگشت وجه «${row.name}»` } }),
      ...(commissionBack > 0n ? [db.sellerLedger.create({ data: { sellerId: row.sellerId, kind: 'ADJUST', amountMinor: commissionBack, currency: row.currency, orderId, orderLineId: row.id, dedupeKey: `refund-commission:${key}:line:${row.id}`, note: 'برگشت کارمزد' } })] : []),
    ]).catch((error: { code?: string }) => { if (error?.code !== 'P2002') throw error })
  }
}

export async function sellerFinance(seller: SellerRow, page = 1) {
  const settings = await getMarketplaceSettings()
  const [all, rows, total, payouts] = await Promise.all([
    db.sellerLedger.findMany({ where: { sellerId: seller.id }, select: { kind: true, amountMinor: true, availableAt: true } }),
    db.sellerLedger.findMany({ where: { sellerId: seller.id }, orderBy: { id: 'desc' }, skip: (page - 1) * 50, take: 50 }),
    db.sellerLedger.count({ where: { sellerId: seller.id } }),
    db.sellerPayout.findMany({ where: { sellerId: seller.id }, orderBy: { id: 'desc' }, take: 30 }),
  ])
  const money = balanceOf(all)
  return {
    balance: Number(money.balance), available: Number(money.available), pending: Number(money.pending), minPayout: settings.minPayoutToman, holdDays: settings.holdDays,
    iban: seller.iban, ibanOwner: seller.ibanOwner, page, pages: Math.max(1, Math.ceil(total / 50)),
    rows: rows.map((row) => ({ id: row.id, kind: row.kind, amount: Number(row.amountMinor), orderId: row.orderId, note: row.note, availableAt: row.availableAt.toISOString(), createdAt: row.createdAt.toISOString() })),
    payouts: payouts.map((row) => ({ id: row.id, amount: Number(row.amountMinor), status: row.status, iban: row.iban, reference: row.reference, note: row.note, createdAt: row.createdAt.toISOString(), processedAt: row.processedAt?.toISOString() || null })),
  }
}

/** Withdrawal request: reserved from the balance at once, paid by the admin. */
export async function requestPayout(seller: SellerRow, amountInput: unknown) {
  const settings = await getMarketplaceSettings()
  const amount = BigInt(Math.floor(Number(String(amountInput ?? '').replace(/[,،٬\s]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) || 0))
  if (await db.sellerPayout.count({ where: { sellerId: seller.id, status: 'REQUESTED' } })) throw new MarketplaceError('یک درخواست برداشت در حال بررسی دارید', 409)
  const money = balanceOf(await db.sellerLedger.findMany({ where: { sellerId: seller.id }, select: { kind: true, amountMinor: true, availableAt: true } }))
  checkPayout(amount, money.available, BigInt(settings.minPayoutToman), seller.iban)
  const payout = await db.$transaction(async (tx) => {
    const row = await tx.sellerPayout.create({ data: { sellerId: seller.id, amountMinor: amount, currency: 'IRT', iban: seller.iban, ibanOwner: seller.ibanOwner } })
    await tx.sellerLedger.create({ data: { sellerId: seller.id, kind: 'PAYOUT', amountMinor: -amount, currency: 'IRT', payoutId: row.id, dedupeKey: `payout:${row.id}`, note: 'درخواست برداشت' } })
    return row
  })
  await notifyAdmins('درخواست تسویهٔ فروشنده', `${seller.shopName}: ${Number(amount).toLocaleString('fa-IR')} تومان`, '/admin/marketplace?tab=payouts', `payout:${payout.id}`)
  return payout
}

// ------------------------------------------------------------------ reviews

/** Sellers the customer can still rate on a delivered order. */
export async function reviewableSellers(userId: number, orderId: number) {
  const order = await db.order.findFirst({ where: { id: orderId, userId, status: 'PAID' }, select: { productDelivery: { select: { status: true } }, lines: { where: { sellerId: { not: null } }, select: { sellerId: true } } } })
  if (!order || order.productDelivery?.status !== 'DELIVERED') return []
  const ids = [...new Set(order.lines.map((line) => line.sellerId!))]
  const [sellers, done] = await Promise.all([
    db.seller.findMany({ where: { id: { in: ids } }, select: { id: true, shopName: true, slug: true, logo: true } }),
    db.sellerReview.findMany({ where: { orderId, sellerId: { in: ids } }, select: { sellerId: true, rating: true } }),
  ])
  return sellers.map((seller) => ({ ...seller, reviewed: done.find((row) => row.sellerId === seller.id)?.rating ?? null }))
}

export async function reviewSeller(userId: number, input: Record<string, unknown>) {
  const orderId = Number(input.orderId), sellerId = Number(input.sellerId)
  const allowed = (await reviewableSellers(userId, orderId)).find((row) => row.id === sellerId)
  if (!allowed) throw new MarketplaceError('امکان ثبت امتیاز برای این سفارش نیست', 403)
  if (allowed.reviewed) throw new MarketplaceError('برای این فروشنده قبلاً امتیاز داده‌اید', 409)
  const review = validateSellerReview(input)
  await db.$transaction([
    db.sellerReview.create({ data: { sellerId, userId, orderId, rating: review.rating, criteria: JSON.stringify(review.criteria), body: review.body } }),
    db.seller.update({ where: { id: sellerId }, data: { ratingSum: { increment: review.rating }, ratingCount: { increment: 1 } } }),
  ])
  return { ok: true }
}

export async function sellerReviews(sellerId: number, take = 30) {
  const rows = await db.sellerReview.findMany({ where: { sellerId, status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take })
  const users = await db.user.findMany({ where: { id: { in: rows.map((row) => row.userId) } }, select: { id: true, name: true } })
  const names = new Map(users.map((user) => [user.id, user.name]))
  return rows.map((row) => ({ id: row.id, rating: row.rating, criteria: JSON.parse(row.criteria || '{}'), body: row.body, reply: row.reply, name: (names.get(row.userId) || 'خریدار').split(' ')[0], createdAt: row.createdAt.toISOString() }))
}

export async function replyReview(seller: SellerRow, id: number, reply: unknown) {
  const text = String(reply ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 600)
  const updated = await db.sellerReview.updateMany({ where: { id, sellerId: seller.id }, data: { reply: text } })
  if (!updated.count) throw new MarketplaceError('نظر پیدا نشد', 404)
}

// ------------------------------------------------------------------ public

export function publicSeller(seller: { id: number; slug: string; shopName: string; logo: string; banner: string; about: string; city: string; ratingSum: number; ratingCount: number; salesCount: number; createdAt: Date; status: string }) {
  const rating = ratingSummary(seller.ratingSum, seller.ratingCount)
  return {
    id: seller.id, slug: seller.slug, shopName: seller.shopName, logo: seller.logo, banner: seller.banner, about: seller.about, city: seller.city,
    rating, performance: performanceLabel(rating.average, rating.count), salesCount: seller.salesCount, since: seller.createdAt.toISOString(), active: seller.status === 'ACTIVE',
  }
}

/** Seller shown on a product page ("sold by"). Null for the site's own products. */
export async function productSeller(productId: number) {
  if (!await marketplaceEnabled()) return null
  const product = await db.product.findUnique({ where: { id: productId }, select: { seller: true } })
  return product?.seller && product.seller.status === 'ACTIVE' ? publicSeller(product.seller) : null
}

export async function sellerBySlug(slug: string) {
  if (!await marketplaceEnabled()) return null
  const seller = await db.seller.findUnique({ where: { slug } })
  return seller && seller.status === 'ACTIVE' ? seller : null
}

// ------------------------------------------------------------------ admin

export async function adminSellers(input: { status?: string; q?: string }) {
  const where: Prisma.SellerWhereInput = {}
  if (input.status && ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'].includes(input.status)) where.status = input.status
  const q = String(input.q || '').trim()
  if (q) where.OR = [{ shopName: { contains: q } }, { slug: { contains: q } }, { phone: { contains: q } }, { legalName: { contains: q } }]
  const [rows, counts, ledger, products] = await Promise.all([
    db.seller.findMany({ where, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 300 }),
    db.seller.groupBy({ by: ['status'], _count: { _all: true } }),
    db.sellerLedger.groupBy({ by: ['sellerId'], _sum: { amountMinor: true } }),
    db.product.groupBy({ by: ['sellerId'], where: { sellerId: { not: null }, active: true }, _count: { _all: true } }),
  ])
  const balances = new Map(ledger.map((row) => [row.sellerId, Number(row._sum.amountMinor || 0n)]))
  const productCount = new Map(products.map((row) => [row.sellerId, row._count._all]))
  return {
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
    rows: rows.map((row) => ({ ...publicSeller(row), status: row.status, statusNote: row.statusNote, legalName: row.legalName, kind: row.kind, nationalId: row.nationalId, phone: row.phone, email: row.email, iban: row.iban, ibanOwner: row.ibanOwner, address: row.address, commissionPercent: row.commissionPercent, balance: balances.get(row.id) || 0, products: productCount.get(row.id) || 0, createdAt: row.createdAt.toISOString() })),
  }
}

export async function decideSeller(input: { id: number; action: string; note?: unknown; commissionPercent?: unknown }) {
  const seller = await db.seller.findUnique({ where: { id: input.id } })
  if (!seller) throw new MarketplaceError('فروشنده پیدا نشد', 404)
  const note = String(input.note ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 500)
  const data: Prisma.SellerUpdateInput = {}
  if (input.action === 'approve' || input.action === 'reactivate') Object.assign(data, { status: 'ACTIVE', statusNote: '', approvedAt: seller.approvedAt || new Date() })
  else if (input.action === 'reject') Object.assign(data, { status: 'REJECTED', statusNote: note })
  else if (input.action === 'suspend') Object.assign(data, { status: 'SUSPENDED', statusNote: note })
  else if (input.action === 'commission') {
    const raw = input.commissionPercent
    const rate = raw === '' || raw == null ? null : Number(raw)
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 90)) throw new MarketplaceError('کارمزد باید بین ۰ تا ۹۰ درصد باشد')
    data.commissionPercent = rate === null ? null : Math.round(rate)
  } else throw new MarketplaceError('عملیات نامعتبر است')
  const saved = await db.seller.update({ where: { id: seller.id }, data })
  // A suspended shop stops selling.
  if (input.action === 'suspend') await db.product.updateMany({ where: { sellerId: seller.id, active: true }, data: { active: false } })
  if (input.action !== 'commission') {
    const text = input.action === 'reject' ? `درخواست فروشندگی «${seller.shopName}» رد شد${note ? `: ${note}` : ''}.` : input.action === 'suspend' ? `فروشگاه «${seller.shopName}» تعلیق شد${note ? `: ${note}` : ''}.` : `فروشگاه «${seller.shopName}» فعال شد؛ اکنون می‌توانید محصول اضافه کنید.`
    await notifySeller(seller, input.action === 'reject' ? 'نتیجهٔ درخواست فروشندگی' : input.action === 'suspend' ? 'تعلیق فروشگاه' : 'فروشگاه شما فعال شد', text, '/seller', `seller-status:${seller.id}:${input.action}:${Date.now()}`)
  }
  return saved
}

export async function pendingProducts() {
  const rows = await db.product.findMany({ where: { sellerId: { not: null }, approval: 'PENDING' }, orderBy: { updatedAt: 'asc' }, take: 200, include: { seller: { select: { shopName: true, slug: true } }, category: { select: { name: true } } } })
  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug, image: row.image, price: minorToNumber(row.priceMinor, row.currency), currency: row.currency, stock: row.stock, category: row.category?.name || '', seller: row.seller?.shopName || '', sellerSlug: row.seller?.slug || '', updatedAt: row.updatedAt.toISOString() }))
}

export async function decideProduct(input: { id: number; action: string; note?: unknown }) {
  const product = await db.product.findFirst({ where: { id: input.id, sellerId: { not: null } }, include: { seller: true } })
  if (!product || !product.seller) throw new MarketplaceError('محصول پیدا نشد', 404)
  const note = String(input.note ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 500)
  if (input.action !== 'approve' && input.action !== 'reject') throw new MarketplaceError('عملیات نامعتبر است')
  const saved = await db.product.update({ where: { id: product.id }, data: input.action === 'approve' ? { approval: 'APPROVED', approvalNote: '', active: true } : { approval: 'REJECTED', approvalNote: note, active: false } })
  contentChanged({ type: 'product', id: product.id }, product, saved)
  await notifySeller(product.seller, input.action === 'approve' ? 'محصول شما تأیید شد' : 'محصول شما رد شد', input.action === 'approve' ? `«${product.name}» منتشر شد.` : `«${product.name}»${note ? `: ${note}` : ''} — پس از اصلاح دوباره بررسی می‌شود.`, `/seller/products/${product.id}`, `product-decision:${product.id}:${Date.now()}`)
}

export async function adminPayouts(status = 'REQUESTED') {
  const rows = await db.sellerPayout.findMany({ where: status === 'all' ? {} : { status }, orderBy: { id: 'desc' }, take: 200 })
  const sellers = await db.seller.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.sellerId))] } }, select: { id: true, shopName: true, slug: true } })
  const byId = new Map(sellers.map((seller) => [seller.id, seller]))
  return rows.map((row) => ({ id: row.id, sellerId: row.sellerId, seller: byId.get(row.sellerId)?.shopName || `#${row.sellerId}`, amount: Number(row.amountMinor), status: row.status, iban: row.iban, ibanOwner: row.ibanOwner, reference: row.reference, note: row.note, createdAt: row.createdAt.toISOString(), processedAt: row.processedAt?.toISOString() || null }))
}

export async function processPayout(input: { id: number; action: string; reference?: unknown; note?: unknown; actorId: number }) {
  const payout = await db.sellerPayout.findUnique({ where: { id: input.id } })
  if (!payout || payout.status !== 'REQUESTED') throw new MarketplaceError('این درخواست قابل پردازش نیست', 409)
  const note = String(input.note ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 500)
  if (input.action === 'paid') {
    const reference = String(input.reference ?? '').trim().slice(0, 80)
    if (!reference) throw new MarketplaceError('شمارهٔ پیگیری واریز را وارد کنید')
    const claimed = await db.sellerPayout.updateMany({ where: { id: payout.id, status: 'REQUESTED' }, data: { status: 'PAID', reference, note, processedBy: input.actorId, processedAt: new Date() } })
    if (!claimed.count) throw new MarketplaceError('وضعیت تغییر کرده است', 409)
  } else if (input.action === 'reject') {
    await db.$transaction(async (tx) => {
      const claimed = await tx.sellerPayout.updateMany({ where: { id: payout.id, status: 'REQUESTED' }, data: { status: 'REJECTED', note, processedBy: input.actorId, processedAt: new Date() } })
      if (!claimed.count) throw new MarketplaceError('وضعیت تغییر کرده است', 409)
      await tx.sellerLedger.create({ data: { sellerId: payout.sellerId, kind: 'ADJUST', amountMinor: payout.amountMinor, currency: payout.currency, payoutId: payout.id, dedupeKey: `payout-reject:${payout.id}`, note: 'برگشت درخواست برداشت ردشده' } })
    })
  } else throw new MarketplaceError('عملیات نامعتبر است')
  const seller = await db.seller.findUnique({ where: { id: payout.sellerId }, select: { id: true, userId: true } })
  if (seller) await notifySeller(seller, input.action === 'paid' ? 'تسویه واریز شد' : 'درخواست برداشت رد شد', input.action === 'paid' ? `${Number(payout.amountMinor).toLocaleString('fa-IR')} تومان به حساب شما واریز شد.` : `درخواست برداشت ${Number(payout.amountMinor).toLocaleString('fa-IR')} تومان رد شد و مبلغ به موجودی برگشت${note ? `: ${note}` : ''}.`, '/seller/finance', `payout-done:${payout.id}`)
}

export async function marketplaceOverview() {
  const since = new Date(Date.now() - 30 * DAY)
  const [sellers, pendingSellers, pendingProducts, payouts, gmv, commission] = await Promise.all([
    db.seller.count({ where: { status: 'ACTIVE' } }),
    db.seller.count({ where: { status: 'PENDING' } }),
    db.product.count({ where: { sellerId: { not: null }, approval: 'PENDING' } }),
    db.sellerPayout.aggregate({ where: { status: 'REQUESTED' }, _sum: { amountMinor: true }, _count: { _all: true } }),
    db.sellerLedger.aggregate({ where: { kind: 'SALE', createdAt: { gte: since } }, _sum: { amountMinor: true } }),
    db.sellerLedger.aggregate({ where: { kind: 'COMMISSION', createdAt: { gte: since } }, _sum: { amountMinor: true } }),
  ])
  return {
    sellers, pendingSellers, pendingProducts, payoutsCount: payouts._count._all, payoutsTotal: Number(payouts._sum.amountMinor || 0n),
    gmv30: Number(gmv._sum.amountMinor || 0n), commission30: -Number(commission._sum.amountMinor || 0n),
  }
}

export async function sellerLedgerForAdmin(sellerId: number) {
  const seller = await db.seller.findUnique({ where: { id: sellerId } })
  if (!seller) throw new MarketplaceError('فروشنده پیدا نشد', 404)
  return sellerFinance(seller)
}

/** Admin manual ledger correction (e.g. a penalty or a bonus). */
export async function adjustSeller(input: { sellerId: number; amount: unknown; note: unknown; actorId: number }) {
  const amount = BigInt(Math.trunc(Number(String(input.amount ?? '').replace(/[,،٬\s]/g, '')) || 0))
  const note = String(input.note ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 300)
  if (!amount) throw new MarketplaceError('مبلغ را وارد کنید (منفی برای کسر)')
  if (!note) throw new MarketplaceError('علت اصلاح را بنویسید')
  await db.sellerLedger.create({ data: { sellerId: input.sellerId, kind: 'ADJUST', amountMinor: amount, currency: 'IRT', note, dedupeKey: `adjust:${input.sellerId}:${Date.now()}:${input.actorId}` } })
}
