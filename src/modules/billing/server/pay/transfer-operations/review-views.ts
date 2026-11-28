import type { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { transferDifference, type TransferReviewDetail, type TransferReviewQueue } from '@/modules/billing/domain/pay-transfer-operations'
import { payContext, payTransaction, type PayActor } from '../context'
import { collectionSourceActor } from '../bale/collection-proof'
import { noticeInclude, reviewCollection } from './review-context'
import { canApproveOwnPayReceipt } from '../receipt-review-access'

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
    await payContext(actor, tx, 'mobocom-pay.manage')
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(params.get('page'))) || 1))
    const closed = params.get('closed') === 'true'
    const receiptsPage = Math.max(1, Math.min(10000, Math.trunc(Number(params.get('receiptsPage'))) || 1))
    const where: Prisma.PayBaleNoticeWhereInput = { status: 'ORIGINAL_TRANSFER', direction: 'CREDIT', ...(closed ? { transferReview: { status: { in: ['CONFIRMED','DISMISSED'] } } } : {
      AND: [{ OR: [{ transferReview: null }, { transferReview: { status: 'OPEN' } }] }, { OR: [{ collectionMatch: null }, { collectionMatch: { status: { not: 'PAID' } } }] }],
    }) }
    const receiptWhere: Prisma.PayBaleCollectionWhereInput = { OR: [{ status: { in: ['UNDER_REVIEW','REVIEW'] } }, { receipt: { status: 'PENDING' } }] }
    const [total, rows, receipts, receiptsTotal] = await Promise.all([
      tx.payBaleNotice.count({ where }),
      tx.payBaleNotice.findMany({ where, include: noticeInclude, orderBy: [{ receivedAt: 'desc' },{ id: 'desc' }], skip: (page - 1) * 25, take: 25 }),
      tx.payBaleCollection.findMany({ where: receiptWhere, include: { invoice: { select: { number: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (receiptsPage - 1) * 25, take: 25 }),
      tx.payBaleCollection.count({ where: receiptWhere }),
    ])
    return { page, pages: Math.max(1, Math.ceil(total / 25)), total, receiptsPage, receiptsPages: Math.max(1, Math.ceil(receiptsTotal / 25)), receiptsTotal, items: rows.map(n => ({ id: n.id, source: n.sourceType, amountRial: n.amountMinor!.toString(), receivedAt: n.receivedAt.toISOString(), invoiceNumber: n.collectionMatch?.invoice.number || null, status: (n.transferReview?.status || 'OPEN') as 'OPEN' | 'DISMISSED' | 'CONFIRMED', reason: n.collectionMatch?.reviewReason || 'UNMATCHED' })),
      receipts: receipts.map(c => ({ id: c.id, invoiceNumber: c.invoice.number, status: c.status, reason: c.reviewReason, receiptId: c.receiptId, createdAt: c.createdAt.toISOString() })) }
  })
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
    return { notice: { id, source: notice.sourceType, amountRial: notice.amountMinor.toString(), receivedAt: notice.receivedAt.toISOString(), sourceSentAt: notice.sourceSentAt.toISOString(), timeBasis: notice.code.startsWith('SMS_FORWARDER_') ? 'SERVER_RECEIPT' : notice.sourceType === 'SMS' ? 'PHONE_RECEIPT' : 'SOURCE_MESSAGE' }, version: record?.version || 0, status: (record?.status || 'OPEN') as TransferReviewDetail['status'], difference: transferDifference(notice.amountMinor, c?.collectedRial ?? null), deltaRial: c ? (notice.amountMinor - c.collectedRial).toString() : null, canConfirm, ...await receiptActions(tx, actor, c),
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
    const history = await tx.auditLog.findMany({ where: { targetType: 'mobocom-pay', targetId: c.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 })
    return { notice: null, version: 0, status: 'OPEN', difference: 'UNASSIGNED', deltaRial: null, canConfirm: false, ...await receiptActions(tx, actor, c),
      collection: { id: c.id, invoiceNumber: c.invoice.number, status: c.status, invoiceStatus: c.invoice.status, totalRial: c.collectedRial.toString(), principalRial: c.principalRial.toString(), expiresAt: c.expiresAt.toISOString(), reason: c.reviewReason, receipt: c.receipt ? { id: c.receipt.id, status: c.receipt.status, amountRial: c.receiptAmountRial!.toString(), imageUrl: c.invoice.payCollection ? `/api/pay/receipt-image/${c.receipt.id}` : `/api/receipts/${c.receipt.id}/image`, note: c.receipt.adminNote } : null },
      history: history.map(h => ({ id: h.id, actorId: h.actorUserId, action: h.action, note: '', createdAt: h.createdAt.toISOString() })) }
  })
}
