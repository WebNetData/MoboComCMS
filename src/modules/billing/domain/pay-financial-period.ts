import type { PayFinancialReport } from './pay-report'

export type PayPeriodAction = 'SUBMIT' | 'ASSIGN' | 'REVIEW' | 'CLOSE' | 'CORRECT'

export type PayPeriodView = {
  reviewers: { id: number; name: string | null }[]
  recent: { fromDay: string; toDay: string; status: string }[]
  period: null | {
    status: string
    version: number
    reviewerId: number
    discrepancyNote: string
    snapshot: PayFinancialReport
    history: { version: number; actorId: number; reviewerId: number; action: string; note: string; createdAt: string }[]
  }
  selectedSnapshot?: PayFinancialReport
}
