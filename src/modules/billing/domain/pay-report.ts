export type PayReportDay = {
  date: string
  paidCount: number
  receivedRial: string
  platformFeeRial: string
  bankServiceFeeRial: string
  roundingRial: string
  netRial: string
  creditedRial: string
  creditedUsdt: string
}

export type PayReportSettlement = {
  currency: 'IRR' | 'USDT'
  status: 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED'
  count: number
  sourceAmount: string
}

export type PayFinancialReport = {
  from: string
  to: string
  totals: Omit<PayReportDay, 'date'>
  days: PayReportDay[]
  settlements: PayReportSettlement[]
  terminalId: string | null
  closing: { currency: 'IRR' | 'USDT'; credited: string; paid: string; difference: string }[]
}
