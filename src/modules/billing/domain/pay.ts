/** MoboComPay wire contract v1. Money crosses HTTP as exact decimal strings. */
export type PayMerchantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'
export type PayPaymentStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'UNDER_REVIEW'
export type PaySettlementStatus = 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED'
export type PayRailId = 'IRR_BANK' | 'TRX_TRON' | 'USDT_TRON' | 'USDT_BSC' | 'USDT_ETHEREUM'
export type PayCreditCurrency = 'IRR' | 'USDT'
export interface PayConfirmation {
  method: 'NONE' | 'AUTO' | 'MANUAL' | 'BANK' | 'PROVIDER'
  source: '' | 'SMS' | 'BALE' | 'BANK' | 'STAFF' | 'PROVIDER'
}
export interface PayReceiptReview {
  status: string; alreadyPaid: boolean; confirmation: PayConfirmation; message: string
}
export interface PaySettlementFees { currency: PayCreditCurrency; bps: number; flat: string; cap: string }
export interface PayPurchase {
  currency: 'USDT'; amount: string; convertedRial: string; rateRial: string; rateAt: string; roundingRial: string;
  beneficiaryName: string; termsHash: string; disclosure: 'MERCHANT_USDT_V1'; accepted: boolean;
}
export interface PayAssetBalance {
  currency: PayCreditCurrency; availableAmount: string; availableMinor: string; reservedAmount: string;
  equivalentRial: string | null; rateAt: string | null; rateStatus: 'CURRENT' | 'STALE' | 'UNAVAILABLE';
}
export type PayFeeBearer = 'MERCHANT' | 'CUSTOMER'
export type PayChannelType = 'WEBSITE' | 'BOT' | 'INSTAGRAM' | 'CHANNEL' | 'PAYMENT_LINK' | 'OTHER'
export interface PayFeeTerms { feeBearer: PayFeeBearer; feeBps: number; flatFeeRial: string; feeCapRial: string; inherited?: boolean; customerFeeShareBps?: number }
export interface PayRail {
  fees?: PaySettlementFees
  instrument?: string
  id: PayRailId
  asset: string
  network: string
  decimals: number
  enabled: boolean
  rialPerUnit: string
  feeRial: string
}
export interface PaySettings {
  settlementApprovalThresholdRial: string
  usdtRateMaxAgeMinutes: number
  bale: import('./pay-bale-collection').BaleCollectionPolicy
  incomingEnabled: boolean
  bankAccountIds: number[]
  providerId: string
  feeBps: number
  flatFeeRial: string
  feeCapRial: string
  minPaymentRial: string
  maxPaymentRial: string
  minSettlementRial: string
  paymentMinutes: number
  rails: PayRail[]
}
export interface PayMerchantView {
  creditCurrency: PayCreditCurrency
  baleAllowed: boolean
  id: string
  userId: number
  name: string
  website: string
  status: PayMerchantStatus
  proceedsRial: string
  createdAt: string
  fees: PayFeeTerms
}
export interface PayTerminalView {
  channelType: PayChannelType
  channelUrl: string
  baleEnabled: boolean
  id: string
  name: string
  returnUrl: string
  active: boolean
  createdAt: string
}
export interface PayPaymentView {
  requestedGatewayRef?: string
  /** Present only in the authorized Admin payment projection. */
  receiptIds?: number[]
  botResult?: { status: import('./pay-bot').BotDeliveryStatus; attempts: number; updatedAt: string }
  reviewStatus?: 'UNDER_REVIEW'
  confirmation?: PayConfirmation
  settledServiceFeeRial?: string
  platformFeeRial?: string
  creditRial?: string
  customerAmountRial?: string
  creditCurrency?: PayCreditCurrency
  creditAmount?: string
  gatewayAdjustmentRial?: string
  gatewayCollectedRial?: string
  gatewayCollectionStatus?: string
  id: string
  externalId: string
  terminalId: string
  terminalName: string
  amountRial: string
  feeRial: string
  netRial: string
  totalRial: string
  feeBearer: PayFeeBearer
  customerFeeRial?: string
  merchantFeeRial?: string
  status: PayPaymentStatus
  transferReference: string
  createdAt: string
  paidAt: string | null
  expiresAt: string
  checkoutUrl: string
}
export interface PaySettlementView {
  version?: number
  scheduledFor?: string | null
  destinationLabel?: string
  requiresSecondApproval?: boolean
  approvalThresholdRial?: string
  approvedById?: number | null
  firstApprovedAt?: string | null
  secondApprovedById?: number | null
  secondApprovedAt?: string | null
  sourceCurrency?: PayCreditCurrency
  sourceAmount?: string
  feeCurrency?: PayCreditCurrency
  feeAmount?: string
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
  sourceCurrency?: PayCreditCurrency
  sourceAmount?: string
  feeCurrency?: PayCreditCurrency
  feeAmount?: string
  instrument?: string
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
  assetBalances?: PayAssetBalance[]
  merchant: PayMerchantView | null
  terminals: PayTerminalView[]
  rails: Pick<PayRail, 'id' | 'asset' | 'network' | 'enabled'>[]
  stats: {
    creditedRial?: string
    platformFeeRial?: string
    serviceFeeRial?: string
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
  purchase?: PayPurchase
  botDelivery?: { status: string }
  id: string
  merchantName: string
  terminalName: string
  externalId: string
  amountRial: string
  totalRial: string
  feeRial: string
  feeBearer: PayFeeBearer
  customerFeeRial?: string
  merchantFeeRial?: string
  verification: { verified: boolean; phoneLast4: string }
  gateways: { ref: string; id: number | null; name: string; provider: string; manual: boolean; isDefault: boolean; automatic?: boolean }[]
  selectedGateway: { gatewayRef: string; provider: string; manual: boolean; paymentUrl: string; status: string; instructions: string } | null
  receipt: { id: number; status: string; adminNote: string; createdAt: string } | null
  status: PayPaymentStatus
  expiresAt: string
  transferReference: string
  returnUrl: string
  bank: { title: string; bankName: string; holderName: string; cardNumber: string; iban: string } | null
}
export interface PayReceiptView {
  reportedRial?: string
  paymentStatus?: PayPaymentStatus; confirmation?: PayConfirmation; feeRial?: string; netRial?: string;
  creditAmount?: string; creditCurrency?: PayCreditCurrency; platformFeeRial?: string
  id: number; paymentId: string; merchantName: string; externalId: string; totalRial: string;
  status: string; trackingCode: string; payerName: string; phoneLast4: string; adminNote: string; createdAt: string
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
  workQueue: { requestedSettlements: number; approvedSettlements: number; pendingMerchants: number; pendingReceipts: number }
  permissions: { manage: boolean; settle: boolean }
  merchants: PayMerchantView[]
  payments: PayPaymentView[]
  settlements: (PaySettlementView & { merchantName: string })[]
  bankEvents: PayBankEventView[]
  bankAccounts: { id: number; title: string; bankName: string; cardNumber: string; active: boolean; collectionUse: string }[]
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
