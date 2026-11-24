import { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { parseRoutingSnapshot } from '@/modules/billing/domain/pay-routing'
import type { PayBotOperationView, PayBotOperationsPage, PayBotOperationDetail } from '@/modules/billing/domain/pay-operations'
import { merchantFor, payTransaction, type PayActor } from '../context'

const include = { payment: { include: { terminal: true, walletTx: { select: { userId: true, currency: true, type: true, status: true, amountMinor: true, withdrawableDeltaMinor: true } }, merchant: { select: { userId: true } } } } } as const
type Row = Prisma.PayBotDeliveryGetPayload<{ include: typeof include }>
const statuses = ['WAITING', 'QUEUED', 'SENDING', 'SENT', 'UNKNOWN', 'BLOCKED']
export const overdueDelivery = (row: Pick<Row, 'status' | 'updatedAt' | 'lastAttemptAt'>, now = Date.now()) =>
  row.status === 'QUEUED' ? row.updatedAt.getTime() <= now - 300_000 : row.status === 'SENDING' && !!row.lastAttemptAt && row.lastAttemptAt.getTime() <= now - 120_000

function operationView(row: Row): PayBotOperationView {
  const wallet = row.payment.walletTx
  const creditMatches = row.payment.status === 'PAID' && !!wallet && wallet.userId === row.payment.merchant.userId && wallet.currency === 'IRR' && wallet.type === 'PAY_CREDIT' && wallet.status === 'DONE' && wallet.amountMinor === row.payment.netMinor && wallet.withdrawableDeltaMinor === row.payment.netMinor
  return {
    id: row.id, paymentId: row.paymentId, externalId: row.payment.externalId, terminalName: row.payment.terminal.name,
    status: row.status as PayBotOperationView['status'], paymentStatus: row.payment.status === 'PENDING' && row.payment.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : row.payment.status as PayBotOperationView['paymentStatus'],
    amountRial: row.payment.amountMinor.toString(), totalRial: row.payment.totalMinor.toString(), attempts: row.attempts, version: row.version,
    lastCode: row.lastCode, httpStatus: row.httpStatus, updatedAt: row.updatedAt.toISOString(), createdAt: row.createdAt.toISOString(),
    ruleName: parseRoutingSnapshot(row.routingSnapshot)?.ruleName || '', overdue: overdueDelivery(row), creditMatches,
  }
}

export async function botOperations(actor: PayActor, input: Record<string, unknown> = {}): Promise<PayBotOperationsPage> {
  const q = String(input.q || '').trim(), terminalId = String(input.terminalId || ''), status = String(input.status || ''), paymentStatus = String(input.paymentStatus || '')
  const requested = String(input.page || '1')
  if (q.length > 100 || terminalId.length > 64 || (status && ![...statuses, 'REVIEW', 'OVERDUE'].includes(status)) || (paymentStatus && !['PENDING', 'PAID', 'EXPIRED'].includes(paymentStatus)) || !/^[1-9][0-9]{0,5}$/.test(requested)) throw new PayError('فیلتر عملیات معتبر نیست')
  return payTransaction(async tx => {
    const merchant = await merchantFor(actor, tx), now = new Date()
    const base: Prisma.PayBotDeliveryWhereInput = { payment: { merchantId: merchant.id } }
    const staleSending: Prisma.PayBotDeliveryWhereInput = { status: 'SENDING', lastAttemptAt: { lte: new Date(now.getTime() - 120_000) } }
    const overdue: Prisma.PayBotDeliveryWhereInput = { OR: [{ status: 'QUEUED', updatedAt: { lte: new Date(now.getTime() - 300_000) } }, staleSending] }
    const review: Prisma.PayBotDeliveryWhereInput = { OR: [{ status: { in: ['UNKNOWN', 'BLOCKED'] } }, staleSending] }
    const payment: Prisma.PayPaymentWhereInput = { merchantId: merchant.id, ...(terminalId ? { terminalId } : {}) }
    if (paymentStatus === 'PAID') payment.status = 'PAID'
    if (paymentStatus === 'PENDING') { payment.status = 'PENDING'; payment.expiresAt = { gt: now } }
    if (paymentStatus === 'EXPIRED') payment.OR = [{ status: 'EXPIRED' }, { status: 'PENDING', expiresAt: { lte: now } }]
    const where: Prisma.PayBotDeliveryWhereInput = { payment, ...(q ? { OR: [{ payment: { externalId: { contains: q, mode: 'insensitive' } } }, { paymentId: { contains: q } }] } : {}), ...(statuses.includes(status) ? { status } : {}) }
    if (status === 'REVIEW' || status === 'OVERDUE') where.AND = [status === 'REVIEW' ? review : overdue]
    const [total, grouped, reviewCount, overdueCount, paidUndelivered, creditIssueRows] = await Promise.all([
      tx.payBotDelivery.count({ where }), tx.payBotDelivery.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      tx.payBotDelivery.count({ where: { AND: [base, review] } }), tx.payBotDelivery.count({ where: { AND: [base, overdue] } }),
      tx.payBotDelivery.count({ where: { ...base, status: { not: 'SENT' }, payment: { merchantId: merchant.id, status: 'PAID' } } }),
      tx.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT count(*) AS count FROM "PayBotDelivery" d
        JOIN "PayPayment" p ON p.id=d."paymentId" JOIN "PayMerchant" m ON m.id=p."merchantId"
        LEFT JOIN "WalletTx" w ON w.id=p."walletTxId"
        WHERE p."merchantId"=${merchant.id} AND p.status='PAID' AND
        (w.id IS NULL OR w."userId"<>m."userId" OR w.currency<>'IRR' OR w.type<>'PAY_CREDIT'
         OR w.status<>'DONE' OR w."amountMinor"<>p."netMinor" OR w."withdrawableDeltaMinor"<>p."netMinor")`),
    ])
    const pages = Math.max(1, Math.ceil(total / 25)), page = Math.min(Number(requested), pages)
    const rows = await tx.payBotDelivery.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 25, take: 25 })
    const count = (key: string) => grouped.find(row => row.status === key)?._count._all || 0
    return { items: rows.map(operationView), page, pages, total, summary: { queued: count('QUEUED'), sending: count('SENDING'), needsReview: reviewCount, overdue: overdueCount, paidUndelivered, creditIssues: Number(creditIssueRows[0].count) } }
  })
}

export async function botOperationDetail(actor: PayActor, id: string): Promise<PayBotOperationDetail> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new PayError('شناسهٔ عملیات معتبر نیست')
  return payTransaction(async tx => {
    const merchant = await merchantFor(actor, tx)
    const row = await tx.payBotDelivery.findFirst({ where: { id, payment: { merchantId: merchant.id } }, include })
    if (!row) throw new PayError('عملیات پیدا نشد', 404)
    const [jobs, audit] = await Promise.all([
      tx.backgroundJob.findMany({ where: { kind: 'pay.bot-delivery', payload: { contains: id } }, orderBy: { id: 'desc' }, take: 12, select: { id: true, status: true, attempts: true, runAt: true, lockedAt: true, payload: true } }),
      tx.auditLog.findMany({ where: { targetType: 'mobocom-pay', targetId: id, action: { startsWith: 'mobocom-pay.bot.' } }, orderBy: { id: 'desc' }, take: 30, select: { id: true, action: true, metadata: true, createdAt: true } }),
    ])
    const json = (raw: string): Record<string, unknown> => { try { const value = JSON.parse(raw); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} } }
    return {
      operation: operationView(row), routing: parseRoutingSnapshot(row.routingSnapshot),
      jobs: jobs.filter(job => json(job.payload).deliveryId === id).map(({ payload: _payload, ...job }) => ({ ...job, runAt: job.runAt.toISOString(), lockedAt: job.lockedAt?.toISOString() || null })),
      audit: audit.map(event => { const metadata = json(event.metadata); return { id: event.id, action: event.action, at: event.createdAt.toISOString(), ...(typeof metadata.code === 'string' ? { code: metadata.code.slice(0, 80) } : {}), ...(typeof metadata.status === 'string' ? { status: metadata.status.slice(0, 40) } : {}) } }),
    }
  })
}
