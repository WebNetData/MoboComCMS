import { currencyScale, minorToDecimal } from '@/shared/money'
import { type OpportunityStage } from '@/modules/livechat/domain/crm-opportunities'

export { OPPORTUNITY_STAGE as STAGES } from '@/modules/livechat/domain/crm-opportunities'
export type Stage = OpportunityStage
export const CURRENCIES = { IRT: 'تومان', IRR: 'ریال', USD: 'دلار', EUR: 'یورو' } as const
export type Currency = keyof typeof CURRENCIES
export type Staff = { id: number; name: string }
export type Opportunity = {
  id: number; userId: number; userName: string; title: string; stage: Stage
  amountMinor: string; currency: Currency; targetDay: string | null
  assigneeId: number | null; assigneeName: string; updatedAt: string; stageChangedAt: string
  closedAt: string | null; version: number; mayEdit: boolean
}
export type Summary = {
  rows: Opportunity[]; staff: Staff[]; canManage: boolean; ownId: number; page: number; pageCount: number
  stats: { counts: Record<Stage, number>; stale: number; successRate: number; wonTotals: { currency: Currency; amountMinor: string }[] }
  commerce?: { opportunities: number; paidOpportunities: number; conversionRate: number; totals: { currency: Currency; estimatedMinor: string; paidMinor: string }[] } | null
}
export type Source = { type: 'FORM' | 'TICKET'; id: number; href: string }
export type Preview = { userId: number | null; userName: string; source: Source }
export type Detail = {
  row: Opportunity; staff: Staff[]; canManage: boolean
  history: { id: number; fromStage: Stage | null; toStage: Stage; actorName: string; reason: string; createdAt: string }[]
  source: Source | null
  followUps: { id: number; title: string; dueDay: string; status: string; assigneeName: string }[]
}

export function formatAmount(minor: string, currency: Currency) {
  try {
    const value = BigInt(minor)
    const scale = currencyScale(currency)
    const whole = (value / scale).toLocaleString('fa-IR')
    const fraction = scale === 100n && value % scale ? `٫${String(value % scale).padStart(2, '0').replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)])}` : ''
    return `${whole}${fraction} ${CURRENCIES[currency] || currency}`
  } catch { return '—' }
}

export function amountInput(minor: string, currency: Currency) {
  try {
    return minorToDecimal(minor, currency)
  } catch { return '' }
}
