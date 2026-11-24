import type { PayBotDeliveryView } from './pay-bot'
import type { RoutingSnapshot } from './pay-routing'

export interface PayBotOperationView extends PayBotDeliveryView {
  amountRial: string; totalRial: string; createdAt: string; ruleName: string; overdue: boolean; creditMatches: boolean
}
export interface PayBotOperationsPage {
  items: PayBotOperationView[]; page: number; pages: number; total: number
  summary: { queued: number; sending: number; needsReview: number; overdue: number; paidUndelivered: number; creditIssues: number }
}
export interface PayBotOperationDetail {
  operation: PayBotOperationView; routing: RoutingSnapshot | null
  jobs: { id: number; status: string; attempts: number; runAt: string; lockedAt: string | null }[]
  audit: { id: number; action: string; at: string; code?: string; status?: string }[]
}
