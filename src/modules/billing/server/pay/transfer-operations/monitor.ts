import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import type { TransferMonitor } from '@/modules/billing/domain/pay-transfer-operations'
import { payContext, payTransaction, type PayActor } from '../context'
import { sourceOwner } from '../bale/access'
import { smsCredentialsReady } from '../bale/collection-context'
import { bankAmountRange } from '@/modules/billing/domain/pay-bale-collection'

type Observed = { sourceType: string; smsSourceId: string | null; instanceId: string; last: Date; count: bigint; rejected: bigint; p95: number | null }
export function transferMonitor(actor: PayActor): Promise<TransferMonitor> {
  return payTransaction(async tx => {
    const { settings } = await payContext(actor, tx, 'mobocom-pay.manage')
    const now = new Date(), since = new Date(now.getTime() - 86400000)
    const olderThanMinutes = 30
    const [observations, sms, api, confirmations, awaitingReview, overdue, oldest, principals, receipts] = await Promise.all([
      tx.$queryRaw<Observed[]>(Prisma.sql`SELECT "sourceType", "smsSourceId", "instanceId", max("receivedAt") AS last,
        count(*) FILTER (WHERE "receivedAt">=${since}) AS count,
        count(*) FILTER (WHERE "receivedAt">=${since} AND "status" IN ('REJECTED','CONFLICT')) AS rejected,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY GREATEST(0,EXTRACT(EPOCH FROM ("receivedAt"-"sourceSentAt"))*1000)) FILTER (WHERE "receivedAt">=${since} AND "code" NOT LIKE 'SMS_FORWARDER%') AS p95
        FROM "PayBaleNotice" WHERE "sourceType"='SMS' GROUP BY "sourceType","smsSourceId","instanceId"`),
      tx.paySmsSource.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { bankAccount: { select: { active: true, collectionUse: true } } } }),
      tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }),
      tx.$queryRaw<{ count: bigint; p50: number | null; p95: number | null }[]>(Prisma.sql`SELECT count(*) AS count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY GREATEST(0,EXTRACT(EPOCH FROM(c."paidAt"-n."sourceSentAt"))*1000)) FILTER (WHERE n."sourceType"='SMS' AND n."code" NOT LIKE 'SMS_FORWARDER%') AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY GREATEST(0,EXTRACT(EPOCH FROM(c."paidAt"-n."sourceSentAt"))*1000)) FILTER (WHERE n."sourceType"='SMS' AND n."code" NOT LIKE 'SMS_FORWARDER%') AS p95
        FROM "PayBaleCollection" c LEFT JOIN "PayBaleNotice" n ON n."id"=c."noticeId" WHERE c."status"='PAID' AND c."paidAt">=${since}`),
      tx.payBaleCollection.count({ where: { status: { in: ['UNDER_REVIEW','REVIEW'] }, invoice: { status: 'UNPAID' } } }),
      tx.payBaleCollection.count({ where: { status: 'PENDING', expiresAt: { lt: now }, invoice: { status: 'UNPAID' } } }),
      tx.payBaleCollection.findFirst({ where: { status: { in: ['UNDER_REVIEW','REVIEW'] }, invoice: { status: 'UNPAID' } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      tx.$queryRaw<{ principalRial: bigint }[]>(Prisma.sql`SELECT "principalRial" FROM "PayBaleCollection" GROUP BY "principalRial" ORDER BY max("createdAt") DESC LIMIT 12`),
      tx.paymentReceipt.aggregate({
        where: { status: 'PENDING', createdAt: { lte: new Date(now.getTime() - olderThanMinutes * 60000) }, invoice: { kind: 'PAY_COLLECTION' } },
        _count: true, _min: { createdAt: true },
      }),
    ])
    const enabled = api?.value === 'true' && settings.bale.enabled
    const sources: TransferMonitor['sources'] = []
    const sourceView = (id: string, label: string, ready: boolean, observation?: Observed) => ({ id, label, type: 'SMS' as const, ready, observed: Boolean(observation && observation.last.getTime() >= now.getTime() - 900000), lastReceivedAt: observation?.last.toISOString() || null, notices: Number(observation?.count || 0n), rejected: Number(observation?.rejected || 0n), p95DeliveryMs: observation?.p95 === null || observation?.p95 === undefined ? null : Math.round(observation.p95) })
    for (const s of sms) {
      sources.push(sourceView(s.id, s.label, Boolean(enabled && s.active && s.verified && s.bankAccount.active && smsCredentialsReady(s) && await sourceOwner(s.ownerUserId, tx)), observations.find(o => o.smsSourceId === s.id && o.instanceId === createHash('sha256').update(`${s.id}:${s.version}`).digest('hex'))))
    }
    const pools = []
    for (const p of principals) {
      const { first, last, capacity } = bankAmountRange(p.principalRial, settings.bale)
      // GLOBAL occupancy: quotes from other principals/banks can consume this range too.
      const occupied = capacity ? await tx.payBaleCollection.count({ where: { collectedRial: { gte: first, lte: last } } }) : 0
      const remaining = Math.max(0, capacity - occupied)
      pools.push({ principalRial: p.principalRial.toString(), capacity, occupied, remaining, state: remaining === 0 ? 'EXHAUSTED' as const : remaining <= Math.max(1, Math.ceil(capacity * .1)) ? 'LOW' as const : 'AVAILABLE' as const })
    }
    return { asOf: now.toISOString(), windowHours: 24, sources,
      receiptBacklog: { count: receipts._count, olderThanMinutes, oldestAt: receipts._min.createdAt?.toISOString() ?? null },
      totals: { received: observations.reduce((n,o) => n + Number(o.count), 0), paid: Number(confirmations[0].count), awaitingReview, overdue, oldestReviewAt: oldest?.createdAt.toISOString() || null, p50ConfirmationMs: confirmations[0].p50 === null ? null : Math.round(confirmations[0].p50), p95ConfirmationMs: confirmations[0].p95 === null ? null : Math.round(confirmations[0].p95) }, pools }
  })
}
