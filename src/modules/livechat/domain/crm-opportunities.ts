import { currencyExponent, toMinor } from '@/shared/money'
import { latinDigits } from '@/shared/text/digits'
import { validFollowUpDay, validFollowUpId } from './crm-follow-ups'
import { ChatError } from './livechat'

export const OPPORTUNITY_STAGE = {
  NEW: 'جدید', QUALIFIED: 'در بررسی', PROPOSAL: 'پیشنهاد ارسال‌شده', WON: 'موفق', LOST: 'از دست‌رفته',
} as const
export type OpportunityStage = keyof typeof OPPORTUNITY_STAGE
export const OPPORTUNITY_STAGES = Object.keys(OPPORTUNITY_STAGE) as OpportunityStage[]
export const OPEN_OPPORTUNITY_STAGES = ['NEW', 'QUALIFIED', 'PROPOSAL']
export const isOpportunityStage = (stage: unknown): stage is OpportunityStage =>
  typeof stage === 'string' && Object.hasOwn(OPPORTUNITY_STAGE, stage)
export const isClosedOpportunity = (stage: string) => stage === 'WON' || stage === 'LOST'

export type OpportunitySource = { type: 'FORM' | 'TICKET'; id: number }
export function opportunitySource(type: unknown, id: unknown): OpportunitySource {
  if ((type !== 'FORM' && type !== 'TICKET') || !validFollowUpId(id)) throw new ChatError('منبع فرصت معتبر نیست')
  return { type, id }
}

export function opportunityTitle(value: unknown) {
  const title = typeof value === 'string' ? value.trim() : ''
  if (!title || title.length > 160 || /[\u0000-\u001f]/.test(title)) throw new ChatError('عنوان فرصت باید بین ۱ تا ۱۶۰ نویسه باشد')
  return title
}

export function opportunityAmount(value: unknown, currency: unknown) {
  if (currency !== 'IRT' && currency !== 'IRR' && currency !== 'USD' && currency !== 'EUR') throw new ChatError('ارز برآورد معتبر نیست')
  const amount = typeof value === 'string' ? latinDigits(value.trim()).replace(/٫/g, '.') : ''
  if (!/^\d{1,14}(?:\.\d{1,2})?$/.test(amount) || (amount.split('.')[1]?.length ?? 0) > currencyExponent(currency)) {
    throw new ChatError('مبلغ یا تعداد اعشار برای ارز انتخابی معتبر نیست')
  }
  return { amountMinor: toMinor(amount, currency), currency }
}

export function opportunityTargetDay(value: unknown) {
  if (value === null) return null
  if (!validFollowUpDay(value)) throw new ChatError('تاریخ هدف معتبر نیست')
  return value
}

type Owner = 'all' | 'mine' | 'unassigned' | number
export type OpportunityFilters = { userId?: number; stage?: OpportunityStage; owner?: Owner; stale?: boolean; page: number }

export function opportunityFilters(params: URLSearchParams): OpportunityFilters {
  const userId = params.has('userId') ? Number(params.get('userId')) : undefined
  const page = params.has('page') ? Number(params.get('page')) : 1
  const stage = params.get('stage') || undefined
  const scope = params.get('owner') || undefined
  const owner = scope === undefined || scope === 'all' || scope === 'mine' || scope === 'unassigned' ? scope : Number(scope)
  if ((userId !== undefined && !validFollowUpId(userId)) || !validFollowUpId(page) || page > 1_000_000 ||
      (stage && !isOpportunityStage(stage)) || (typeof owner === 'number' && !validFollowUpId(owner))) throw new ChatError('فیلتر فرصت فروش معتبر نیست')
  return { userId, stage: stage as OpportunityStage | undefined, owner, stale: params.get('stale') === '1', page }
}
