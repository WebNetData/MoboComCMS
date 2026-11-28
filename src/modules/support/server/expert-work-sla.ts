import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { createSectionSettingsHistory, sectionSettingsRevision } from '@/modules/settings/server'
import { normalizeExpertWorkPolicy, type ExpertWorkQueue, type ExpertWorkSource } from '@/modules/support/domain/expert-work-sla'
import { EXPERT_WAIT_END, EXPERT_WAIT_START } from '@/modules/support/server/expert-work-wait'

const pageSize = 25

export const expertWorkSettings = (source: ExpertWorkSource) => createSectionSettingsHistory(
  `expert-work-sla.${source}.v1`,
  `settings-expert-work-sla-${source}`,
  normalizeExpertWorkPolicy,
  settings => ({ source, ...settings }),
)

const paidStoreWork = Prisma.sql`
  SELECT o.id, o.id AS "orderId", o."userId", o."assigneeId", p.name AS title, NULL::int AS "formId",
    COALESCE(i."paidAt", d."createdAt") AS "paidAt"
  FROM "Order" o
  JOIN "ProductDelivery" d ON d."orderId" = o.id
  JOIN "Product" p ON p.id = o."productId"
  LEFT JOIN "Invoice" i ON i."orderId" = o.id
  WHERE o.status = 'PAID' AND o."userId" IS NOT NULL AND d.status IN ('PENDING','PROCESSING')
    AND NOT EXISTS (SELECT 1 FROM "OrderLine" l WHERE l."orderId" = o.id AND l.kind = 'PHYSICAL')
    AND (p.kind <> 'PHYSICAL' OR EXISTS (SELECT 1 FROM "OrderLine" l WHERE l."orderId" = o.id))
`

const paidFormWork = Prisma.sql`
  SELECT f.id, o.id AS "orderId", f."userId", f."assigneeId", sf.title, f."formId", f."paidAt"
  FROM "FormSubmission" f
  JOIN "SiteForm" sf ON sf.id = f."formId"
  JOIN "Order" o ON o.id = f."orderId" AND o."userId" = f."userId" AND o.status = 'PAID'
  WHERE f."payStatus" = 'PAID' AND f."paidAt" IS NOT NULL AND f.status NOT IN ('SPAM','ARCHIVED')
    AND f.stage NOT IN ('','DONE','REJECTED')
`

type Overdue = {
  id: number
  title: string
  formId: number | null
  assignee: string | null
  claimDue: Date | null
  replyDue: Date | null
  deliveryDue: Date | null
}

export async function expertWorkQueue(source: ExpertWorkSource, after: number | null, now = new Date()): Promise<ExpertWorkQueue> {
  const policy = await expertWorkSettings(source).read()
  const work = source === 'store' ? paidStoreWork : paidFormWork
  const rows = await db.$queryRaw<Overdue[]>(Prisma.sql`
    WITH work AS (${work})
    SELECT w.id, w.title, w."formId", COALESCE(NULLIF(u.name, ''), NULLIF(u.email, '')) AS assignee,
      CASE WHEN deadlines.claim <= ${now} AND w."assigneeId" IS NULL THEN deadlines.claim END AS "claimDue",
      CASE WHEN deadlines.reply <= ${now} AND t.status = 'OPEN' THEN deadlines.reply END AS "replyDue",
      CASE WHEN deadlines.delivery <= COALESCE(paused.since, ${now}) THEN deadlines.delivery END AS "deliveryDue"
    FROM work w
    LEFT JOIN "User" u ON u.id = w."assigneeId"
    LEFT JOIN "Ticket" t ON t."expertRequestKey" = ${source} || ':' || w.id::text
      AND t."orderId" = w."orderId" AND t."userId" = w."userId"
    LEFT JOIN LATERAL (
      SELECT min(m."createdAt") AS since FROM "TicketMessage" m
      WHERE m."ticketId" = t.id AND NOT m."internal" AND NOT m."fromAdmin"
        AND (t."lastStaffAt" IS NULL OR m."createdAt" >= t."lastStaffAt")
    ) customer ON t.id IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT sum(e.end_at - GREATEST(e.start_at, w."paidAt"))
        FILTER (WHERE e.start_kind = ${EXPERT_WAIT_START} AND e.end_kind = ${EXPERT_WAIT_END}
          AND e.end_at > GREATEST(e.start_at, w."paidAt")) AS elapsed,
        max(e.start_at) FILTER (WHERE e.start_kind = ${EXPERT_WAIT_START} AND e.end_kind IS NULL) AS open_since
      FROM (
        SELECT status AS start_kind, "createdAt" AS start_at,
          lead(status) OVER timeline AS end_kind, lead("createdAt") OVER timeline AS end_at
        FROM "OrderEvent"
        WHERE "orderId" = w."orderId" AND note = 'expert-ticket:' || t.id::text
          AND status IN (${EXPERT_WAIT_START}, ${EXPERT_WAIT_END})
        WINDOW timeline AS (ORDER BY "createdAt", id)
      ) e
    ) waits ON t.id IS NOT NULL
    CROSS JOIN LATERAL (
      SELECT CASE WHEN t.status = 'PENDING' THEN COALESCE(waits.open_since, t."lastStaffAt") END AS since
    ) paused
    CROSS JOIN LATERAL (
      SELECT
        w."paidAt" + ${policy.claimMinutes} * interval '1 minute' AS claim,
        customer.since + ${policy.replyMinutes} * interval '1 minute' AS reply,
        w."paidAt" + ${policy.deliveryMinutes} * interval '1 minute'
          + COALESCE(waits.elapsed, interval '0 seconds') AS delivery
    ) deadlines
    WHERE (${after}::int IS NULL OR w.id > ${after}::int)
      AND (
        (deadlines.claim <= ${now} AND w."assigneeId" IS NULL)
        OR (deadlines.reply <= ${now} AND t.status = 'OPEN' AND (t."lastStaffAt" IS NULL OR t."lastCustomerAt" >= t."lastStaffAt"))
        OR deadlines.delivery <= COALESCE(paused.since, ${now})
      )
    ORDER BY w.id ASC
    LIMIT ${pageSize + 1}
  `)
  const items = rows.slice(0, pageSize).map(row => ({
    id: row.id, title: row.title, assignee: row.assignee,
    href: source === 'store' ? `/admin/store/orders/${row.id}` : `/admin/forms?form=${row.formId}&tab=inbox&entry=${row.id}`,
    deadlines: ([
      ['claim', row.claimDue], ['reply', row.replyDue], ['delivery', row.deliveryDue],
    ] as const).flatMap(([kind, date]) => date ? [{ kind, dueAt: date.toISOString() }] : []),
  }))
  return { policy, revision: sectionSettingsRevision(policy), items, nextAfter: rows.length > pageSize ? items.at(-1)?.id ?? null : null }
}
