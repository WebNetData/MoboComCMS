// npm run integrity:report — read-only report of records that the money and entitlement fixes of October 2026 could not repair
// by themselves, because what to do with each is a business decision (a double refund, a duplicate gift card, a lost reward…).
// It only reads. It prints a count and up to SAMPLE ids per finding; pass --json for machine-readable output and --days=N to
// change how far back the time-bounded findings look (default 365). Run it against the database you want to inspect:
//   node --env-file=.env scripts/integrity-report.cjs
const { PrismaClient } = require('@prisma/client')
const { repositoryPurchaseIssues } = require('./integrity-report/repository-purchases.cjs')

const SAMPLE = 20, SCAN = 5000
const args = process.argv.slice(2), asJson = args.includes('--json')
const days = Math.max(1, Math.min(3650, Number((args.find((arg) => arg.startsWith('--days=')) || '').slice(7)) || 365))

/** Every finding: { key, title, what, count, sample, capped }. `capped` means the scan stopped at its limit. */
async function findings(db, now = new Date(), options = {}) {
  const since = new Date(now.getTime() - days * 86_400_000), settled = new Date(now.getTime() - 10 * 60_000)
  const out = []
  const add = (key, title, what, rows, capped = false) => out.push({ key, title, what, count: rows.length, sample: rows.slice(0, SAMPLE), capped })

  // 1. Orders refunded for more than their total.
  {
    const sums = await db.returnRequest.groupBy({ by: ['orderId'], where: { status: 'REFUNDED' }, _sum: { refundMinor: true }, orderBy: { orderId: 'desc' }, take: SCAN })
    const orders = await db.order.findMany({ where: { id: { in: sums.map((row) => row.orderId) } }, select: { id: true, totalMinor: true } })
    const total = new Map(orders.map((order) => [order.id, order.totalMinor]))
    add('order-over-refunded', 'Orders refunded for more than their total', 'the refunded requests of the order sum to more than the order total',
      sums.filter((row) => total.has(row.orderId) && (row._sum.refundMinor || 0n) > total.get(row.orderId)).map((row) => ({ orderId: row.orderId, refunded: String(row._sum.refundMinor), total: String(total.get(row.orderId)) })), sums.length === SCAN)
  }
  // 2. Requests recorded as refunded with no wallet movement (the worker finishes these; listed while they wait).
  {
    const rows = await db.returnRequest.findMany({ where: { status: 'REFUNDED', walletTxId: null, refundMinor: { gt: 0n }, refundedAt: { lte: settled } }, orderBy: { id: 'desc' }, take: SCAN, select: { id: true, orderId: true, refundMinor: true } })
    add('refund-without-credit', 'Refunds recorded without a wallet credit', 'marked refunded, amount set, no wallet movement stored', rows.map((row) => ({ returnId: row.id, orderId: row.orderId, amount: String(row.refundMinor) })), rows.length === SCAN)
  }
  // 3. More than one gift card for one purchase.
  {
    const groups = await db.giftCard.groupBy({ by: ['note'], where: { note: { startsWith: 'buy:' } }, _count: { _all: true }, having: { note: { _count: { gt: 1 } } }, orderBy: { note: 'asc' }, take: SCAN })
    const cards = groups.length ? await db.giftCard.findMany({ where: { note: { in: groups.map((row) => row.note) } }, select: { id: true, note: true, status: true, amountMinor: true }, orderBy: { id: 'asc' } }) : []
    add('gift-card-duplicate', 'Gift cards issued more than once for one purchase', 'several cards share one purchase marker; one wallet debit paid for them',
      groups.map((row) => ({ purchase: row.note, cards: cards.filter((card) => card.note === row.note).map((card) => ({ id: card.id, status: card.status, amount: String(card.amountMinor) })) })), groups.length === SCAN)
  }
  // 4. Gift cards redeemed without their wallet credit.
  {
    const rows = await db.giftCard.findMany({ where: { status: 'REDEEMED', redeemedAt: { gte: since, lte: settled } }, orderBy: { id: 'desc' }, take: SCAN, select: { id: true, redeemedBy: true, amountMinor: true } })
    const paid = new Set((await db.walletTx.findMany({ where: { idempotencyKey: { in: rows.map((row) => `gift-card:redeem:${row.id}`) }, status: 'DONE' }, select: { idempotencyKey: true } })).map((row) => row.idempotencyKey))
    add('gift-card-redeemed-uncredited', 'Gift cards redeemed without a wallet credit', 'the card is used but its value never reached the wallet; the member finishes it by entering the code again',
      rows.filter((row) => !paid.has(`gift-card:redeem:${row.id}`)).map((row) => ({ cardId: row.id, userId: row.redeemedBy, amount: String(row.amountMinor) })), rows.length === SCAN)
  }
  // 5. Referral rewards still owed.
  {
    const owed = await db.referralAttribution.findMany({ where: { rewardedAt: null }, orderBy: { id: 'desc' }, take: SCAN, select: { id: true, referredUserId: true, referrerUserId: true } })
    const buyers = new Set((await db.invoice.findMany({ where: { userId: { in: owed.map((row) => row.referredUserId) }, status: 'PAID', kind: 'BILLING', totalMinor: { gt: 0n }, orderId: { not: null } }, distinct: ['userId'], select: { userId: true } })).map((row) => row.userId))
    add('referral-reward-owed', 'Referral rewards owed and not paid', 'the referred account has a paid purchase and the referrer was never rewarded; paid by the worker for purchases of the last 14 days, by the next purchase otherwise',
      owed.filter((row) => buyers.has(row.referredUserId) && row.referrerUserId !== row.referredUserId).map((row) => ({ attributionId: row.id, referrerUserId: row.referrerUserId, referredUserId: row.referredUserId })), owed.length === SCAN)
  }
  // 6. Delivered seller lines without a sale in the seller's ledger.
  {
    const lines = await db.orderLine.findMany({ where: { sellerId: { not: null }, createdAt: { gte: since, lte: settled }, order: { status: 'PAID', productDelivery: { isNot: null } } }, orderBy: { id: 'desc' }, take: SCAN, select: { id: true, orderId: true, sellerId: true, totalMinor: true } })
    const recorded = new Set((await db.sellerLedger.findMany({ where: { dedupeKey: { in: lines.map((line) => `sale:line:${line.id}`) } }, select: { dedupeKey: true } })).map((row) => row.dedupeKey))
    add('seller-sale-unrecorded', 'Delivered seller sales missing from the seller ledger', 'the seller was not credited; recorded by the scheduled job for the last 3 days only',
      lines.filter((line) => !recorded.has(`sale:line:${line.id}`)).map((line) => ({ orderId: line.orderId, lineId: line.id, sellerId: line.sellerId, amount: String(line.totalMinor) })), lines.length === SCAN)
  }
  // 7. Sellers with more than one open payout request.
  {
    const groups = await db.sellerPayout.groupBy({ by: ['sellerId'], where: { status: 'REQUESTED' }, _count: { _all: true }, _sum: { amountMinor: true }, having: { sellerId: { _count: { gt: 1 } } }, orderBy: { sellerId: 'asc' }, take: SCAN })
    add('seller-payout-duplicate', 'Sellers with more than one open payout request', 'pay at most one; the requests together may exceed the balance', groups.map((row) => ({ sellerId: row.sellerId, requests: row._count._all, total: String(row._sum.amountMinor) })), groups.length === SCAN)
  }
  // 8. Paid orders with VIP gift days and no gift period.
  {
    const orders = await db.order.findMany({ where: { status: 'PAID', createdAt: { gte: since, lte: settled }, OR: [{ product: { vipGiftDays: { gt: 0 } } }, { plan: { vipGiftDays: { gt: 0 } } }] }, orderBy: { id: 'desc' }, take: SCAN, select: { id: true, userId: true } })
    const granted = new Set((await db.userMembership.findMany({ where: { dedupeKey: { in: orders.map((order) => `gift:order:${order.id}`) } }, select: { dedupeKey: true } })).map((row) => row.dedupeKey))
    add('gift-membership-missing', 'Paid orders whose VIP gift days were not granted', 'granted by the scheduled job for the last 3 days only', orders.filter((order) => !granted.has(`gift:order:${order.id}`)).map((order) => ({ orderId: order.id, userId: order.userId })), orders.length === SCAN)
  }
  // 9. Void invoices that still hold reserved wallet credit.
  {
    const rows = await db.invoice.findMany({ where: { status: 'VOID', walletAppliedMinor: { gt: 0n }, updatedAt: { lte: settled } }, orderBy: { id: 'desc' }, take: SCAN, select: { id: true, number: true, userId: true, walletAppliedMinor: true } })
    add('void-invoice-credit', 'Void invoices that still hold wallet credit', 'the worker gives it back; listed while it waits or keeps failing', rows.map((row) => ({ invoice: row.number, userId: row.userId, credit: String(row.walletAppliedMinor) })), rows.length === SCAN)
  }
  // 10. Wallet renewals still pending.
  {
    const rows = await db.order.findMany({ where: { status: 'PENDING', provider: 'wallet', idempotencyKey: { startsWith: 'renew:' }, createdAt: { gte: since, lte: settled } }, orderBy: { id: 'desc' }, take: SCAN, select: { id: true, userId: true, idempotencyKey: true, totalMinor: true } })
    const charged = new Set((await db.walletTx.findMany({ where: { idempotencyKey: { in: rows.map((row) => `renew-wallet:${String(row.idempotencyKey).slice(6)}`) }, status: 'DONE' }, select: { idempotencyKey: true } })).map((row) => row.idempotencyKey))
    add('renewal-pending', 'Wallet renewals that never finished', 'charged ones were paid for and not renewed; the scheduled job handles the most recent orders', rows.map((row) => ({ orderId: row.id, userId: row.userId, amount: String(row.totalMinor), charged: charged.has(`renew-wallet:${String(row.idempotencyKey).slice(6)}`) })), rows.length === SCAN)
  }
  // 11. Reseller sales whose account belongs to someone other than the customer the sale names.
  {
    const orders = await db.order.findMany({ where: { status: 'PAID', createdAt: { gte: since }, meta: { contains: '"kind":"reseller"' } }, orderBy: { id: 'desc' }, take: SCAN, select: { id: true, userId: true, meta: true } })
    const subs = new Map((await db.subscription.findMany({ where: { orderId: { in: orders.map((order) => order.id) } }, select: { id: true, orderId: true, userId: true } })).map((sub) => [sub.orderId, sub]))
    add('reseller-account-wrong-owner', 'Reseller sales provisioned for the wrong user', 'the subscription of the order is not owned by the customer the sale names',
      orders.flatMap((order) => { let meta = {}; try { meta = JSON.parse(order.meta || '{}') } catch {} const sub = subs.get(order.id), customer = Number(meta.customerUserId); return sub && customer && sub.userId !== customer ? [{ orderId: order.id, subscriptionId: sub.id, ownedBy: sub.userId, soldFor: customer }] : [] }), orders.length === SCAN)
  }
  // 12. Point redemptions with neither a wallet credit nor an undo.
  {
    const rows = await db.loyaltyEntry.findMany({ where: { kind: 'REDEEM', points: { lt: 0 }, createdAt: { gte: since, lte: settled } }, orderBy: { id: 'desc' }, take: SCAN, select: { id: true, userId: true, points: true } })
    const paid = new Set((await db.walletTx.findMany({ where: { idempotencyKey: { in: rows.map((row) => `loyalty:redeem:${row.id}`) }, status: 'DONE' }, select: { idempotencyKey: true } })).map((row) => row.idempotencyKey))
    const undone = new Set((await db.loyaltyEntry.findMany({ where: { idempotencyKey: { in: rows.map((row) => `redeem-undo:${row.id}`) } }, select: { idempotencyKey: true } })).map((row) => row.idempotencyKey))
    add('points-redeemed-uncredited', 'Club points taken without wallet credit', 'finished by the marketing job for the last 7 days only', rows.filter((row) => !paid.has(`loyalty:redeem:${row.id}`) && !undone.has(`redeem-undo:${row.id}`)).map((row) => ({ entryId: row.id, userId: row.userId, points: -row.points })), rows.length === SCAN)
  }
  // 13. Paid plan or product invoices with no fulfillment job and no active subscription.
  {
    const paid = await db.invoice.findMany({ where: { status: 'PAID', orderId: { not: null }, paidAt: { gte: since, lte: settled }, OR: [{ planId: { not: null } }, { productId: { not: null } }] }, orderBy: { id: 'desc' }, take: SCAN, select: { id: true, number: true, orderId: true, userId: true } })
    const ids = paid.map((row) => row.orderId)
    const covered = new Set([...(await db.fulfillmentJob.findMany({ where: { orderId: { in: ids } }, select: { orderId: true } })).map((row) => row.orderId), ...(await db.subscription.findMany({ where: { orderId: { in: ids }, status: 'ACTIVE', username: { not: 'pending' } }, select: { orderId: true } })).map((row) => row.orderId)])
    add('paid-without-fulfillment', 'Paid orders with no fulfillment job', 'paid and never queued for delivery; the worker queues the most recent ones', paid.filter((row) => !covered.has(row.orderId)).map((row) => ({ invoice: row.number, orderId: row.orderId, userId: row.userId })), paid.length === SCAN)
  }
  {
    // Products with a code pool deliver themselves; an order paid while the shelf was empty waits for a refill.
    const short = await db.orderEvent.findMany({ where: { status: 'CODES_SHORT', createdAt: { gte: since }, order: { status: 'PAID', productDelivery: { is: { status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED'] } } } } }, orderBy: { id: 'asc' }, take: SCAN, select: { orderId: true, createdAt: true } })
    add('codes-waiting', 'Paid orders waiting for a digital code', 'the product delivers codes by itself and had none left; adding codes to the product delivers these orders at once', short.map((row) => ({ orderId: row.orderId, since: row.createdAt.toISOString() })), short.length === SCAN)
  }
  // Existing owner gains bounded Repository diagnosis using the same pure policy as Admin recovery.
  const repo = await repositoryPurchaseIssues(db, { limit: SCAN, afterPaymentId: options.repositoryAfter || 0 })
  for (const [group, key, title] of [['unfulfilled', 'repository-purchase-unfulfilled', 'Repository payments without a license'], ['ambiguous', 'repository-purchase-ambiguous', 'Repository receipts requiring manual review'], ['invalid', 'repository-purchase-invalid', 'Invalid Repository purchase payment records']]) {
    add(key, title, 'Review the payment in Repository Admin with Repository and finance permissions; no data was changed.', repo.groups[group], repo.capped)
    Object.assign(out[out.length - 1], { afterPaymentId: repo.afterPaymentId, nextAfterPaymentId: repo.nextAfterPaymentId, scannedPayments: repo.scanned })
  }
  return out
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set. Example: node --env-file=.env scripts/integrity-report.cjs'); process.exit(2) }
  const db = new PrismaClient()
  try {
    const rawCursor = (args.find(arg => arg.startsWith('--after-repository-payment=')) || '').slice(27)
    if (rawCursor && !/^(0|[1-9]\d*)$/.test(rawCursor)) throw Error('invalid Repository payment cursor')
    const result = await findings(db, new Date(), { repositoryAfter: rawCursor ? Number(rawCursor) : 0 })
    if (asJson) { console.log(JSON.stringify({ days, generatedAt: new Date().toISOString(), findings: result }, null, 1)); return }
    console.log(`Integrity report (read-only), time-bounded findings look back ${days} days\n`)
    for (const row of result) {
      console.log(`${row.count ? '!!' : 'ok'}  ${row.title}: ${row.count}${row.capped ? ` (scan stopped at ${SCAN} rows; there may be more)` : ''}`)
      if (row.nextAfterPaymentId) console.log(`    Continue Repository history with --after-repository-payment=${row.nextAfterPaymentId}`)
      if (row.count) { console.log(`    ${row.what}`); for (const item of row.sample) console.log(`    ${JSON.stringify(item)}`); if (row.count > row.sample.length) console.log(`    … and ${row.count - row.sample.length} more (use --json)`) }
    }
    const total = result.reduce((sum, row) => sum + row.count, 0)
    console.log(`\n${total ? `${total} record(s) need a decision.` : 'Nothing to report.'} Nothing was changed.`)
  } finally { await db.$disconnect() }
}

module.exports = { findings }
if (require.main === module) main().catch((error) => { console.error(error); process.exit(1) })
