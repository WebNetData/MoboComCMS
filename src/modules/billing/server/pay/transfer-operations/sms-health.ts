import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { TransferSourceHealth } from '@/modules/billing/domain/pay-transfer-operations'
import { sourceOwner } from '../bale/access'
import { smsCredentialsReady } from '../bale/collection-context'

type SmsSource = Prisma.PaySmsSourceGetPayload<{ include: { bankAccount: { select: { active: true; collectionUse: true } } } }>
export const smsSourceInclude = { bankAccount: { select: { active: true, collectionUse: true } } } as const
export const smsWatchMs = 15 * 60_000
const validNotice = Prisma.sql`("status" = 'ORIGINAL_TRANSFER' OR ("status" = 'IGNORED' AND "direction" = 'DEBIT'))`
const rejectedNotice = Prisma.sql`"status" IN ('REJECTED', 'CONFLICT')`

export type SmsObservation = {
  smsSourceId: string | null; instanceId: string; last: Date
  lastValid: Date | null; lastRejected: Date | null
  count: bigint; rejected: bigint; p95: number | null
}

export function smsObservations(tx: Prisma.TransactionClient, since: Date, sourceId?: string) {
  return tx.$queryRaw<SmsObservation[]>(Prisma.sql`
    SELECT "smsSourceId", "instanceId", max("receivedAt") AS last,
      max("receivedAt") FILTER (WHERE ${validNotice}) AS "lastValid",
      max("receivedAt") FILTER (WHERE ${rejectedNotice}) AS "lastRejected",
      count(*) FILTER (WHERE "receivedAt" >= ${since}) AS count,
      count(*) FILTER (WHERE "receivedAt" >= ${since} AND ${rejectedNotice}) AS rejected,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY GREATEST(0,EXTRACT(EPOCH FROM ("receivedAt"-"sourceSentAt"))*1000))
        FILTER (WHERE "receivedAt" >= ${since} AND ${validNotice} AND "code" NOT LIKE 'SMS_FORWARDER%') AS p95
    FROM "PayBaleNotice"
    WHERE "sourceType" = 'SMS' ${sourceId ? Prisma.sql`AND "smsSourceId" = ${sourceId}` : Prisma.empty}
    GROUP BY "smsSourceId", "instanceId"
  `)
}

export function smsRejections(tx: Prisma.TransactionClient, since: Date) {
  return tx.payBaleNotice.groupBy({
    by: ['smsSourceId', 'instanceId', 'code'],
    where: { sourceType: 'SMS', receivedAt: { gte: since }, status: { in: ['REJECTED', 'CONFLICT'] } },
    _count: { _all: true },
  })
}

export function smsInstanceId(source: Pick<SmsSource, 'id' | 'version'>) {
  return createHash('sha256').update(`${source.id}:${source.version}`).digest('hex')
}

export function smsSourceReady(tx: Prisma.TransactionClient, source: SmsSource, enabled: boolean) {
  return Boolean(enabled && source.active && source.verified && source.bankAccount.active &&
    source.bankAccount.collectionUse === 'MOBOCOM_PAY' && smsCredentialsReady(source)) &&
    sourceOwner(source.ownerUserId, tx).then(Boolean)
}

export function smsHealth(ready: boolean, recentValid: boolean, recentRejection: boolean, delayed: boolean): TransferSourceHealth['health'] {
  if (!ready) return 'NOT_READY'
  if (recentRejection) return 'REJECTIONS'
  if (recentValid) return 'RECENT_VALID'
  return delayed ? 'SILENT_BACKLOG' : 'UNKNOWN'
}

const bindingKey = (id: string) => `{"id":${JSON.stringify(id)},"version":`
function currentSmsBinding(source: Pick<SmsSource, 'id' | 'version'>) {
  return { sourceBindings: { contains: `${bindingKey(source.id)}${source.version}}` } }
}

export function smsAffectedWhere(source: Pick<SmsSource, 'id' | 'version'>, now: Date, health: TransferSourceHealth['health']): Prisma.PayBaleCollectionWhereInput {
  // Frozen bindings are serialized by collection-create as {id,version} objects.
  // Include a closing brace for the version so 1 cannot match 10.
  return {
    status: 'UNDER_REVIEW', noticeId: null,
    receipt: { status: 'PENDING' },
    invoice: { status: 'UNPAID' },
    sourceTypes: { contains: '"SMS"' },
    sourceBindings: { contains: bindingKey(source.id) },
    ...(health === 'NOT_READY' || health === 'REJECTIONS' ? {} : {
      OR: [
        { NOT: currentSmsBinding(source) },
        ...(health === 'SILENT_BACKLOG' || health === 'UNKNOWN'
          ? [{ receipt: { createdAt: { lte: new Date(now.getTime() - smsWatchMs) } } }]
          : []),
      ],
    }),
  }
}

export async function smsSourceSignal(tx: Prisma.TransactionClient, source: SmsSource, enabled: boolean, now: Date, invoiceScope: Prisma.InvoiceWhereInput, observed?: { lastValid: Date | null; lastRejected: Date | null }) {
  const ready = await smsSourceReady(tx, source, enabled)
  const threshold = now.getTime() - smsWatchMs
  const recentValid = Boolean(observed?.lastValid && +observed.lastValid >= threshold)
  const recentRejection = Boolean(observed?.lastRejected && +observed.lastRejected >= threshold &&
    (!observed.lastValid || +observed.lastRejected >= +observed.lastValid))
  const initialHealth = smsHealth(ready, recentValid, recentRejection, false)
  const affected = await tx.payBaleCollection.count({
    where: { AND: [smsAffectedWhere(source, now, initialHealth), { invoice: invoiceScope }] },
  })
  const delayed = initialHealth === 'UNKNOWN' && affected > 0 && Boolean(await tx.payBaleCollection.findFirst({
    where: { AND: [smsAffectedWhere(source, now, initialHealth), currentSmsBinding(source), { invoice: invoiceScope }] },
    select: { id: true },
  }))
  return { ready, affected, health: smsHealth(ready, recentValid, recentRejection, delayed) }
}
