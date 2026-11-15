/** Customer-safe repair work projections. Estimates are consent snapshots, never invoices. */
export type RepairDecision = 'APPROVED' | 'REJECTED'
export type RepairEstimateView = { id: number; version: number; amountMinor: string; currency: 'IRT'; description: string; status: 'PENDING' | RepairDecision; createdAt: string; expiresAt: string; decidedAt: string | null; supersededAt: string | null }
export type RepairEventView = { id: number; kind: string; label: string; detail: string; createdAt: string }
export type RepairWorkView = { revision: number; dueAt: string | null; overdue: boolean; estimate: RepairEstimateView | null; history: RepairEventView[]; historyTruncated: boolean; canEdit?: boolean }
export type CustomerRepairWorkView = Omit<RepairWorkView, 'revision' | 'canEdit'>
export const customerRepairWork = ({ dueAt, overdue, estimate, history, historyTruncated }: RepairWorkView): CustomerRepairWorkView => ({ dueAt, overdue, estimate, history, historyTruncated })
