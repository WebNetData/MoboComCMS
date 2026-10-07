import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { capturePublicProductPrices, prepareProductPriceCapture } from '@/modules/catalog/server/price-history'
import { contentChanged } from '@/modules/content/server/events'
import { minorToNumber } from '@/shared/money'
import { MarketplaceError } from '@/modules/marketplace/domain/marketplace'
import { publicSeller } from '@/modules/marketplace/server/marketplace/public'
import { notifySeller } from '@/modules/marketplace/server/marketplace/identity'
import { DAY } from '@/modules/marketplace/server/marketplace/core'
import { sellerFinance } from '@/modules/marketplace/server/marketplace/ledger'

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
  const saved = await db.$transaction(async tx => {
    const pricesBefore = await prepareProductPriceCapture(tx, product.id)
    const row = await tx.product.update({ where: { id: product.id }, data: input.action === 'approve' ? { approval: 'APPROVED', approvalNote: '', active: true } : { approval: 'REJECTED', approvalNote: note, active: false } })
    await capturePublicProductPrices(tx, product.id, pricesBefore)
    return row
  })
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
