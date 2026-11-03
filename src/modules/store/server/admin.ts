import type { Prisma } from '@prisma/client'
import { plainText } from '@/shared/text/plain'
import { db } from '@/platform/database/prisma'
import { contentChanged } from '@/modules/content/server/events'
import { legacyNumber, minorToNumber, normalizeCurrency } from '@/shared/money'
import { StoreError, validateBrand } from '@/modules/store/domain/store'
import { getStoreSettings } from '@/modules/store/server/catalog'
import { capturePublicProductPrices, prepareProductPriceCapture } from '@/modules/catalog/server/price-history'
import { ADMIN_TABS, adminOrders } from '@/modules/store/server/orders'

const STORE_ORDER: Prisma.OrderWhereInput = { productId: { not: null } }
const DAY = 86_400_000

/** YYYY-MM-DD in Tehran time (for daily buckets). */
const tehranDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

// ------------------------------------------------------------------ dashboard

export async function storeDashboard(now = new Date()) {
  const since = new Date(now.getTime() - 60 * DAY)
  const [paid, queue, settings, carts, feedback] = await Promise.all([
    db.invoice.findMany({
      where: { status: 'PAID', paidAt: { gte: since }, order: { is: STORE_ORDER } },
      select: { totalMinor: true, currency: true, paidAt: true, orderId: true },
    }),
    adminOrders({ tab: 'all', page: 1 }),
    getStoreSettings(),
    db.cart.count({ where: { updatedAt: { gte: new Date(now.getTime() - 7 * DAY) }, lines: { some: {} } } }),
    Promise.all([
      db.productReview.count({ where: { status: 'PENDING' } }),
      db.productQuestion.count({ where: { status: 'PENDING' } }),
    ]),
  ])
  // Report in the store's most used currency (mixed-currency stores see the main one).
  const byCurrency = new Map<string, number>()
  for (const row of paid) byCurrency.set(row.currency, (byCurrency.get(row.currency) || 0) + 1)
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'IRT'
  const rows = paid.filter((row) => row.currency === currency && row.paidAt)
  const sum = (from: Date, to = now) => rows.filter((row) => row.paidAt! >= from && row.paidAt! < to).reduce((total, row) => total + row.totalMinor, 0n)
  const count = (from: Date, to = now) => rows.filter((row) => row.paidAt! >= from && row.paidAt! < to).length
  const todayStart = new Date(`${tehranDay(now)}T00:00:00+03:30`)
  const d30 = new Date(now.getTime() - 30 * DAY)
  const d60 = new Date(now.getTime() - 60 * DAY)
  const revenue30 = sum(d30)
  const orders30 = count(d30)
  const series: { day: string; revenue: number; orders: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const day = tehranDay(new Date(now.getTime() - i * DAY))
    const inDay = rows.filter((row) => tehranDay(row.paidAt!) === day)
    series.push({ day, revenue: minorToNumber(inDay.reduce((total, row) => total + row.totalMinor, 0n), currency), orders: inDay.length })
  }
  const orderIds30 = rows.filter((row) => row.paidAt! >= d30).map((row) => row.orderId).filter((id): id is number => !!id)
  const [topLines, lowStock, outOfStock, activeProducts] = await Promise.all([
    orderIds30.length ? db.orderLine.groupBy({ by: ['productId'], where: { orderId: { in: orderIds30 }, productId: { not: null } }, _sum: { quantity: true, totalMinor: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 6 }) : Promise.resolve([]),
    db.product.findMany({ where: { active: true, stock: { gte: 0, lte: Math.max(settings.lowStockDefault, 1) } }, orderBy: { stock: 'asc' }, take: 8, select: { id: true, name: true, image: true, stock: true, sku: true } }),
    db.product.count({ where: { active: true, stock: 0 } }),
    db.product.count({ where: { active: true } }),
  ])
  const topProducts = topLines.length ? await db.product.findMany({ where: { id: { in: topLines.map((line) => line.productId!) } }, select: { id: true, name: true, image: true, slug: true } }) : []
  return {
    currency,
    kpis: {
      revenueToday: minorToNumber(sum(todayStart), currency),
      revenue30: minorToNumber(revenue30, currency),
      revenuePrev30: minorToNumber(sum(d60, d30), currency),
      orders30,
      ordersPrev30: count(d60, d30),
      averageOrder: orders30 ? minorToNumber(revenue30 / BigInt(orders30), currency) : 0,
      activeProducts,
      outOfStock,
      activeCarts: carts,
      pendingReviews: feedback[0],
      pendingQuestions: feedback[1],
    },
    queue: Object.fromEntries(ADMIN_TABS.map((tab) => [tab.key, queue.counts[tab.key]])),
    series,
    recent: queue.orders.slice(0, 8),
    topProducts: topLines.map((line) => {
      const product = topProducts.find((row) => row.id === line.productId)
      return { id: line.productId!, name: product?.name || '—', image: product?.image || '', slug: product?.slug || '', quantity: line._sum.quantity || 0, revenue: minorToNumber(line._sum.totalMinor || 0n, currency) }
    }),
    lowStock,
  }
}

// ------------------------------------------------------------------ products

export type AdminProductFilter = { q?: string; category?: string; brand?: string; status?: string; stock?: string; kind?: string; sort?: string; page?: number }

export async function adminProducts(filter: AdminProductFilter) {
  const settings = await getStoreSettings()
  const page = Math.max(1, Math.min(1000, Math.floor(Number(filter.page) || 1)))
  const size = 30
  const and: Prisma.ProductWhereInput[] = []
  const q = String(filter.q || '').trim().slice(0, 80)
  if (q) {
    const id = Number(q)
    and.push({ OR: [...(Number.isSafeInteger(id) && id > 0 ? [{ id }] : []), { name: { contains: q } }, { nameEn: { contains: q } }, { slug: { contains: q } }, { sku: { contains: q } }, { variants: { some: { sku: { contains: q } } } }] })
  }
  if (Number(filter.category)) and.push({ categoryId: Number(filter.category) })
  if (filter.category === 'none') and.push({ categoryId: null })
  if (Number(filter.brand)) and.push({ brandId: Number(filter.brand) })
  if (filter.status === 'active') and.push({ active: true })
  if (filter.status === 'inactive') and.push({ active: false })
  if (filter.status === 'featured') and.push({ featured: true })
  if (filter.status === 'discounted') and.push({ compareAtMinor: { gt: 0 } })
  if (filter.kind === 'PHYSICAL' || filter.kind === 'VIRTUAL') and.push({ kind: filter.kind })
  if (filter.stock === 'out') and.push({ OR: [{ stock: 0 }, { AND: [{ variants: { some: { active: true } } }, { variants: { none: { active: true, stock: { not: 0 } } } }] }] })
  if (filter.stock === 'low') and.push({ stock: { gt: 0, lte: Math.max(1, settings.lowStockDefault) } })
  if (filter.stock === 'unlimited') and.push({ stock: -1 })
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = {
    newest: [{ id: 'desc' as const }],
    oldest: [{ id: 'asc' as const }],
    name: [{ name: 'asc' as const }],
    sales: [{ soldCount: 'desc' as const }],
    views: [{ views: 'desc' as const }],
    stock: [{ stock: 'asc' as const }],
    price: [{ priceMinor: 'asc' as const }],
    manual: [{ sortOrder: 'asc' as const }, { id: 'desc' as const }],
  }[String(filter.sort)] || [{ id: 'desc' }]
  const where = and.length ? { AND: and } : {}
  const [rows, total, categories, brands, counts] = await Promise.all([
    db.product.findMany({
      where, orderBy, skip: (page - 1) * size, take: size,
      include: { category: { select: { name: true } }, brand: { select: { name: true } }, variants: { where: { active: true }, select: { id: true, sku: true, name: true, stock: true, priceMinor: true } } },
    }),
    db.product.count({ where }),
    db.productCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, parentId: true } }),
    db.productBrand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    Promise.all([db.product.count(), db.product.count({ where: { active: true } }), db.product.count({ where: { active: false } }), db.product.count({ where: { stock: 0 } })]),
  ])
  return {
    page, pages: Math.max(1, Math.ceil(total / size)), total,
    counts: { all: counts[0], active: counts[1], inactive: counts[2], out: counts[3] },
    categories, brands,
    products: rows.map((row) => {
      const variantStock = row.variants.length ? (row.variants.some((variant) => variant.stock < 0) ? -1 : row.variants.reduce((sum, variant) => sum + variant.stock, 0)) : null
      return {
        id: row.id, slug: row.slug, name: row.name, image: row.image, sku: row.sku, kind: row.kind, active: row.active, featured: row.featured,
        category: row.category?.name || '', brand: row.brand?.name || '', currency: row.currency,
        price: minorToNumber(row.priceMinor, row.currency), listPrice: row.compareAtMinor ? minorToNumber(row.compareAtMinor, row.currency) : 0,
        stock: row.stock, variantStock, variants: row.variants.map((variant) => ({ id: variant.id, sku: variant.sku, name: variant.name, stock: variant.stock, price: minorToNumber(variant.priceMinor, row.currency) })),
        soldCount: row.soldCount, views: row.views, access: row.access, updatedAt: row.updatedAt,
      }
    }),
  }
}

const BULK_ACTIONS = ['activate', 'deactivate', 'feature', 'unfeature', 'category', 'brand', 'price', 'discount', 'clear-discount', 'stock', 'delete'] as const
type BulkAction = (typeof BULK_ACTIONS)[number]

/** Rounds a minor amount to a step (e.g. 1,000 toman); never below one step. */
const roundTo = (value: bigint, step: bigint) => (step > 1n ? ((value + step / 2n) / step) * step || step : value)

export async function bulkProducts(input: { ids: unknown; action: unknown; value?: unknown; round?: unknown; endsAt?: unknown }) {
  const ids = Array.isArray(input.ids) ? [...new Set(input.ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 500) : []
  const action = String(input.action) as BulkAction
  if (!ids.length) throw new StoreError('هیچ محصولی انتخاب نشده است')
  if (!BULK_ACTIONS.includes(action)) throw new StoreError('عملیات گروهی نامعتبر است')
  const where = { id: { in: ids } }
  const simple: Partial<Record<BulkAction, Prisma.ProductUpdateManyMutationInput>> = {
    activate: { active: true }, deactivate: { active: false }, feature: { featured: true }, unfeature: { featured: false },
  }
  if (action === 'activate' || action === 'deactivate') {
    let changed = 0
    await db.$transaction(async tx => {
      for (const id of [...ids].sort((a, b) => a - b)) {
        const before = await prepareProductPriceCapture(tx, id)
        const result = await tx.product.updateMany({ where: { id }, data: simple[action]! })
        if (result.count) { await capturePublicProductPrices(tx, id, before); changed++ }
      }
    }, { timeout: 60000 })
    return { changed }
  }
  if (simple[action]) return { changed: (await db.product.updateMany({ where, data: simple[action]! })).count }
  if (action === 'category') {
    const categoryId = input.value === '' || input.value === null ? null : Number(input.value)
    if (categoryId !== null && !await db.productCategory.findUnique({ where: { id: categoryId } })) throw new StoreError('دسته پیدا نشد', 404)
    return { changed: (await db.product.updateMany({ where, data: { categoryId } })).count }
  }
  if (action === 'brand') {
    const brandId = input.value === '' || input.value === null ? null : Number(input.value)
    if (brandId !== null && !await db.productBrand.findUnique({ where: { id: brandId } })) throw new StoreError('برند پیدا نشد', 404)
    return { changed: (await db.product.updateMany({ where, data: { brandId } })).count }
  }
  if (action === 'stock') {
    const stock = Math.floor(Number(input.value))
    if (!Number.isSafeInteger(stock) || stock < -1 || stock > 10_000_000) throw new StoreError('موجودی معتبر نیست')
    return { changed: (await db.product.updateMany({ where, data: { stock } })).count }
  }
  if (action === 'delete') {
    // Products with orders or invoices stay for the books; they are deactivated instead.
    let deleted = 0
    let kept = 0
    for (const id of ids) {
      const used = await db.product.findUnique({ where: { id }, select: { _count: { select: { orders: true, invoices: true, orderLines: true, digitalCodes: true, files: true } } } })
      if (!used) continue
      // A product that was sold, or still holds delivery codes, is kept (switched off) instead of deleted.
      if (used._count.orders || used._count.invoices || used._count.orderLines || used._count.digitalCodes || used._count.files) {
        await db.product.update({ where: { id }, data: { active: false } })
        kept++
      } else {
        await db.product.delete({ where: { id } })
        contentChanged({ type: 'product', id }, null, null)
        deleted++
      }
    }
    return { changed: deleted + kept, deleted, deactivated: kept }
  }
  // Price actions work in minor units per product currency.
  const step = BigInt(Math.max(1, Math.min(1_000_000, Math.floor(Number(input.round) || 1))))
  const percent = Number(input.value)
  if ((action === 'price' && (!Number.isFinite(percent) || percent <= -95 || percent > 1000 || percent === 0)) || (action === 'discount' && (!Number.isFinite(percent) || percent <= 0 || percent >= 95))) throw new StoreError('درصد معتبر نیست')
  const endsAt = action === 'discount' && input.endsAt ? new Date(String(input.endsAt)) : null
  if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= new Date())) throw new StoreError('زمان پایان تخفیف باید در آینده باشد')
  const bps = Number.isFinite(percent) ? BigInt(Math.round(percent * 100)) : 0n
  const all = await db.product.findMany({ where, include: { variants: true } })
  // Foreign-currency products get their prices from the rate; a percentage edit would be undone at the next reprice.
  const products = all.filter((product) => product.pricingMode !== 'FX')
  const skippedFx = all.length - products.length
  let changed = 0
  await db.$transaction(async (tx) => {
    for (const candidate of [...products].sort((a, b) => a.id - b.id)) {
      const pricesBefore = await prepareProductPriceCapture(tx, candidate.id)
      const product = await tx.product.findUnique({ where: { id: candidate.id }, include: { variants: true } })
      if (!product || product.pricingMode === 'FX') continue
      const currency = normalizeCurrency(product.currency)
      const next = (minor: bigint, compareAt: bigint) => {
        if (action === 'price') return { price: roundTo((minor * (10_000n + bps)) / 10_000n, step), compareAt: compareAt ? roundTo((compareAt * (10_000n + bps)) / 10_000n, step) : 0n }
        if (action === 'discount') {
          const base = compareAt > minor ? compareAt : minor
          return { price: roundTo((base * (10_000n - bps)) / 10_000n, step), compareAt: base }
        }
        return { price: compareAt > minor ? compareAt : minor, compareAt: 0n }
      }
      const own = next(product.priceMinor, product.compareAtMinor)
      if (own.price <= 0n) continue
      await tx.product.update({ where: { id: product.id }, data: {
        priceMinor: own.price, price: legacyNumber(own.price, currency), compareAtMinor: own.compareAt,
        ...(action === 'discount' ? { saleEndsAt: endsAt } : action === 'clear-discount' ? { saleEndsAt: null } : {}),
      } })
      for (const variant of product.variants) {
        const priced = next(variant.priceMinor, variant.compareAtMinor)
        if (priced.price <= 0n) continue
        // Keep VIP prices below the new regular price.
        const memberPriceMinor = variant.memberPriceMinor >= priced.price ? 0n : variant.memberPriceMinor
        await tx.productVariant.update({ where: { id: variant.id }, data: { priceMinor: priced.price, price: legacyNumber(priced.price, currency), compareAtMinor: priced.compareAt, memberPriceMinor } })
      }
      if (product.memberPriceMinor >= own.price) await tx.product.update({ where: { id: product.id }, data: { memberPriceMinor: 0n } })
      await capturePublicProductPrices(tx, product.id, pricesBefore)
      changed++
    }
  }, { timeout: 60000 })
  return { changed, skippedFx }
}

// ------------------------------------------------------------------ inventory

export async function inventoryList(input: { q?: string; filter?: string; page?: number }) {
  const settings = await getStoreSettings()
  const page = Math.max(1, Math.floor(Number(input.page) || 1))
  const size = 40
  const and: Prisma.ProductWhereInput[] = [{ kind: { in: ['PHYSICAL', 'VIRTUAL'] } }]
  const q = String(input.q || '').trim().slice(0, 80)
  if (q) and.push({ OR: [{ name: { contains: q } }, { sku: { contains: q } }, { variants: { some: { sku: { contains: q } } } }] })
  if (input.filter === 'low') and.push({ OR: [{ stock: { gt: 0, lte: Math.max(1, settings.lowStockDefault) } }, { variants: { some: { active: true, stock: { gt: 0, lte: Math.max(1, settings.lowStockDefault) } } } }] })
  if (input.filter === 'out') and.push({ OR: [{ stock: 0 }, { variants: { some: { active: true, stock: 0 } } }] })
  if (input.filter === 'tracked') and.push({ OR: [{ stock: { gte: 0 } }, { variants: { some: { stock: { gte: 0 } } } }] })
  const where = { AND: and }
  const [rows, total, held] = await Promise.all([
    db.product.findMany({ where, orderBy: [{ stock: 'asc' }, { name: 'asc' }], skip: (page - 1) * size, take: size, select: { id: true, name: true, image: true, sku: true, stock: true, lowStockAt: true, active: true, variants: { where: { active: true }, select: { id: true, name: true, sku: true, stock: true } } } }),
    db.product.count({ where }),
    db.inventoryReservation.groupBy({ by: ['productId'], where: { status: 'HELD' }, _sum: { quantity: true } }),
  ])
  const heldBy = new Map(held.map((row) => [row.productId, row._sum.quantity || 0]))
  return { page, pages: Math.max(1, Math.ceil(total / size)), total, lowStockDefault: settings.lowStockDefault, items: rows.map((row) => ({ ...row, held: heldBy.get(row.id) || 0 })) }
}

/** Sets stock levels (-1 = unlimited) for products and variants. */
export async function updateStock(items: unknown) {
  if (!Array.isArray(items) || !items.length || items.length > 200) throw new StoreError('فهرست موجودی نامعتبر است')
  const parsed = items.map((raw) => {
    const row = (raw || {}) as Record<string, unknown>
    const stock = Math.floor(Number(row.stock))
    const productId = Number(row.productId)
    const variantId = row.variantId ? Number(row.variantId) : null
    if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(stock) || stock < -1 || stock > 10_000_000 || (variantId !== null && !Number.isSafeInteger(variantId))) throw new StoreError('موجودی معتبر نیست')
    const lowStockAt = row.lowStockAt === undefined ? undefined : Math.floor(Number(row.lowStockAt))
    if (lowStockAt !== undefined && (!Number.isSafeInteger(lowStockAt) || lowStockAt < 0 || lowStockAt > 100_000)) throw new StoreError('حد هشدار موجودی معتبر نیست')
    return { productId, variantId, stock, lowStockAt }
  })
  await db.$transaction(async (tx) => {
    for (const item of parsed) {
      if (item.variantId) {
        const changed = await tx.productVariant.updateMany({ where: { id: item.variantId, productId: item.productId }, data: { stock: item.stock } })
        if (changed.count !== 1) throw new StoreError('نوع کالا پیدا نشد', 404)
      } else {
        const changed = await tx.product.updateMany({ where: { id: item.productId }, data: { stock: item.stock, ...(item.lowStockAt !== undefined ? { lowStockAt: item.lowStockAt } : {}) } })
        if (changed.count !== 1) throw new StoreError('محصول پیدا نشد', 404)
      }
    }
  })
  return { updated: parsed.length }
}

// ------------------------------------------------------------------ brands

export async function listBrands() {
  const rows = await db.productBrand.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { products: true } } } })
  return rows.map(({ _count, ...row }) => ({ ...row, products: _count.products }))
}

export async function saveBrand(input: Record<string, unknown>, id?: number) {
  const data = validateBrand(input)
  try {
    return id ? await db.productBrand.update({ where: { id }, data }) : await db.productBrand.create({ data })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') throw new StoreError('این نامک قبلاً استفاده شده است', 409)
    if ((error as { code?: string })?.code === 'P2025') throw new StoreError('برند پیدا نشد', 404)
    throw error
  }
}

export async function deleteBrand(id: number) {
  await db.product.updateMany({ where: { brandId: id }, data: { brandId: null } })
  await db.productBrand.delete({ where: { id } }).catch(() => { throw new StoreError('برند پیدا نشد', 404) })
  return { deleted: true }
}

// ------------------------------------------------------------------ customers

export async function storeCustomers(input: { q?: string; page?: number; sort?: string }) {
  const page = Math.max(1, Math.floor(Number(input.page) || 1))
  const size = 30
  const q = String(input.q || '').trim().slice(0, 80)
  const userWhere: Prisma.UserWhereInput = q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }, { phone: { contains: q } }] } : {}
  const grouped = await db.order.groupBy({
    by: ['userId'],
    where: { ...STORE_ORDER, status: 'PAID', user: userWhere },
    _count: { _all: true }, _sum: { totalMinor: true }, _max: { createdAt: true },
  })
  const sorted = grouped.sort((a, b) => input.sort === 'recent'
    ? (b._max.createdAt?.getTime() || 0) - (a._max.createdAt?.getTime() || 0)
    : input.sort === 'orders' ? b._count._all - a._count._all : Number((b._sum.totalMinor || 0n) - (a._sum.totalMinor || 0n)))
  const pageRows = sorted.slice((page - 1) * size, page * size)
  const [users, currencies] = await Promise.all([
    db.user.findMany({ where: { id: { in: pageRows.map((row) => row.userId) } }, select: { id: true, name: true, email: true, phone: true, createdAt: true, _count: { select: { addresses: true } } } }),
    db.order.findMany({ where: { ...STORE_ORDER, status: 'PAID', userId: { in: pageRows.map((row) => row.userId) } }, distinct: ['userId'], select: { userId: true, currency: true } }),
  ])
  return {
    page, pages: Math.max(1, Math.ceil(sorted.length / size)), total: sorted.length,
    customers: pageRows.map((row) => {
      const user = users.find((item) => item.id === row.userId)
      const currency = currencies.find((item) => item.userId === row.userId)?.currency || 'IRT'
      return {
        id: row.userId, name: user?.name || '', email: user?.email || '', phone: user?.phone || '', joined: user?.createdAt || null, addresses: user?._count.addresses || 0,
        orders: row._count._all, spent: minorToNumber(row._sum.totalMinor || 0n, currency), currency, lastOrder: row._max.createdAt,
      }
    }),
  }
}

/** For the staff moderation overview: product reviews and questions waiting for approval, oldest first. */
export async function waitingForModeration(take = 5) {
  const [reviewCount, reviews, questionCount, questions] = await Promise.all([
    db.productReview.count({ where: { status: 'PENDING' } }),
    db.productReview.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take, select: { id: true, title: true, body: true, createdAt: true, user: { select: { name: true } }, product: { select: { name: true } } } }),
    db.productQuestion.count({ where: { status: 'PENDING' } }),
    db.productQuestion.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take, select: { id: true, body: true, guestName: true, createdAt: true, user: { select: { name: true } }, product: { select: { name: true } } } }),
  ])
  return {
    reviews: { count: reviewCount, items: reviews.map((row) => ({ id: row.id, text: plainText(row.body || row.title, 160), full: plainText([row.title, row.body].filter(Boolean).join(' — '), 2000), by: row.user.name || '', about: row.product.name, at: row.createdAt })) },
    questions: { count: questionCount, items: questions.map((row) => ({ id: row.id, text: plainText(row.body, 160), full: plainText(row.body, 2000), by: row.user?.name || row.guestName, about: row.product.name, at: row.createdAt })) },
  }
}
