/** Same-process Admin contract. Amounts are integer Rial strings; never client money decisions. */
export type TransferMonitor = {
  asOf: string
  windowHours: number
  receiptBacklog: { count: number; olderThanMinutes: number; oldestAt: string | null }
  sources: { id: string; label: string; type: 'SMS' | 'BALE'; ready: boolean; observed: boolean; lastReceivedAt: string | null; notices: number; rejected: number; p95DeliveryMs: number | null }[]
  totals: { received: number; paid: number; awaitingReview: number; overdue: number; oldestReviewAt: string | null; p50ConfirmationMs: number | null; p95ConfirmationMs: number | null }
  pools: { principalRial: string; capacity: number; occupied: number; remaining: number; state: 'AVAILABLE' | 'LOW' | 'EXHAUSTED' }[]
}
export type TransferReviewState = 'OPEN' | 'DISMISSED' | 'CONFIRMED'
export type TransferDifference = 'UNASSIGNED' | 'EXACT' | 'UNDER' | 'OVER'
export function transferDifference(actual: bigint, expected: bigint | null): TransferDifference {
  return expected === null ? 'UNASSIGNED' : actual === expected ? 'EXACT' : actual < expected ? 'UNDER' : 'OVER'
}
export type TransferReviewDetail = {
  notice: { id: string; source: string; amountRial: string; receivedAt: string; sourceSentAt: string; timeBasis?: 'SERVER_RECEIPT' | 'PHONE_RECEIPT' | 'SOURCE_MESSAGE' } | null
  version: number
  status: TransferReviewState
  difference: TransferDifference
  deltaRial: string | null
  collection: null | { id: string; invoiceNumber: string; status: string; invoiceStatus: string; totalRial: string; principalRial: string; expiresAt: string; reason: string; receipt: null | { id: number; status: string; amountRial: string; imageUrl: string; note: string } }
  canConfirm: boolean
  canReviewReceipt: boolean
  canRejectReceipt: boolean
  requiresTrackingCode: boolean
  history: { id: number; actorId: number; action: string; note: string; createdAt: string }[]
}
export type TransferReviewQueue = {
  page: number; pages: number; total: number
  receiptsPage: number; receiptsPages: number; receiptsTotal: number
  items: { id: string; source: string; amountRial: string; receivedAt: string; invoiceNumber: string | null; status: TransferReviewState; reason: string }[]
  receipts: { id: string; invoiceNumber: string; status: string; reason: string; receiptId: number | null; createdAt: string }[]
}
