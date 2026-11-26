import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { configuredBaleSources } from '@/modules/billing/domain/pay-bale-sources'
import type { TransferMonitor } from '@/modules/billing/domain/pay-transfer-operations'
import { payContext, payTransaction, type PayActor } from '../context'
import { sourceOwner } from '../bale/access'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { smsSourceConfig } from '@/modules/billing/domain/pay-sms-source'
import { latinDigits } from '@/shared/text/digits'
import { bankAmountRange } from '@/modules/billing/domain/pay-bale-collection'

type Observed = { sourceType: string; smsSourceId: string | null; instanceId: string; last: Date; count: bigint; rejected: bigint; p95: number | null }
export function transferMonitor(actor: PayActor): Promise<TransferMonitor> {
  return payTransaction(async tx => {
    const { settings } = await payContext(actor, tx, 'mobocom-pay.manage')
    const now = new Date(), since = new Date(now.getTime() - 86400000)
    const [observations, sms, api, confirmations, awaitingReview, overdue, oldest, principals] = await Promise.all([
      tx.$queryRaw<Observed[]>(Prisma.sql`SELECT "sourceType", "smsSourceId", "instanceId", max("receivedAt") AS last,
        count(*) FILTER (WHERE "receivedAt">=${since}) AS count,
        count(*) FILTER (WHERE "receivedAt">=${since} AND "status" IN ('REJECTED','CONFLICT')) AS rejected,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY GREATEST(0,EXTRACT(EPOCH FROM ("receivedAt"-"sourceSentAt"))*1000)) FILTER (WHERE "receivedAt">=${since} AND "code" NOT LIKE 'SMS_FORWARDER%') AS p95
        FROM "PayBaleNotice" GROUP BY "sourceType","smsSourceId","instanceId"`),
      tx.paySmsSource.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { bankAccount: { select: { active: true, collectionUse: true } } } }),
      tx.setting.findUnique({ where: { key: 'publicApiEnabled' } }),
      tx.$queryRaw<{ count: bigint; p50: number | null; p95: number | null }[]>(Prisma.sql`SELECT count(*) AS count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY GREATEST(0,EXTRACT(EPOCH FROM(c."paidAt"-n."sourceSentAt"))*1000)) FILTER (WHERE n."code" NOT LIKE 'SMS_FORWARDER%') AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY GREATEST(0,EXTRACT(EPOCH FROM(c."paidAt"-n."sourceSentAt"))*1000)) FILTER (WHERE n."code" NOT LIKE 'SMS_FORWARDER%') AS p95
        FROM "PayBaleCollection" c LEFT JOIN "PayBaleNotice" n ON n."id"=c."noticeId" WHERE c."status"='PAID' AND c."paidAt">=${since}`),
      tx.payBaleCollection.count({ where: { status: { in: ['UNDER_REVIEW','REVIEW'] }, invoice: { status: 'UNPAID' } } }),
      tx.payBaleCollection.count({ where: { status: 'PENDING', expiresAt: { lt: now }, invoice: { status: 'UNPAID' } } }),
      tx.payBaleCollection.findFirst({ where: { status: { in: ['UNDER_REVIEW','REVIEW'] }, invoice: { status: 'UNPAID' } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      tx.$queryRaw<{ principalRial: bigint }[]>(Prisma.sql`SELECT "principalRial" FROM "PayBaleCollection" GROUP BY "principalRial" ORDER BY max("createdAt") DESC LIMIT 12`),
    ])
    const enabled = api?.value === 'true' && settings.bale.enabled
    const sources: TransferMonitor['sources'] = []
    const sourceView = (id: string, label: string, type: 'SMS' | 'BALE', ready: boolean, observation?: Observed) => ({ id, label, type, ready, observed: Boolean(observation && observation.last.getTime() >= now.getTime() - 900000), lastReceivedAt: observation?.last.toISOString() || null, notices: Number(observation?.count || 0n), rejected: Number(observation?.rejected || 0n), p95DeliveryMs: observation?.p95 === null || observation?.p95 === undefined ? null : Math.round(observation.p95) })
    const bale = configuredBaleSources(process.env)
    for (const binding of bale) {
      const bank = await tx.bankAccount.findUnique({ where: { id: binding.bankAccountId }, select: { active: true, collectionUse: true, accountNumber: true } })
      sources.push(sourceView('bale:' + binding.id, 'بله · ' + binding.id + ' · @bam_bmi', 'BALE', Boolean(enabled && binding.enabled && binding.verified && bank?.active && bank.collectionUse === 'MOBOCOM_PAY' && /^\d{13}$/.test(latinDigits(bank.accountNumber).trim()) && await sourceOwner(binding.ownerUserId, tx)), observations.find(o => o.sourceType === 'BALE' && o.instanceId === binding.instanceId)))
    }
    if (!bale.length) sources.push(sourceView('bale', 'بله · اتصال پیکربندی نشده', 'BALE', false))
    for (const s of sms) {
      let credentialsReady = false
      try { smsSourceConfig(JSON.parse(s.templateJson)); credentialsReady = s.secretCiphertext.startsWith('encv1:') && /^[A-Za-z0-9_-]{43}$/.test(decryptPanelCredential(s.secretCiphertext)) } catch { /* Readiness only: never expose decryption errors or secret material. */ }
      sources.push(sourceView(s.id, s.label, 'SMS', Boolean(enabled && credentialsReady && s.active && s.verified && s.bankAccount.active && s.bankAccount.collectionUse === 'MOBOCOM_PAY' && await sourceOwner(s.ownerUserId, tx)), observations.find(o => o.sourceType === 'SMS' && o.smsSourceId === s.id && o.instanceId === createHash('sha256').update(`${s.id}:${s.version}`).digest('hex'))))
    }
    const pools = []
    for (const p of principals) {
      const { first, last, capacity } = bankAmountRange(p.principalRial, settings.bale)
      // GLOBAL occupancy: quotes from other principals/banks can consume this range too.
      const occupied = capacity ? await tx.payBaleCollection.count({ where: { collectedRial: { gte: first, lte: last } } }) : 0
      const remaining = Math.max(0, capacity - occupied)
      pools.push({ principalRial: p.principalRial.toString(), capacity, occupied, remaining, state: remaining === 0 ? 'EXHAUSTED' as const : remaining <= Math.max(1, Math.ceil(capacity * .1)) ? 'LOW' as const : 'AVAILABLE' as const })
    }
    return { asOf: now.toISOString(), windowHours: 24, sources, totals: { received: observations.reduce((n,o) => n + Number(o.count), 0), paid: Number(confirmations[0].count), awaitingReview, overdue, oldestReviewAt: oldest?.createdAt.toISOString() || null, p50ConfirmationMs: confirmations[0].p50 === null ? null : Math.round(confirmations[0].p50), p95ConfirmationMs: confirmations[0].p95 === null ? null : Math.round(confirmations[0].p95) }, pools }
  })
}
