import type { NextRequest } from 'next/server'
import { businessReviewReports } from '@/modules/community/server/community'
import { businessTransaction } from './commands'
const pageNumber = (value: unknown) => Math.min(10000, Math.max(1, Number.isSafeInteger(Number(value)) ? Number(value) : 1))

export async function businessTrustAdmin(req: NextRequest, input: Record<string, unknown>) {
  const reportPage = pageNumber(input.reportPage), proofPage = pageNumber(input.proofPage)
  const reportStatus = ['OPEN','RESOLVED','DISMISSED'].includes(String(input.reportStatus)) ? String(input.reportStatus) : 'OPEN'
  const proofStatus = ['PENDING','APPROVED','REJECTED','WITHDRAWN'].includes(String(input.proofStatus)) ? String(input.proofStatus) : 'PENDING'
  return businessTransaction(req, true, async tx => {
    const [reports, proofCount, proofs] = await Promise.all([
      businessReviewReports(tx, reportPage, reportStatus),
      tx.businessPurchaseProof.count({ where: { status: proofStatus } }),
      tx.businessPurchaseProof.findMany({ where: { status: proofStatus }, orderBy: { id: 'asc' }, skip: (proofPage - 1) * 20, take: 20, select: { id: true, businessId: true, reviewId: true, status: true, originalName: true, size: true, decisionNote: true, createdAt: true, business: { select: { name: true, slug: true } }, review: { select: { body: true, rating: true, status: true } } } }),
    ])
    return { reports, reportStatus, proofStatus, proofs, proofCount, proofPage, proofPages: Math.max(1, Math.ceil(proofCount / 20)) }
  })
}
