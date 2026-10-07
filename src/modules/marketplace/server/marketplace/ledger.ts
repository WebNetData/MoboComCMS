import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { MarketplaceError, balanceOf, checkPayout, commissionOf, commissionPercent, refundShare } from '@/modules/marketplace/domain/marketplace'
import { DAY, getMarketplaceSettings, marketplaceEnabled } from '@/modules/marketplace/server/marketplace/core'
import { type SellerRow, notifyAdmins, notifySeller } from '@/modules/marketplace/server/marketplace/identity'

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
 * Scheduled step: seller lines of paid, delivered orders whose sale never reached the seller's
 * ledger. The sale is recorded once, as a follow-up of the delivery job, and a failure there is
 * only logged; without this the seller was never credited. Looks at lines of the last days that
 * are at least ten minutes old (the delivery job may still be at work) and records the orders
 * that miss an entry. Recording is idempotent per line. One order that fails does not stop the others.
 */
export async function recoverMarketplaceSales(days = 3, now = new Date()) {
  const counters = { checked: 0, recorded: 0, failed: 0 }
  if (!await marketplaceEnabled()) return counters
  const window = { gte: new Date(now.getTime() - (Number(days) > 0 ? Number(days) : 3) * DAY), lte: new Date(now.getTime() - 10 * 60_000) }
  const missing = new Set<number>()
  for (let after = 0, pages = 0; pages < 4; pages++) {
    const lines = await db.orderLine.findMany({ where: { sellerId: { not: null }, createdAt: window, id: { gt: after }, order: { status: 'PAID', productDelivery: { isNot: null } } }, orderBy: { id: 'asc' }, take: 500, select: { id: true, orderId: true } })
    if (!lines.length) break
    after = lines[lines.length - 1].id
    const recorded = new Set((await db.sellerLedger.findMany({ where: { dedupeKey: { in: lines.map((line) => `sale:line:${line.id}`) } }, select: { dedupeKey: true } })).map((row) => row.dedupeKey))
    for (const line of lines) if (!recorded.has(`sale:line:${line.id}`)) missing.add(line.orderId)
    if (lines.length < 500) break
  }
  for (const orderId of missing) {
    counters.checked++
    try {
      const before = await db.sellerLedger.count({ where: { orderId, kind: 'SALE' } })
      await recordMarketplaceSale(orderId)
      if (await db.sellerLedger.count({ where: { orderId, kind: 'SALE' } }) > before) counters.recorded++
    } catch (error) {
      counters.failed++
      logEvent('error', 'marketplace.sale_recovery_failed', { orderId, error: String(error) })
    }
  }
  return counters
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
  const payout = await db.$transaction(async (tx) => {
    // The "one open request" rule and the balance are checked under the seller's lock, so two
    // requests sent together cannot both pass and reserve more than the seller has.
    if (/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL || '')) await tx.$queryRaw`SELECT "id" FROM "Seller" WHERE "id" = ${seller.id} FOR UPDATE`
    if (await tx.sellerPayout.count({ where: { sellerId: seller.id, status: 'REQUESTED' } })) throw new MarketplaceError('یک درخواست برداشت در حال بررسی دارید', 409)
    const money = balanceOf(await tx.sellerLedger.findMany({ where: { sellerId: seller.id }, select: { kind: true, amountMinor: true, availableAt: true } }))
    checkPayout(amount, money.available, BigInt(settings.minPayoutToman), seller.iban)
    const row = await tx.sellerPayout.create({ data: { sellerId: seller.id, amountMinor: amount, currency: 'IRT', iban: seller.iban, ibanOwner: seller.ibanOwner } })
    await tx.sellerLedger.create({ data: { sellerId: seller.id, kind: 'PAYOUT', amountMinor: -amount, currency: 'IRT', payoutId: row.id, dedupeKey: `payout:${row.id}`, note: 'درخواست برداشت' } })
    return row
  })
  await notifyAdmins('درخواست تسویهٔ فروشنده', `${seller.shopName}: ${Number(amount).toLocaleString('fa-IR')} تومان`, '/admin/marketplace?tab=payouts', `payout:${payout.id}`)
  return payout
}
