import type { PayBaleNotice, Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { transferDifference, type TransferReviewDetail, type TransferReviewQueue, type TransferQueueStage } from '@/modules/billing/domain/pay-transfer-operations'
import { requirePerm } from '@/modules/identity/server/access'
import { payContext, payTransaction, type PayActor } from '../context'
import { collectionSourceActor } from '../bale/collection-proof'
import { noticeInclude, reviewCollection } from './review-context'
import { canApproveOwnPayReceipt } from '../receipt-review-access'
import { smsAffectedWhere, smsInstanceId, smsObservations, smsSourceInclude, smsSourceSignal } from './sms-health'

function noticeView(notice: PayBaleNotice, candidate = false): TransferReviewDetail['notice'] {
  if (notice.amountMinor == null) return null
  return {
    id: notice.id, source: notice.sourceType, amountRial: notice.amountMinor.toString(),
    receivedAt: notice.receivedAt.toISOString(), sourceSentAt: notice.sourceSentAt.toISOString(),
    timeBasis: notice.code.startsWith('SMS_FORWARDER_') ? 'SERVER_RECEIPT' : notice.sourceType === 'SMS' ? 'PHONE_RECEIPT' : 'SOURCE_MESSAGE',
    candidate,
  }
}

async function receiptNoticeCandidate(tx: Prisma.TransactionClient, row: Awaited<ReturnType<typeof reviewCollection>>) {
  if (row.invoice.status !== 'UNPAID' || !row.acceptedAt || !row.sourceBindings.includes(smsBindingPrefix)) return null
  const notices = await tx.payBaleNotice.findMany({
    where: {
      bankAccountId: row.bankAccountId, sourceType: 'SMS', direction: 'CREDIT', status: 'ORIGINAL_TRANSFER',
      amountMinor: row.collectedRial, collectionMatch: null, transferReview: null,
      receivedAt: { gte: row.createdAt }, sourceSentAt: { gte: new Date(Math.max(+row.acceptedAt, +row.validFrom)) },
    },
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], take: 10,
  })
  for (const notice of notices) {
    try { await collectionSourceActor(tx, row, notice); return notice }
    catch (error) { if (!(error instanceof PayError)) throw error }
  }
  return null
}

async function receiptActions(tx: Prisma.TransactionClient, actor: PayActor, row: Awaited<ReturnType<typeof reviewCollection>> | null) {
  if (!row || row.receipt?.status !== 'PENDING') return { canReviewReceipt: false, canRejectReceipt: false, requiresTrackingCode: false }
  const paid = row.status === 'PAID' && row.invoice.status === 'PAID'
  const unpaid = row.status === 'UNDER_REVIEW' && row.invoice.status === 'UNPAID'
  const ownMerchant = row.invoice.payCollection?.merchant.userId === actor.id
  const ownInvoice = row.invoice.userId === actor.id
  const independent = !ownMerchant && !ownInvoice
  const canReviewReceipt = (paid || unpaid) && (independent || ownMerchant && await canApproveOwnPayReceipt(tx, actor.req, actor.id))
  return {
    canReviewReceipt,
    canRejectReceipt: independent && unpaid,
    requiresTrackingCode: canReviewReceipt && unpaid && Boolean(row.invoice.payCollection) && !row.receipt.trackingCode,
  }
}

export function transferReviewQueue(actor: PayActor, params: URLSearchParams): Promise<TransferReviewQueue> {
  return payTransaction(async tx => {
    const { settings } = await payContext(actor, tx, 'mobocom-pay.manage')
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(params.get('page'))) || 1))
    const closed = params.get('closed') === 'true'
    const receiptsPage = Math.max(1, Math.min(10000, Math.trunc(Number(params.get('receiptsPage'))) || 1))
    const now = new Date()
    const stage = params.get('stage')
    const sourceId = params.get('smsSource')
    const invoiceScope = await requirePerm(actor.req, 'invoices.manage', tx) ? {} : { payCollection: { isNot: null } }
    const stageWhere = transferQueueWhere(now)
    const sms = sourceId && sourceId.length <= 64 ? await tx.paySmsSource.findUnique({
      where: { id: sourceId }, include: smsSourceInclude,
    }) : null
    if (sourceId && !sms) throw new PayError('منبع پیامک بانکی پیدا نشد', 404)
    let impact: Prisma.PayBaleCollectionWhereInput | undefined
    if (sms) {
      const [api, observed] = await Promise.all([
        tx.setting.findUnique({ where: { key: 'publicApiEnabled' }, select: { value: true } }),
        smsObservations(tx, new Date(+now - 86_400_000), sms.id),
      ])
      const signal = await smsSourceSignal(tx, sms, api?.value === 'true' && settings.bale.enabled, now, invoiceScope, observed.find(row => row.instanceId === smsInstanceId(sms)))
      impact = smsAffectedWhere(sms, now, signal.health)
    }
    const where: Prisma.PayBaleNoticeWhereInput = { status: 'ORIGINAL_TRANSFER', direction: 'CREDIT', ...(sms && { smsSourceId: sms.id }), ...(closed ? { transferReview: { status: { in: ['CONFIRMED','DISMISSED'] } } } : {
      AND: [{ OR: [{ transferReview: null }, { transferReview: { status: 'OPEN' } }] }, { OR: [{ collectionMatch: null }, { collectionMatch: { status: { not: 'PAID' } } }] }],
    }) }
    const receiptWhere: Prisma.PayBaleCollectionWhereInput = {
      invoice: invoiceScope,
      AND: impact ? [impact] : [],
      OR: stage === 'WAITING_RECEIPT' || stage === 'WAITING_SMS' || stage === 'REVIEW'
        ? [stageWhere[stage]] : Object.values(stageWhere),
    }
    const [total, rows, receipts, receiptsTotal] = await Promise.all([
      tx.payBaleNotice.count({ where }),
      tx.payBaleNotice.findMany({ where, include: noticeInclude, orderBy: [{ receivedAt: 'desc' },{ id: 'desc' }], skip: (page - 1) * 25, take: 25 }),
      tx.payBaleCollection.findMany({ where: receiptWhere, include: { invoice: { select: { number: true, status: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (receiptsPage - 1) * 25, take: 25 }),
      tx.payBaleCollection.count({ where: receiptWhere }),
    ])
    return { page, pages: Math.max(1, Math.ceil(total / 25)), total, receiptsPage, receiptsPages: Math.max(1, Math.ceil(receiptsTotal / 25)), receiptsTotal, ...(sms && { smsSource: { id: sms.id, label: sms.label } }), items: rows.map(n => ({ id: n.id, source: n.sourceType, amountRial: n.amountMinor!.toString(), receivedAt: n.receivedAt.toISOString(), invoiceNumber: n.collectionMatch?.invoice.number || null, status: (n.transferReview?.status || 'OPEN') as 'OPEN' | 'DISMISSED' | 'CONFIRMED', reason: n.collectionMatch?.reviewReason || 'UNMATCHED' })),
      receipts: receipts.map(c => ({
        id: c.id, invoiceNumber: c.invoice.number, status: c.status, reason: c.reviewReason,
        receiptId: c.receiptId, createdAt: c.createdAt.toISOString(), totalRial: c.collectedRial.toString(),
        stage: c.status === 'PENDING' ? 'WAITING_RECEIPT' : c.status === 'UNDER_REVIEW' && !c.noticeId && c.expiresAt > now && c.sourceTypes.includes('"SMS"') && c.sourceBindings.includes(smsBindingPrefix) && c.receiptId && c.invoice.status === 'UNPAID' ? 'WAITING_SMS' : 'REVIEW',
      })) }
  })
}

// The quote owner serializes each frozen SMS binding as an object in this array.
const smsBindingPrefix = '"sms":[{'

function transferQueueWhere(now: Date): Record<TransferQueueStage, Prisma.PayBaleCollectionWhereInput> {
  const waitingSms: Prisma.PayBaleCollectionWhereInput = {
    noticeId: null, receiptId: { not: null }, expiresAt: { gt: now },
    sourceTypes: { contains: '"SMS"' }, sourceBindings: { contains: smsBindingPrefix }, invoice: { status: 'UNPAID' },
  }
  return {
    WAITING_RECEIPT: {
      status: 'PENDING', activeInvoiceId: { not: null }, acceptedAt: { not: null }, receiptId: null, expiresAt: { gt: now },
      invoice: { status: 'UNPAID', payCollection: { isNot: null } },
    },
    WAITING_SMS: { status: 'UNDER_REVIEW', ...waitingSms },
    REVIEW: {
      OR: [
        { status: 'REVIEW' },
        { status: 'UNDER_REVIEW', NOT: waitingSms },
        { status: 'PAID', receipt: { status: 'PENDING' } },
      ],
    },
  }
}

export function transferReviewDetail(actor: PayActor, id: string): Promise<TransferReviewDetail> {
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const notice = await tx.payBaleNotice.findUnique({ where: { id }, include: noticeInclude })
    if (!notice || notice.status !== 'ORIGINAL_TRANSFER' || notice.direction !== 'CREDIT' || !notice.amountMinor) throw new PayError('مدرک واریز پیدا نشد', 404)
    const record = notice.transferReview
    const collectionId = record?.collectionId || notice.collectionMatch?.id
    const c = collectionId ? await reviewCollection(tx, actor, collectionId) : null
    let canConfirm = Boolean(notice.sourceType === 'SMS' && c && (!record || record.status === 'OPEN') && ['PENDING','UNDER_REVIEW','EXPIRED','REVIEW'].includes(c.status) && c.invoice.status === 'UNPAID' && c.acceptedAt && notice.receivedAt >= c.createdAt && notice.sourceSentAt >= c.acceptedAt && notice.sourceSentAt >= c.validFrom && c.invoice.userId !== actor.id && c.invoice.payCollection?.merchant.userId !== actor.id)
    if (canConfirm && c) {
      if (c.invoice.payCollection && !c.receiptId) canConfirm = false
      else { try { await collectionSourceActor(tx, c, notice) } catch (error) { if (error instanceof PayError) canConfirm = false; else throw error } }
    }
    const history = await tx.auditLog.findMany({ where: { targetType: 'mobocom-pay', OR: [{ targetId: 'transfer-review:' + id }, ...(c ? [{ targetId: c.id }] : [])] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 })
    return { notice: noticeView(notice), version: record?.version || 0, status: (record?.status || 'OPEN') as TransferReviewDetail['status'], difference: transferDifference(notice.amountMinor, c?.collectedRial ?? null), deltaRial: c ? (notice.amountMinor - c.collectedRial).toString() : null, canConfirm, ...await receiptActions(tx, actor, c),
      collection: c ? { id: c.id, invoiceNumber: c.invoice.number, status: c.status, invoiceStatus: c.invoice.status, totalRial: c.collectedRial.toString(), principalRial: c.principalRial.toString(), expiresAt: c.expiresAt.toISOString(), reason: c.reviewReason, receipt: c.receipt ? { id: c.receipt.id, status: c.receipt.status, amountRial: c.receiptAmountRial!.toString(), imageUrl: c.invoice.payCollection ? `/api/pay/receipt-image/${c.receipt.id}` : `/api/receipts/${c.receipt.id}/image`, note: c.receipt.adminNote } : null } : null,
      history: history.map(h => { let note = ''; try { const meta = JSON.parse(h.metadata); if (typeof meta.note === 'string') note = meta.note } catch {} return { id: h.id, actorId: h.actorUserId, action: h.action, note, createdAt: h.createdAt.toISOString() } }) }
  })
}

/** Exact invoice-number search, never nearest-amount attribution. */
export function transferReviewSearch(actor: PayActor, noticeId: string, number: string) {
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    if (!number.trim() || number.length > 160) throw new PayError('شمارهٔ دقیق فاکتور لازم است', 422)
    const notice = await tx.payBaleNotice.findUnique({ where: { id: noticeId } })
    if (!notice || notice.status !== 'ORIGINAL_TRANSFER' || notice.direction !== 'CREDIT') throw new PayError('مدرک پیدا نشد', 404)
    const rows = await tx.payBaleCollection.findMany({ where: { bankAccountId: notice.bankAccountId, invoice: { number: number.trim() } }, orderBy: { createdAt: 'desc' }, take: 25 })
    const items = []
    for (const row of rows) { const c = await reviewCollection(tx, actor, row.id); items.push({ id: c.id, invoiceNumber: c.invoice.number, totalRial: c.collectedRial.toString(), status: c.status }) }
    return { items }
  })
}

/** A receipt hold can be reviewed even when no bank notice has arrived. */
export function transferCollectionReview(actor: PayActor, id: string): Promise<TransferReviewDetail> {
  return payTransaction(async tx => {
    await payContext(actor, tx, 'mobocom-pay.manage')
    const c = await reviewCollection(tx, actor, id)
    const notice = c.noticeId ? await tx.payBaleNotice.findUnique({ where: { id: c.noticeId }, include: { transferReview: true } }) : null
    const candidate = !notice ? await receiptNoticeCandidate(tx, c) : null
    const evidence = notice ?? candidate
    const history = await tx.auditLog.findMany({
      where: { targetType: 'mobocom-pay', targetId: { in: [c.id, ...(notice ? ['transfer-review:' + notice.id] : [])] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50,
    })
    return { notice: evidence && noticeView(evidence, Boolean(candidate)), version: notice?.transferReview?.version ?? 0, status: (notice?.transferReview?.status || 'OPEN') as TransferReviewDetail['status'], difference: evidence?.amountMinor == null ? 'UNASSIGNED' : transferDifference(evidence.amountMinor, c.collectedRial), deltaRial: evidence?.amountMinor == null ? null : (evidence.amountMinor - c.collectedRial).toString(), canConfirm: false, ...await receiptActions(tx, actor, c),
      collection: { id: c.id, invoiceNumber: c.invoice.number, status: c.status, invoiceStatus: c.invoice.status, totalRial: c.collectedRial.toString(), principalRial: c.principalRial.toString(), expiresAt: c.expiresAt.toISOString(), reason: c.reviewReason, receipt: c.receipt ? { id: c.receipt.id, status: c.receipt.status, amountRial: c.receiptAmountRial!.toString(), imageUrl: c.invoice.payCollection ? `/api/pay/receipt-image/${c.receipt.id}` : `/api/receipts/${c.receipt.id}/image`, note: c.receipt.adminNote } : null },
      history: history.map(h => {
        let note = ''
        try { const meta = JSON.parse(h.metadata); if (typeof meta.note === 'string') note = meta.note } catch {}
        return { id: h.id, actorId: h.actorUserId, action: h.action, note, createdAt: h.createdAt.toISOString() }
      }) }
  })
}
