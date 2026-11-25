import type { PayRailId, PaySettlementView, PayAssetBalance } from './pay'

export interface PaySettlementDestinationView { id: string; label: string; railId: PayRailId; asset: string; network: string; destination: string; active: boolean; version: number; createdAt: string }
export interface PaySettlementCenter { destinations: PaySettlementDestinationView[]; balances: PayAssetBalance[]; approvalThresholdRial: string; maxScheduleDays: number }
export interface PaySettlementQueue { items: (PaySettlementView & { merchantName: string })[]; page: number; pages: number; total: number; counts: { due: number; scheduled: number; secondApproval: number; approved: number }; approvalThresholdRial: string }
export interface PaySettlementBatchResult { items: { id: string; ok: boolean; status?: string; code?: string; message: string }[] }
export const MAX_SETTLEMENT_SCHEDULE_DAYS = 30
export const MAX_SETTLEMENT_BATCH = 25
