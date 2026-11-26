import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { minorToNumber } from '@/shared/money'
import { CRM_PAGE_SIZE, CRM_SEGMENTS, CRM_SEGMENT_POLICY, type CrmDeskFilters, type CrmDeskPage } from '@/modules/livechat/domain/crm-desk'

type Result = {
  id: number | bigint | null; name: string; email: string; phone: string; status: string
  createdAt: string; lastOrderAt: string | null; spendRial: string
  purchases: bigint | number; segment: keyof typeof CRM_SEGMENTS
  total: bigint | number; buyers: bigint | number; needsFollowUp: bigint | number
}

const orders = {
  recent: Prisma.sql`id DESC`,
  lastOrder: Prisma.sql`CASE WHEN "lastOrderAt" IS NULL THEN 1 ELSE 0 END, "lastOrderAt" DESC, id DESC`,
  spend: Prisma.sql`"spendRial" DESC, id DESC`,
}

function contains(value: string) {
  return '%' + value.toLowerCase().replace(/[!%_]/g, char => '!' + char) + '%'
}

function searchTerms(q: string) {
  const digits = q.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15))
  const numeric = /^\d{1,10}$/.test(digits) && Number(digits) <= 2_147_483_647 ? Number(digits) : null
  const cleanPhone = digits.replace(/[\s()-]/g, '')
  const mobile = /^(?:\+98|0098|98|0)?(9\d{9})$/.exec(cleanPhone)?.[1]
  const phone = mobile ?? cleanPhone
  return Prisma.sql`(
    LOWER(u.name) LIKE ${contains(q)} ESCAPE '!' OR LOWER(u.email) LIKE ${contains(q)} ESCAPE '!'
    OR u.phone LIKE ${contains(phone || q)} ESCAPE '!'
    ${numeric === null ? Prisma.empty : Prisma.sql`OR u.id = ${numeric}`}
  )`
}

function iso(value: string) {
  return new Date(/^\d+$/.test(value) ? Number(value) : /(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(value) ? value : value.replace(' ', 'T') + 'Z').toISOString()
}

export async function crmSearch(filters: CrmDeskFilters, now = new Date()): Promise<Omit<CrmDeskPage, 'mayManageEngagement'>> {
  const terms = [Prisma.sql`u.role <> 'ADMIN' AND u."erasedAt" IS NULL`]
  if (filters.q) terms.push(searchTerms(filters.q))
  if (filters.status) terms.push(Prisma.sql`u.status = ${filters.status}`)
  if (filters.tag) terms.push(Prisma.sql`EXISTS (SELECT 1 FROM "CrmTag" t WHERE t."userId" = u.id AND t.tag = ${filters.tag})`)
  const segment = filters.segment ? Prisma.sql`WHERE segment = ${filters.segment}` : Prisma.empty
  const sort = orders[filters.sort]
  const offset = (filters.page - 1) * CRM_PAGE_SIZE
  const policy = CRM_SEGMENT_POLICY
  const sqlite = process.env.DATABASE_URL?.startsWith('file:')
  const lastOrder = sqlite
    ? Prisma.sql`CASE WHEN typeof("lastOrderAt") = 'integer' THEN "lastOrderAt" ELSE ROUND((julianday("lastOrderAt") - 2440587.5) * 86400000) END`
    : Prisma.sql`"lastOrderAt"`
  const cutoff = (days: number) => {
    const ms = now.getTime() - (days + 1) * policy.dayMs
    return sqlite ? ms : new Date(ms)
  }
  const [records, tagCounts] = await Promise.all([
    db.$queryRaw<Result[]>`
      WITH candidates AS (
        SELECT u.id, u.name, u.email, u.phone, u.status, u."createdAt" FROM "User" u WHERE ${Prisma.join(terms, ' AND ')}
      ), purchases AS (
        SELECT o."userId", COUNT(CASE WHEN o.currency IN ('IRT', 'IRR') THEN 1 END) AS purchases,
          SUM(CASE o.currency WHEN 'IRT' THEN o."totalMinor" * 10 WHEN 'IRR' THEN o."totalMinor" ELSE 0 END) AS "spendRial",
          MAX(o."createdAt") AS "lastOrderAt"
        FROM "Order" o JOIN candidates c ON c.id = o."userId"
        WHERE o.status = 'PAID' GROUP BY o."userId"
      ), segments AS (
        SELECT c.*, COALESCE(p.purchases, 0) AS purchases, COALESCE(p."spendRial", 0) AS "spendRial", p."lastOrderAt",
          CASE
            WHEN COALESCE(p.purchases, 0) = 0 THEN 'lead'
            WHEN p.purchases >= ${policy.loyalOrders} AND ${lastOrder} > ${cutoff(policy.loyalDays)} THEN 'loyal'
            WHEN ${lastOrder} <= ${cutoff(policy.lostDays)} THEN 'lost'
            WHEN ${lastOrder} <= ${cutoff(policy.riskDays)} THEN 'at-risk'
            WHEN p.purchases = 1 THEN 'new'
            ELSE 'active'
          END AS segment
        FROM candidates c LEFT JOIN purchases p ON p."userId" = c.id
      ), filtered AS (SELECT * FROM segments ${segment}),
      totals AS (
        SELECT COUNT(*) AS total, COUNT(CASE WHEN purchases > 0 THEN 1 END) AS buyers,
          COUNT(CASE WHEN segment IN ('at-risk', 'lost') THEN 1 END) AS "needsFollowUp" FROM filtered
      ), selected AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY ${sort}) AS slot FROM filtered ORDER BY ${sort}
        LIMIT ${CRM_PAGE_SIZE}
        OFFSET (SELECT CASE WHEN total = 0 THEN 0 WHEN total <= ${offset} THEN ((total - 1) / ${CRM_PAGE_SIZE}) * ${CRM_PAGE_SIZE} ELSE ${offset} END FROM totals)
      )
      SELECT s.id, s.name, s.email, s.phone, s.status, CAST(s."createdAt" AS TEXT) AS "createdAt",
        CAST(s."lastOrderAt" AS TEXT) AS "lastOrderAt", CAST(s."spendRial" AS TEXT) AS "spendRial",
        s.purchases, s.segment, t.total, t.buyers, t."needsFollowUp"
      FROM totals t LEFT JOIN selected s ON 1 = 1 ORDER BY s.slot
    `,
    db.$queryRaw<{ tag: string; count: bigint }[]>`
      SELECT t.tag, COUNT(*) AS count FROM "CrmTag" t JOIN "User" u ON u.id = t."userId"
      WHERE u.role <> 'ADMIN' AND u."erasedAt" IS NULL GROUP BY t.tag ORDER BY count DESC, t.tag ASC LIMIT 30
    `,
  ])
  const picked = records.filter(record => record.id !== null)
  const pageTags = picked.length ? await db.crmTag.findMany({
    where: { userId: { in: picked.map(row => Number(row.id)) } }, orderBy: { tag: 'asc' }, select: { userId: true, tag: true },
  }) : []
  const byUser = new Map<number, string[]>()
  for (const { userId, tag } of pageTags) {
    const tags = byUser.get(userId)
    if (tags) tags.push(tag)
    else byUser.set(userId, [tag])
  }
  const [counts] = records
  const total = Number(counts?.total ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / CRM_PAGE_SIZE))
  return {
    rows: picked.map(row => ({
      id: Number(row.id), name: row.name, email: row.email, phone: row.phone, status: row.status,
      createdAt: iso(row.createdAt), lastOrderAt: row.lastOrderAt ? iso(row.lastOrderAt) : null,
      orders: Number(row.purchases), spend: minorToNumber(BigInt(row.spendRial), 'IRR') / 10,
      segment: CRM_SEGMENTS[row.segment], tags: byUser.get(Number(row.id)) ?? [],
    })),
    tags: tagCounts.map(row => ({ ...row, count: Number(row.count) })),
    page: Math.min(filters.page, pageCount), pageSize: CRM_PAGE_SIZE, pageCount,
    summary: { total, buyers: Number(counts?.buyers ?? 0), needsFollowUp: Number(counts?.needsFollowUp ?? 0) },
  }
}
