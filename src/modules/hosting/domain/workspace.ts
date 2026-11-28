export type CloudFinancialRow = { orderId: number; orderStatus: string; number: string; status: string; title: string; totalMinor: string; currency: string; issuedAt: string; paidAt: string | null; dueAt: string | null }
export type CloudFinancialPage = { items: CloudFinancialRow[]; nextCursor: number | null; hasMore: boolean }
export type CloudActivity = { id: string; label: string; kind: string; status: string; at: string; href: string }
export type RenewalInvoice = { number: string; status: 'UNPAID' | 'PAID' }
export type CloudServiceRenewal = { id: number; label: string; dueAt: string; overdue: boolean; status: string; renewable: boolean; invoice: RenewalInvoice | null }
export type CloudWorkspaceOverview = {
  recentInvoices: CloudFinancialRow[]
  financialHasMore: boolean
  activity: CloudActivity[]
  renewals: CloudServiceRenewal[]
  renewalsTotal: number
}
