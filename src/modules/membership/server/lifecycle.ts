import { db } from '@/platform/database/prisma'
import { getModuleSettings, isModuleEnabled } from '@/extensions/server/modules'
import { logEvent } from '@/platform/observability/logger'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { MembershipError, isLifetime, parseReminderDays, reminderDue } from '@/modules/membership/domain/plans'
import { grantMembership } from '@/modules/membership/server/membership'
import { membershipQuote, planWithTier } from '@/modules/membership/server/quote'
import { tierStanding } from '@/modules/membership/server/tiers'
import { memberExtras, openApplication } from '@/modules/membership/server/extras'

const DAY = 86_400_000
const ACCOUNT = '/vip/account'

const lastEnd = async (userId: number, now: Date) => (await db.userMembership.findFirst({ where: { userId, revokedAt: null, endsAt: { gt: now } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true, planId: true } }))

/** Renewal from the wallet on or off. Choosing a plan picks what renews; without one, the plan held now. */
export async function setAutoRenew(userId: number, on: boolean, planId?: number | null) {
  const held = await lastEnd(userId, new Date())
  if (on && !held) throw new MembershipError('اشتراک فعالی ندارید', 409, 'NO_MEMBERSHIP')
  const renewPlanId = planId || held?.planId || null
  if (on && !renewPlanId) throw new MembershipError('این اشتراک به پلنی وصل نیست؛ یک پلن انتخاب کنید', 409, 'NO_PLAN')
  const data = { autoRenew: on, renewPlanId, renewError: '', ...(on ? { cancelledAt: null, cancelReason: '' } : {}) }
  return db.membershipAccount.upsert({ where: { userId }, create: { userId, ...data }, update: data })
}

/** The member keeps what they paid for until its end; nothing renews after it. */
export async function cancelMembership(userId: number, reason: unknown) {
  if (!await lastEnd(userId, new Date())) throw new MembershipError('اشتراک فعالی ندارید', 409, 'NO_MEMBERSHIP')
  const data = { autoRenew: false, cancelledAt: new Date(), cancelReason: String(reason ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300) }
  return db.membershipAccount.upsert({ where: { userId }, create: { userId, ...data }, update: data })
}

export const resumeMembership = (userId: number) => db.membershipAccount.updateMany({ where: { userId }, data: { cancelledAt: null, cancelReason: '' } })

/** A trial that costs nothing has no order. Its dedupe key refuses a second claim however the requests race. */
export async function startFreeTrial(userId: number, planId: number) {
  const plan = await planWithTier(planId)
  if (!plan || !plan.active) throw new MembershipError('پلن پیدا نشد', 404, 'MEMBERSHIP_PLAN_NOT_FOUND')
  const quote = await membershipQuote(plan, userId, { trial: true })
  if (quote.amountMinor > 0n) throw new MembershipError('این دورهٔ آزمایشی رایگان نیست', 409, 'TRIAL_IS_PAID')
  if (plan.requiresApproval) { await openApplication({ userId, planId: plan.id, orderId: null }); return { ok: true as const, id: 0, endsAt: new Date(), created: false } }
  const key = `trial:${userId}:${plan.tierId ? `t${plan.tierId}` : `p${plan.id}`}`
  const granted = await grantMembership({ userId, days: plan.trialDays, source: 'PURCHASE', kind: 'TRIAL', planId: plan.id, dedupeKey: key, period: { startsAt: new Date(), endsAt: new Date(Date.now() + plan.trialDays * DAY) } })
  if (!granted.created) throw new MembershipError('دورهٔ آزمایشی این سطح را قبلاً استفاده کرده‌اید', 409, 'TRIAL_USED')
  return granted
}

async function notice(userId: number, key: string, titleFa: string, bodyFa: string, titleEn: string, bodyEn: string, href = ACCOUNT) {
  const before = await db.userNotification.count({ where: { dedupeKey: key } })
  await createInboxEvent({ userId, kind: 'MEMBERSHIP', dedupeKey: key, titleFa, titleEn, bodyFa, bodyEn, href })
  return before ? 0 : 1
}

/** One wallet charge per period end: the key makes a repeated run find the same order instead of a new one. */
async function renewFromWallet(userId: number, planId: number, endsAt: Date) {
  const plan = await planWithTier(planId)
  const stamp = endsAt.toISOString()
  const failed = async (error: string) => {
    await db.membershipAccount.update({ where: { userId }, data: { renewError: error.slice(0, 200) } })
    await notice(userId, `membership:renew-failed:${userId}:${stamp}`, 'تمدید خودکار انجام نشد', `${error} می‌توانید پیش از پایان اشتراک، دستی تمدید کنید.`, 'Auto-renewal did not go through', 'Renew by hand before your membership ends.')
    return false
  }
  if (!plan || !plan.active || plan.billing !== 'DAYS') return failed('پلن تمدید دیگر فروخته نمی‌شود.')
  const { executeCheckout } = await import('@/modules/checkout/server/checkout')
  const { getSettings } = await import('@/modules/settings/server')
  const outcome = await executeCheckout({ userId, membershipPlanId: plan.id, payWith: 'wallet', idempotencyKey: `vip-renew-${userId}-${endsAt.getTime()}`, siteUrl: (await getSettings()).siteUrl || process.env.NEXTAUTH_URL || '' })
  if (!outcome.ok) return failed(outcome.code === 'INSUFFICIENT_FUNDS' ? 'موجودی کیف پول کافی نبود.' : outcome.message)
  await db.membershipAccount.update({ where: { userId }, data: { renewError: '' } })
  return true
}

/** Scheduled step: reminders before the end, the wallet renewal, the notice at the end and the invitation back. Every step repeats safely. */
export async function runMembershipLifecycle(now = new Date()) {
  const counters = { checked: 0, reminded: 0, renewed: 0, ended: 0, invited: 0, failed: 0 }
  if (!await isModuleEnabled('membership')) return counters
  const settings = await getModuleSettings('membership').catch(() => ({} as Record<string, unknown>))
  const days = parseReminderDays(settings['reminder-days'] ?? '7,3,1')
  const winback = Math.max(0, Math.trunc(Number(settings['winback-days'] ?? 14)) || 0)
  const window = new Date(now.getTime() - (winback + 2) * DAY)
  const rows = await db.userMembership.groupBy({ by: ['userId'], where: { revokedAt: null, endsAt: { gt: window }, source: { not: 'TEAM' } }, _max: { endsAt: true } })
  const accounts = new Map((await db.membershipAccount.findMany({ where: { userId: { in: rows.map((row) => row.userId) } } })).map((row) => [row.userId, row]))
  for (const row of rows) {
    const endsAt = row._max.endsAt
    if (!endsAt || isLifetime(endsAt)) continue
    counters.checked++
    const account = accounts.get(row.userId)
    const stamp = endsAt.toISOString(), left = endsAt.getTime() - now.getTime()
    try {
      if (left > 0) {
        if (account?.autoRenew && !account.cancelledAt && account.renewPlanId && settings['auto-renew'] !== false && left <= DAY) {
          if (await renewFromWallet(row.userId, account.renewPlanId, endsAt)) counters.renewed++
          continue
        }
        const due = reminderDue(endsAt, now, days)
        if (due && !account?.cancelledAt) counters.reminded += await notice(row.userId, `membership:expiring:${row.userId}:${due}:${stamp}`, 'اشتراک ویژهٔ شما رو به پایان است', `${Math.ceil(left / DAY).toLocaleString('fa-IR')} روز تا پایان اشتراک باقی مانده است.${account?.autoRenew ? ' از کیف پول تمدید می‌شود؛ موجودی را بررسی کنید.' : ''}`, 'Your VIP membership is ending', `${Math.ceil(left / DAY)} day(s) left.`)
        continue
      }
      if (left > -2 * DAY) counters.ended += await notice(row.userId, `membership:expired:${row.userId}:${stamp}`, 'اشتراک ویژهٔ شما تمام شد', 'برای ادامهٔ دسترسی، اشتراک را تمدید کنید.', 'Your VIP membership has ended', 'Renew to keep your access.', '/vip')
      else if (winback && left <= -winback * DAY) counters.invited += await notice(row.userId, `membership:winback:${row.userId}:${stamp}`, 'جایتان در اعضای ویژه خالی است', 'هر وقت خواستید می‌توانید اشتراک ویژه را دوباره فعال کنید.', 'We miss you', 'Your VIP membership is one step away.', '/vip')
    } catch (error) {
      counters.failed++
      logEvent('error', 'membership.lifecycle_failed', { userId: row.userId, error: String(error) })
    }
  }
  return counters
}

/** The member's own page: where they stand, their choices and their history. */
export async function memberOverview(userId: number, now = new Date()) {
  const [standing, account, periods, plans] = await Promise.all([
    tierStanding(userId, now),
    db.membershipAccount.findUnique({ where: { userId } }),
    db.userMembership.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 40 }),
    db.membershipPlan.findMany({ where: { active: true, billing: 'DAYS' }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, name: true, days: true } }),
  ])
  const orderIds = periods.flatMap((period) => (period.orderId ? [period.orderId] : []))
  const [names, invoices, balance] = await Promise.all([
    db.membershipPlan.findMany({ where: { id: { in: periods.flatMap((period) => (period.planId ? [period.planId] : [])) } }, select: { id: true, name: true } }),
    orderIds.length ? db.invoice.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, number: true } }) : [],
    db.userMembership.findFirst({ where: { userId, revokedAt: null, endsAt: { gt: now } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true } }),
  ])
  const planName = new Map(names.map((row) => [row.id, row.name]))
  const invoiceOf = new Map(invoices.map((row) => [row.orderId, row.number]))
  return {
    ...(await memberExtras(userId)), standing, endsAt: balance?.endsAt ?? null, lifetime: isLifetime(balance?.endsAt), plans,
    account: { autoRenew: account?.autoRenew ?? false, renewPlanId: account?.renewPlanId ?? null, cancelled: !!account?.cancelledAt, renewError: account?.renewError ?? '' },
    history: periods.map((period) => ({ id: period.id, plan: (period.planId && planName.get(period.planId)) || 'اشتراک ویژه', kind: period.kind, source: period.source, startsAt: period.startsAt, endsAt: period.endsAt, revoked: !!period.revokedAt, invoice: period.orderId ? invoiceOf.get(period.orderId) ?? null : null })),
  }
}
