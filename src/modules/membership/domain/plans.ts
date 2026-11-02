// How a VIP plan is priced and what period it gives. Pure.
import { extendMembership } from '@/modules/membership/domain/membership'

/** A lifetime period ends here: far enough never to arrive, and still an ordinary date for every query. */
export const LIFETIME_END = new Date('2099-12-31T00:00:00.000Z')
export const isLifetime = (endsAt: Date | string | null | undefined) => !!endsAt && new Date(endsAt).getTime() >= LIFETIME_END.getTime()

export const PLAN_BILLING = ['DAYS', 'LIFETIME', 'FIXED'] as const
export const normalizeBilling = (value: unknown) => (PLAN_BILLING as readonly unknown[]).includes(value) ? value as (typeof PLAN_BILLING)[number] : 'DAYS'

export class MembershipError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'MEMBERSHIP') { super(message) }
}

export type BillablePlan = {
  days: number; billing: string; fixedEndsAt: Date | null; priceMinor: bigint; signupFeeMinor: bigint
  trialDays: number; trialPriceMinor: bigint; payWhatYouWant: boolean; minPriceMinor: bigint
}

/** The period a plan gives. A paid period queues after the current one unless it starts afresh (an upgrade). */
export function planPeriod(plan: Pick<BillablePlan, 'days' | 'billing' | 'fixedEndsAt' | 'trialDays'>, currentEnd: Date | null | undefined, now: Date, options: { trial?: boolean; fresh?: boolean } = {}) {
  if (options.trial) return { startsAt: now, endsAt: new Date(now.getTime() + Math.max(1, plan.trialDays) * 86_400_000) }
  if (plan.billing === 'LIFETIME') return { startsAt: now, endsAt: LIFETIME_END }
  if (plan.billing === 'FIXED' && plan.fixedEndsAt) return { startsAt: now, endsAt: plan.fixedEndsAt }
  return extendMembership(options.fresh ? null : currentEnd, plan.days, now)
}

/** What a purchase costs. `valueMinor` buys the period; the fee is on top and is never credited back. */
export function planCharge(plan: BillablePlan, input: { trial: boolean; firstPurchase: boolean; offeredMinor?: bigint | null }) {
  const feeMinor = input.firstPurchase ? plan.signupFeeMinor : 0n
  let valueMinor = plan.priceMinor
  if (input.trial) valueMinor = plan.trialPriceMinor
  else if (plan.payWhatYouWant && input.offeredMinor != null) {
    if (input.offeredMinor < plan.minPriceMinor) throw new MembershipError('مبلغ پیشنهادی از حداقل این پلن کمتر است', 400, 'OFFER_TOO_LOW')
    valueMinor = input.offeredMinor
  }
  return { valueMinor, feeMinor, amountMinor: valueMinor + feeMinor }
}

export type PaidPeriod = { id: number; kind: string; startsAt: Date; endsAt: Date; revokedAt: Date | null; amountMinor: bigint; currency: string }

/** The unused share of what was paid for periods still to run, and the periods it came from. */
export function prorationCredit(periods: readonly PaidPeriod[], now: Date, currency: string) {
  let creditMinor = 0n
  const ids: number[] = []
  for (const period of periods) {
    if (period.revokedAt || period.kind !== 'PERIOD' || period.amountMinor <= 0n || period.currency !== currency || period.endsAt <= now) continue
    const total = BigInt(period.endsAt.getTime() - period.startsAt.getTime())
    const left = BigInt(period.endsAt.getTime() - Math.max(now.getTime(), period.startsAt.getTime()))
    if (total <= 0n) continue
    creditMinor += (period.amountMinor * left) / total
    ids.push(period.id)
  }
  return { creditMinor, ids }
}

/** When the member's unbroken run of periods began: what a drip rule counts from. */
export function chainStart(periods: readonly Pick<PaidPeriod, 'startsAt' | 'endsAt' | 'revokedAt'>[], now: Date) {
  const valid = periods.filter((period) => !period.revokedAt)
  const current = valid.filter((period) => period.startsAt <= now && period.endsAt > now).sort((a, b) => +a.startsAt - +b.startsAt)[0]
  if (!current) return null
  let start = current.startsAt
  for (let moved = true; moved;) {
    moved = false
    for (const period of valid) if (period.startsAt < start && period.endsAt >= start) { start = period.startsAt; moved = true }
  }
  return start
}

/** Which of the owner's reminder days has come for a period ending then: the nearest not yet passed, or null. */
export function reminderDue(endsAt: Date, now: Date, days: readonly number[]) {
  const left = Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000)
  if (left <= 0) return null
  const due = days.filter((day) => left <= day).sort((a, b) => a - b)[0]
  return due ?? null
}

export const parseReminderDays = (value: unknown) => [...new Set(String(value ?? '').split(/[,،\s]+/).map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 90))].sort((a, b) => b - a).slice(0, 6)

export type TierInput = { name: string; tagline: string; color: string; rank: number; storeDiscountPercent: number; freeShipping: boolean; hideAds: boolean; active: boolean }

export function normalizeTier(raw: Record<string, unknown>): TierInput {
  const line = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)
  const name = line(raw.name, 60)
  if (name.length < 2) throw new MembershipError('نام سطح را بنویسید')
  const rank = Number(raw.rank), percent = Number(raw.storeDiscountPercent ?? 0)
  if (!Number.isInteger(rank) || rank < 1 || rank > 99) throw new MembershipError('رتبهٔ سطح باید عدد صحیح بین ۱ تا ۹۹ باشد')
  if (!Number.isInteger(percent) || percent < 0 || percent > 90) throw new MembershipError('تخفیف فروشگاه باید عدد صحیح بین ۰ تا ۹۰ درصد باشد')
  return { name, tagline: line(raw.tagline, 160), color: /^#[0-9a-f]{6}$/i.test(String(raw.color)) ? String(raw.color).toLowerCase() : '#b45309', rank, storeDiscountPercent: percent, freeShipping: raw.freeShipping === true, hideAds: raw.hideAds === true, active: raw.active !== false }
}

/** Where a member stands, for the admin's filters. */
export function memberState(input: { endsAt: Date | null; active: boolean; trial: boolean; cancelled: boolean }, now: Date, soonDays = 7) {
  if (!input.active || !input.endsAt) return 'LAPSED'
  if (input.trial) return 'TRIAL'
  if (input.cancelled) return 'CANCELLED'
  return input.endsAt.getTime() - now.getTime() <= soonDays * 86_400_000 ? 'EXPIRING' : 'ACTIVE'
}
