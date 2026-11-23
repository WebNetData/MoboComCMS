/** MoboComPay wire contract v1. Money crosses HTTP as exact decimal strings. */
export type PayMerchantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'
export type PayPaymentStatus = 'PENDING' | 'PAID' | 'EXPIRED'
export type PaySettlementStatus = 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED'
export type PayRailId = 'IRR_BANK' | 'TRX_TRON' | 'USDT_TRON'
export interface PayRail {
  id: PayRailId
  asset: string
  network: string
  decimals: number
  enabled: boolean
  rialPerUnit: string
  feeRial: string
}
export interface PaySettings {
  incomingEnabled: boolean
  bankAccountIds: number[]
  providerId: string
  feeBps: number
  flatFeeRial: string
  minPaymentRial: string
  maxPaymentRial: string
  minSettlementRial: string
  paymentMinutes: number
  rails: PayRail[]
}
export interface PayMerchantView {
  id: string
  userId: number
  name: string
  website: string
  status: PayMerchantStatus
  proceedsRial: string
  createdAt: string
}
export interface PayTerminalView {
  id: string
  name: string
  returnUrl: string
  active: boolean
  createdAt: string
}
export interface PayPaymentView {
  id: string
  externalId: string
  terminalId: string
  terminalName: string
  amountRial: string
  feeRial: string
  netRial: string
  status: PayPaymentStatus
  transferReference: string
  createdAt: string
  paidAt: string | null
  expiresAt: string
  checkoutUrl: string
}
export interface PaySettlementView {
  id: string
  amountRial: string
  feeRial: string
  payoutAmount: string
  asset: string
  network: string
  destination: string
  status: PaySettlementStatus
  reference: string
  reason: string
  createdAt: string
  updatedAt: string
}
export interface PayQuoteView {
  id: string
  amountRial: string
  feeRial: string
  payoutAmount: string
  asset: string
  network: string
  railId: PayRailId
  rateRialPerUnit: string
  expiresAt: string
}
export interface PayOverview {
  merchant: PayMerchantView | null
  terminals: PayTerminalView[]
  rails: Pick<PayRail, 'id' | 'asset' | 'network' | 'enabled'>[]
  stats: {
    availableRial: string
    walletRial: string
    proceedsRial: string
    pendingSettlementRial: string
    grossRial: string
    feeRial: string
    netRial: string
    paidCount: number
    pendingCount: number
    trend: { date: string; grossRial: string; count: number }[]
  }
  payments: PayPaymentView[]
  settlements: PaySettlementView[]
  readiness: { incomingEnabled: boolean; bankFeedReady: boolean }
}
export interface PayCheckout {
  id: string
  merchantName: string
  terminalName: string
  externalId: string
  amountRial: string
  status: PayPaymentStatus
  expiresAt: string
  transferReference: string
  returnUrl: string
  bank: { title: string; bankName: string; holderName: string; cardNumber: string; iban: string }
}
export interface PayBankEventView {
  id: string
  providerId: string
  externalId: string
  amountRial: string
  transferReference: string
  status: string
  occurredAt: string
  paymentId: string | null
}
export interface PayAdminOverview {
  permissions: { manage: boolean; settle: boolean }
  merchants: PayMerchantView[]
  payments: PayPaymentView[]
  settlements: (PaySettlementView & { merchantName: string })[]
  bankEvents: PayBankEventView[]
  bankAccounts: { id: number; title: string; bankName: string; cardNumber: string; active: boolean }[]
  settings: PaySettings
  settingsRevision: string
  readiness: { bankFeedReady: boolean; providerId: string }
}
export class PayError extends Error {
  constructor(
    message: string,
    readonly status = 422,
    readonly code = 'PAY_INVALID',
  ) {
    super(message)
  }
}
