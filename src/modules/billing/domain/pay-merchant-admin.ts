import type { PayMerchantView, PayTerminalView } from './pay'
export type MerchantDirectory = { page: number; pages: number; total: number; items: (PayMerchantView & { version: number; email: string; userStatus: string; terminalCount: number })[] }
export type MerchantDetail = {
  assetBalances?: import('./pay').PayAssetBalance[]
  merchant: MerchantDirectory['items'][number]
  terminals: (PayTerminalView & { bot: null | { id: string; active: boolean; version: number; callbackUrl: string } })[]
  stats: { payments: number; paidRial: string; pendingSettlements: number }
  history: { id: number; action: string; note: string; actorId: number; at: string }[]
}
export type MerchantPortalAccess = { status: 'GUEST' | 'DENIED' | 'PENDING' | 'SUSPENDED' | 'ACTIVE'; name: string }
