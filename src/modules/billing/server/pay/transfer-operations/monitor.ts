import { Prisma } from '@prisma/client'
import type { TransferMonitor } from '@/modules/billing/domain/pay-transfer-operations'
import { payContext, payTransaction, type PayActor } from '../context'
import { bankAmountRange } from '@/modules/billing/domain/pay-bale-collection'
import { requirePerm } from '@/modules/identity/server/access'
import { smsInstanceId, smsObservations, smsRejections, smsSourceInclude, smsSourceSignal, smsWatchMs } from './sms-health'

export function transferMonitor(actor: PayActor): Promise<TransferMonitor> {
  return payTransaction(async tx => {
    const { settings } = await payContext(actor, tx, 'mobocom-pay.manage')
    const now = new Date(), since = new Date(now.getTime() - 86400000)
    const olderThanMinutes = 30
    const [observations, rejections, sms, api, confirmations, awaitingReview, overdue, oldest, principals, receipts, canSeeInvoices] = await Promise.all([
      smsObservations(tx, since),
      smsRejections(tx, since),
      tx.paySmsSource.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: smsSourceInclude }),
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
      requirePerm(actor.req, 'invoices.manage', tx),
    ])
    const enabled = api?.value === 'true' && settings.bale.enabled
    const invoiceScope = canSeeInvoices ? {} : { payCollection: { isNot: null } }
    const sources: TransferMonitor['sources'] = await Promise.all(sms.map(async source => {
      const instanceId = smsInstanceId(source)
      const observation = observations.find(row => row.smsSourceId === source.id && row.instanceId === instanceId)
      const signal = await smsSourceSignal(tx, source, enabled, now, invoiceScope, observation)
      return {
        id: source.id, label: source.label, type: 'SMS', ...signal,
        observed: Boolean(observation && +observation.last >= +now - smsWatchMs),
        lastReceivedAt: observation?.last.toISOString() ?? null,
        lastValidAt: observation?.lastValid?.toISOString() ?? null,
        notices: Number(observation?.count ?? 0n), rejected: Number(observation?.rejected ?? 0n),
        p95DeliveryMs: observation?.p95 == null ? null : Math.round(observation.p95),
        reasons: rejections.filter(row => row.smsSourceId === source.id && row.instanceId === instanceId)
          .map(row => ({ code: row.code, count: row._count._all }))
          .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
      }
    }))
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
