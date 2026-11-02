import type { MembershipPlan, MembershipTier } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { normalizeCurrency, toMinor } from '@/shared/money'
import { MembershipError, isLifetime, planCharge, prorationCredit } from '@/modules/membership/domain/plans'
import { tierStanding } from '@/modules/membership/server/tiers'

type Plan = MembershipPlan & { tier: MembershipTier | null }

/** Everything a purchase of this plan means for this member, decided here and frozen on the order. */
export async function membershipQuote(plan: Plan, userId: number, input: { trial?: boolean; offered?: string | null } = {}, now = new Date()) {
  const currency = normalizeCurrency(plan.currency)
  if (plan.billing === 'FIXED' && (!plan.fixedEndsAt || plan.fixedEndsAt <= now)) throw new MembershipError('فروش این دوره تمام شده است', 409, 'PLAN_ENDED')
  const [periods, standing, kin] = await Promise.all([
    db.userMembership.findMany({ where: { userId } }),
    tierStanding(userId, now),
    plan.tierId ? db.membershipPlan.findMany({ where: { tierId: plan.tierId }, select: { id: true } }) : Promise.resolve([{ id: plan.id }]),
  ])
  const running = periods.filter((period) => !period.revokedAt && period.endsAt > now)
  const rank = plan.tier?.rank ?? 1
  const upgrade = !!standing && rank > standing.rank
  if (running.some((period) => isLifetime(period.endsAt)) && !upgrade) throw new MembershipError('اشتراک شما مادام‌العمر است و به تمدید نیاز ندارد', 409, 'ALREADY_LIFETIME')

  if (plan.maxMembers > 0 && !running.some((period) => period.planId === plan.id)) {
    const taken = await db.userMembership.findMany({ where: { planId: plan.id, revokedAt: null, endsAt: { gt: now } }, distinct: ['userId'], select: { userId: true } })
    if (taken.length >= plan.maxMembers) throw new MembershipError('ظرفیت این پلن تکمیل شده است', 409, 'PLAN_FULL')
  }

  const trial = input.trial === true
  if (trial) {
    if (plan.trialDays <= 0) throw new MembershipError('این پلن دورهٔ آزمایشی ندارد', 400, 'NO_TRIAL')
    if (standing) throw new MembershipError('دورهٔ آزمایشی برای کسانی است که اشتراک فعال ندارند', 409, 'TRIAL_FOR_NEW')
    const planIds = kin.map((row) => row.id)
    if (periods.some((period) => period.kind === 'TRIAL' && period.planId && planIds.includes(period.planId))) throw new MembershipError('دورهٔ آزمایشی این سطح را قبلاً استفاده کرده‌اید', 409, 'TRIAL_USED')
  }

  const offered = String(input.offered ?? '').trim()
  const offeredMinor = !trial && plan.payWhatYouWant && offered ? toMinor(offered, currency) : null
  const firstPurchase = !periods.some((period) => period.source === 'PURCHASE' && !period.revokedAt && period.kind === 'PERIOD')
  const charge = planCharge(plan, { trial, firstPurchase, offeredMinor })
  const credit = upgrade ? prorationCredit(periods, now, currency) : { creditMinor: 0n, ids: [] as number[] }
  if (credit.creditMinor > 0n && credit.creditMinor >= charge.amountMinor) throw new MembershipError('اعتبار اشتراک فعلی شما از قیمت این پلن بیشتر است؛ پلن بلندتری انتخاب کنید', 409, 'CREDIT_COVERS_PRICE')
  return {
    currency, trial, upgrade, valueMinor: charge.valueMinor, feeMinor: charge.feeMinor, creditMinor: credit.creditMinor, amountMinor: charge.amountMinor - credit.creditMinor,
    meta: {
      kind: 'membership', membershipPlanId: plan.id, planName: plan.name, days: plan.days, billing: plan.billing, fixedEndsAt: plan.fixedEndsAt?.toISOString() ?? null,
      trial, trialDays: plan.trialDays, feeMinor: charge.feeMinor.toString(), creditMinor: credit.creditMinor.toString(), upgradeFrom: credit.ids,
    },
  }
}

export const planWithTier = (id: number) => db.membershipPlan.findUnique({ where: { id }, include: { tier: true } })
