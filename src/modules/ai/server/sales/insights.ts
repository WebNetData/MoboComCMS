import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { getEngagementSettings } from '@/modules/automation/server/engagement'
import { frequentlyBoughtProductIds } from '@/modules/recommendations/server/product-purchases'
import { ATTRIBUTION_DAYS, PAID_ORDER_STATUSES, lift, windowRate, type CampaignResult } from '../../domain/sales'

const PAID = Prisma.join([...PAID_ORDER_STATUSES])
const day = 86_400_000
const money = (rows: { currency: string; minor: bigint | number | null }[]) => {
  const totals = new Map<string, bigint>()
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) || 0n) + BigInt(row.minor || 0))
  return [...totals].map(([currency, minor]) => ({ currency, minor: minor.toString() }))
}

/**
 * Campaign results from real orders: a paid order within the attribution window after a marketing notice
 * counts once, for the latest notice before it. The comparison group is opted-in active members who were
 * sent nothing in the period. This is association, not proof that the message caused the purchase.
 */
export async function campaignResults(days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * day), window = Prisma.raw(`interval '${ATTRIBUTION_DAYS} days'`)
  const [notices, attributed, baseline, settings, carts] = await Promise.all([
    db.$queryRaw<{ source: string; sent: number; recipients: number; read: number }[]>`
      SELECT split_part("marketingSource", ':', 1) AS source, COUNT(*)::int AS sent, COUNT(DISTINCT "userId")::int AS recipients, COUNT("readAt")::int AS read
      FROM "UserNotification" WHERE "marketingSource" <> '' AND "createdAt" >= ${since} AND "createdAt" <= ${now}
      GROUP BY 1`,
    db.$queryRaw<{ source: string; userId: number; currency: string; minor: bigint }[]>`
      SELECT DISTINCT ON (o."id") split_part(n."marketingSource", ':', 1) AS source, o."userId", o."currency", o."totalMinor" AS minor
      FROM "Order" o JOIN "UserNotification" n ON n."userId" = o."userId" AND n."marketingSource" <> ''
        AND n."createdAt" >= ${since} AND o."createdAt" > n."createdAt" AND o."createdAt" <= n."createdAt" + ${window}
      WHERE o."status" IN (${PAID}) AND o."createdAt" <= ${now}
      ORDER BY o."id", n."createdAt" DESC
      LIMIT 20000`,
    db.$queryRaw<{ members: number; buyers: number }[]>`
      SELECT COUNT(*)::int AS members, COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Order" o WHERE o."userId" = u."id" AND o."status" IN (${PAID}) AND o."createdAt" >= ${since} AND o."createdAt" <= ${now}))::int AS buyers
      FROM "User" u WHERE u."marketingOptIn" = true AND u."status" = 'ACTIVE' AND u."role" = 'USER'
        AND NOT EXISTS (SELECT 1 FROM "UserNotification" n WHERE n."userId" = u."id" AND n."marketingSource" <> '' AND n."createdAt" >= ${since})`,
    getEngagementSettings().catch(() => null),
    db.cartReminder.findMany({ where: { sentAt: { gte: since, lte: now } }, select: { userId: true, valueMinor: true, currency: true, recoveredOrderId: true }, take: 20000 }),
  ])
  const base = baseline[0] && baseline[0].members ? windowRate(baseline[0].buyers / baseline[0].members, days) : 0
  const names = new Map((settings?.journeys || []).map(j => [j.id, j.name]))
  const campaigns: CampaignResult[] = notices.map(row => {
    const own = attributed.filter(a => a.source === row.source), buyers = new Set(own.map(a => a.userId)).size
    const conversion = row.recipients ? buyers / row.recipients : 0
    return { source: row.source, name: names.get(row.source) || 'ارتباط حذف‌شده یا قدیمی', sent: row.sent, recipients: row.recipients, read: row.read, buyers, orders: own.length, revenue: money(own), conversion, lift: lift(conversion, base) }
  }).sort((a, b) => b.sent - a.sent)
  const recovered = carts.filter(c => c.recoveredOrderId)
  return {
    days, attributionDays: ATTRIBUTION_DAYS, baseline: { members: baseline[0]?.members || 0, rate: base },
    campaigns,
    carts: { sent: carts.length, customers: new Set(carts.map(c => c.userId)).size, recovered: recovered.length, recoveredValue: money(recovered.map(c => ({ currency: c.currency, minor: c.valueMinor }))) },
  }
}

/** Categories with opted-in interested customers who have not bought there lately: counts only, no list of people. */
export async function categoryOpportunities(now = new Date()) {
  const year = new Date(now.getTime() - 365 * day), month = new Date(now.getTime() - 30 * day)
  const rows = await db.$queryRaw<{ categoryId: number; interested: number; reachable: number; ready: number }[]>`
    WITH signals AS (
      SELECT o."userId" AS uid, p."categoryId" AS cat, MAX(o."createdAt") AS bought
      FROM "OrderLine" l JOIN "Order" o ON o."id" = l."orderId" JOIN "Product" p ON p."id" = l."productId"
      WHERE o."status" IN (${PAID}) AND o."createdAt" >= ${year} AND p."categoryId" IS NOT NULL
      GROUP BY 1, 2
      UNION ALL
      SELECT f."userId", p."categoryId", NULL FROM "ItemFavorite" f JOIN "Product" p ON p."id" = f."itemId"
      WHERE f."itemType" = 'product' AND p."categoryId" IS NOT NULL
    ), per AS (SELECT uid, cat, MAX(bought) AS bought FROM signals GROUP BY uid, cat)
    SELECT per.cat AS "categoryId", COUNT(*)::int AS interested,
      COUNT(*) FILTER (WHERE u."marketingOptIn")::int AS reachable,
      COUNT(*) FILTER (WHERE u."marketingOptIn" AND (per.bought IS NULL OR per.bought < ${month}))::int AS ready
    FROM per JOIN "User" u ON u."id" = per.uid WHERE u."status" = 'ACTIVE'
    GROUP BY per.cat ORDER BY ready DESC, reachable DESC LIMIT 12`
  const ids = rows.map(r => r.categoryId)
  const [categories, products] = await Promise.all([
    db.productCategory.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    db.product.findMany({ where: { categoryId: { in: ids }, active: true, approval: 'APPROVED' }, orderBy: [{ soldCount: 'desc' }, { id: 'desc' }], select: { id: true, name: true, slug: true, image: true, categoryId: true }, take: 200 }),
  ])
  return rows.map(row => ({ ...row, name: categories.find(c => c.id === row.categoryId)?.name || '—', products: products.filter(p => p.categoryId === row.categoryId).slice(0, 4) }))
}

/** Store orders left unpaid for more than an hour in the last week; follow-up is a person's decision. */
export async function incompleteOrders(now = new Date()) {
  const where = { status: 'PENDING', lines: { some: {} }, createdAt: { gte: new Date(now.getTime() - 7 * day), lte: new Date(now.getTime() - 3_600_000) } }
  const [count, rows, value] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, userId: true, totalMinor: true, currency: true, createdAt: true, user: { select: { name: true, marketingOptIn: true } }, lines: { select: { name: true }, take: 2 } } }),
    db.order.groupBy({ by: ['currency'], where, _sum: { totalMinor: true } }),
  ])
  const later = await db.order.findMany({ where: { userId: { in: [...new Set(rows.flatMap(r => r.userId === null ? [] : [r.userId]))] }, status: { in: [...PAID_ORDER_STATUSES] }, createdAt: { gte: new Date(now.getTime() - 7 * day) } }, select: { userId: true, createdAt: true } })
  return {
    count, value: money(value.map(v => ({ currency: v.currency, minor: v._sum.totalMinor }))),
    orders: rows.map(o => ({ id: o.id, userId: o.userId, customer: o.user?.name || 'مشتری حضوری', marketingOptIn: o.user?.marketingOptIn || false, total: o.totalMinor.toString(), currency: o.currency, createdAt: o.createdAt.toISOString(), items: o.lines.map(l => l.name), boughtSince: o.userId !== null && later.some(p => p.userId === o.userId && p.createdAt > o.createdAt) })),
  }
}

/** Products that customers who bought the same things also bought, minus what this customer already has. */
export async function customerSuggestions(userId: number, now = new Date()) {
  const owned = await db.orderLine.findMany({ where: { productId: { not: null }, order: { userId, status: { in: [...PAID_ORDER_STATUSES] }, createdAt: { gte: new Date(now.getTime() - 365 * day) } } }, orderBy: { id: 'desc' }, select: { productId: true, product: { select: { categoryId: true } } }, take: 50 })
  const have = new Set(owned.map(l => l.productId!)), score = new Map<number, number>(), reason = new Map<number, string>()
  for (const id of [...have].slice(0, 5)) for (const [rank, other] of (await frequentlyBoughtProductIds(id, { days: 180, minimumBuyers: 3, take: 8 }, now)).entries()) {
    if (have.has(other)) continue
    score.set(other, (score.get(other) || 0) + 8 - rank); reason.set(other, 'خریداران همین کالاها این را هم خریده‌اند')
  }
  if (score.size < 6) {
    const categories = [...new Set(owned.map(l => l.product?.categoryId).filter((c): c is number => !!c))]
    for (const p of await db.product.findMany({ where: { categoryId: { in: categories }, id: { notIn: [...have, ...score.keys()] }, active: true, approval: 'APPROVED' }, orderBy: { soldCount: 'desc' }, select: { id: true }, take: 6 - score.size })) { score.set(p.id, 0); reason.set(p.id, 'پرفروش در دسته‌ای که از آن خریده') }
  }
  const ids = [...score].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 6)
  const [products, user] = await Promise.all([
    db.product.findMany({ where: { id: { in: ids }, active: true, approval: 'APPROVED' }, select: { id: true, name: true, slug: true, image: true } }),
    db.user.findUnique({ where: { id: userId }, select: { marketingOptIn: true, recommendationOptIn: true } }),
  ])
  return { purchased: have.size, marketingOptIn: !!user?.marketingOptIn, recommendationOptIn: !!user?.recommendationOptIn, items: ids.flatMap(id => { const p = products.find(x => x.id === id); return p ? [{ ...p, reason: reason.get(id) || '' }] : [] }) }
}
