import { cache } from 'react'
import { getServerSession } from 'next-auth'
import { db } from '@/platform/database/prisma'
import { authOptions } from '@/modules/identity/auth'
import { extendMembership, parsePerks, type Perk } from '@/modules/membership/domain/membership'
import { legacyNumber } from '@/shared/money'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { isModuleEnabled } from '@/extensions/server/modules'
import { logEvent } from '@/platform/observability/logger'
import { groupGivesVip } from '@/modules/account/server/user-groups'
import { isLifetime, planPeriod } from '@/modules/membership/domain/plans'

export type ActiveMembership = { id: number; endsAt: Date; startsAt: Date; source: string; planId: number | null }

/** Latest active (not revoked, not expired) VIP period of a user. */
export async function getActiveMembership(userId: number | null | undefined, now = new Date()): Promise<ActiveMembership | null> {
  if (!userId || !Number.isSafeInteger(userId)) return null
  const row = await db.userMembership.findFirst({
    where: { userId, revokedAt: null, endsAt: { gt: now }, startsAt: { lte: now } },
    orderBy: { endsAt: 'desc' },
    select: { id: true, endsAt: true, startsAt: true, source: true, planId: true },
  }).catch(() => null)
  if (!row) return null
  // Stacked periods: report the furthest end among the chain.
  const last = await db.userMembership.findFirst({ where: { userId, revokedAt: null, endsAt: { gt: now } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true } }).catch(() => null)
  return { ...row, endsAt: last?.endsAt && last.endsAt > row.endsAt ? last.endsAt : row.endsAt }
}

/** Access to members-only things for a known user id (server commands): a member, or anybody while VIP is off. */
export async function opensMembersOnly(userId: number | null | undefined, member?: boolean): Promise<boolean> {
  if (!await isModuleEnabled('membership')) return true
  return member ?? (!!(await getActiveMembership(userId)) || await groupGivesVip(userId))
}

export async function isMember(userId: number | null | undefined): Promise<boolean> {
  if (!await isModuleEnabled('membership')) return false
  return !!(await getActiveMembership(userId)) || await groupGivesVip(userId)
}

/**
 * Adds VIP days. Idempotent per `dedupeKey` (order grants, gifts), and stacks on
 * top of the current membership so renewals never lose remaining days.
 */
export async function grantMembership(input: {
  userId: number
  days: number
  source: 'PURCHASE' | 'GIFT' | 'ADMIN' | 'TEAM'
  kind?: 'PERIOD' | 'TRIAL'
  /** No message to the member, for a bulk import. */
  silent?: boolean
  /** A period worked out by the plan (lifetime, a fixed end, a trial, an upgrade); otherwise `days` stacked on the current end. */
  period?: { startsAt: Date; endsAt: Date }
  amountMinor?: bigint
  currency?: string
  planId?: number | null
  orderId?: number | null
  dedupeKey?: string | null
  note?: string
  createdBy?: number | null
}): Promise<{ ok: true; id: number; endsAt: Date; created: boolean }> {
  if (input.dedupeKey) {
    const existing = await db.userMembership.findUnique({ where: { dedupeKey: input.dedupeKey } })
    if (existing) return { ok: true, id: existing.id, endsAt: existing.endsAt, created: false }
  }
  const current = await db.userMembership.findFirst({ where: { userId: input.userId, revokedAt: null, endsAt: { gt: new Date() } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true } })
  const period = input.period ?? extendMembership(current?.endsAt, input.days)
  try {
    const row = await db.userMembership.create({ data: {
      userId: input.userId,
      planId: input.planId ?? null,
      source: input.source,
      kind: input.kind ?? 'PERIOD',
      amountMinor: input.amountMinor ?? 0n,
      currency: input.currency ?? '',
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      orderId: input.orderId ?? null,
      dedupeKey: input.dedupeKey || null,
      note: String(input.note || '').slice(0, 500),
      createdBy: input.createdBy ?? null,
    } })
    if (!input.silent) await createInboxEvent({
      userId: input.userId,
      kind: 'MEMBERSHIP',
      dedupeKey: `membership:${row.id}`,
      titleFa: input.source === 'GIFT' ? 'اشتراک ویژه هدیه گرفتید' : 'اشتراک ویژهٔ شما فعال شد',
      titleEn: input.source === 'GIFT' ? 'You received VIP days' : 'Your VIP membership is active',
      bodyFa: isLifetime(period.endsAt) ? 'اشتراک ویژهٔ شما مادام‌العمر فعال شد.' : `عضویت ویژهٔ شما تا ${period.endsAt.toLocaleDateString('fa-IR')} معتبر است.`,
      bodyEn: isLifetime(period.endsAt) ? 'Your lifetime VIP membership is active.' : `VIP valid until ${period.endsAt.toLocaleDateString('en-US')}.`,
      href: '/vip/account',
    }).catch(() => undefined)
    return { ok: true, id: row.id, endsAt: row.endsAt, created: true }
  } catch (error) {
    // A concurrent grant with the same dedupe key already won.
    if (input.dedupeKey) {
      const existing = await db.userMembership.findUnique({ where: { dedupeKey: input.dedupeKey } })
      if (existing) return { ok: true, id: existing.id, endsAt: existing.endsAt, created: false }
    }
    throw error
  }
}

/** Ends every active period of a user now. */
export async function revokeMembership(userId: number): Promise<number> {
  const result = await db.userMembership.updateMany({ where: { userId, revokedAt: null, endsAt: { gt: new Date() } }, data: { revokedAt: new Date() } })
  return result.count
}

/** Takes back what a refunded order gave. Safe to call for any order and more than once. */
export async function revokeOrderMembership(orderId: number) {
  const now = new Date()
  const count = (await db.userMembership.updateMany({ where: { orderId, revokedAt: null }, data: { revokedAt: now } })).count
  await db.membershipGift.updateMany({ where: { orderId, revokedAt: null }, data: { revokedAt: now } })
  await db.membershipApplication.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'REJECTED', decidedAt: now } })
  const order = await db.order.findUnique({ where: { id: orderId }, select: { userId: true } })
  if (order?.userId) await (await import('@/modules/membership/server/extras')).syncOwnerTeams(order.userId, now)
  return count
}

/** Grants a paid VIP plan order (fulfillment job). Everything it needs was frozen on the order at checkout. */
export async function fulfillMembershipOrder(orderId: number, options: { approved?: boolean } = {}): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, status: true, meta: true, totalMinor: true, currency: true } })
  if (!order || order.status !== 'PAID' || order.userId === null) throw new Error('membership order is not paid or has no buyer')
  let meta: Record<string, unknown> = {}
  try { meta = JSON.parse(order.meta || '{}') } catch { /* ignore */ }
  const planId = Number(meta.membershipPlanId)
  const days = Number(meta.days)
  if (!planId || (!days && meta.billing === 'DAYS')) throw new Error('membership order has no plan')
  const extras = await import('@/modules/membership/server/extras')
  const memberOrder = { ...order, userId: order.userId }
  if (meta.gift === true) { await extras.openGift(memberOrder, meta); return }
  if (meta.requiresApproval === true && !options.approved) { await extras.openApplication({ userId: order.userId, planId, orderId: order.id }); return }
  const now = new Date()
  const upgradeFrom = Array.isArray(meta.upgradeFrom) ? meta.upgradeFrom.filter((id): id is number => Number.isSafeInteger(id)) : []
  const current = await db.userMembership.findFirst({ where: { userId: order.userId, revokedAt: null, endsAt: { gt: now } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true } })
  const trial = meta.trial === true
  const period = planPeriod({ days, billing: String(meta.billing || 'DAYS'), fixedEndsAt: meta.fixedEndsAt ? new Date(String(meta.fixedEndsAt)) : null, trialDays: Number(meta.trialDays) || 0 }, current?.endsAt, now, { trial, fresh: upgradeFrom.length > 0 })
  // What this period is worth on a later upgrade: what was paid for it, with the credit it used and without the signup fee.
  const value = order.totalMinor + BigInt(String(meta.creditMinor || 0)) - BigInt(String(meta.feeMinor || 0))
  await grantMembership({ userId: order.userId, days, source: 'PURCHASE', kind: trial ? 'TRIAL' : 'PERIOD', period, amountMinor: value > 0n ? value : 0n, currency: order.currency, planId, orderId: order.id, dedupeKey: `order:${order.id}` })
  // After the grant and on every repeat, so a job stopped between the two finishes the swap and nobody is left with neither.
  if (upgradeFrom.length) await db.userMembership.updateMany({ where: { id: { in: upgradeFrom }, userId: order.userId, revokedAt: null, orderId: { not: order.id } }, data: { revokedAt: now } })
  if (Number(meta.seats) > 0) await extras.openTeam(memberOrder, planId, Number(meta.seats), String(meta.planName || ''))
  await extras.syncOwnerTeams(order.userId, now)
}

/** VIP gift days that come with a paid VPN plan or product. Safe to call more than once. */
export async function grantGiftForOrder(orderId: number): Promise<void> {
  if (!await isModuleEnabled('membership')) return
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, status: true, planId: true, productId: true } })
  if (!order || order.status !== 'PAID' || order.userId === null) return
  const days = order.planId
    ? (await db.plan.findUnique({ where: { id: order.planId }, select: { vipGiftDays: true } }))?.vipGiftDays || 0
    : order.productId ? (await db.product.findUnique({ where: { id: order.productId }, select: { vipGiftDays: true } }))?.vipGiftDays || 0 : 0
  if (days > 0) await grantMembership({ userId: order.userId, days, source: 'GIFT', orderId: order.id, dedupeKey: `gift:order:${order.id}` })
}

/**
 * Scheduled step: VIP gift days that come with a paid plan or product but were never granted.
 * The gift is granted once, as a follow-up of the fulfillment job, and a failure there is only
 * logged; without this the customer never received it. Looks at paid orders of the last days
 * that are at least ten minutes old and whose plan or product carries gift days, and grants the
 * ones that have no gift period. The grant is idempotent per order. One order that fails does
 * not stop the others.
 */
export async function recoverGiftMemberships(days = 3, now = new Date()) {
  const counters = { checked: 0, granted: 0, failed: 0 }
  if (!await isModuleEnabled('membership')) return counters
  const window = { gte: new Date(now.getTime() - (Number(days) > 0 ? Number(days) : 3) * 86_400_000), lte: new Date(now.getTime() - 10 * 60_000) }
  for (let after = 0, pages = 0; pages < 4; pages++) {
    const orders = await db.order.findMany({ where: { status: 'PAID', createdAt: window, id: { gt: after }, OR: [{ product: { vipGiftDays: { gt: 0 } } }, { plan: { vipGiftDays: { gt: 0 } } }] }, orderBy: { id: 'asc' }, take: 500, select: { id: true } })
    if (!orders.length) break
    after = orders[orders.length - 1].id
    const granted = new Set((await db.userMembership.findMany({ where: { dedupeKey: { in: orders.map((order) => `gift:order:${order.id}`) } }, select: { dedupeKey: true } })).map((row) => row.dedupeKey))
    for (const order of orders) {
      if (granted.has(`gift:order:${order.id}`)) continue
      counters.checked++
      try {
        await grantGiftForOrder(order.id)
        if (await db.userMembership.count({ where: { dedupeKey: `gift:order:${order.id}` } })) counters.granted++
      } catch (error) {
        counters.failed++
        logEvent('error', 'membership.gift_recovery_failed', { orderId: order.id, error: String(error) })
      }
    }
    if (orders.length < 500) break
  }
  return counters
}

/**
 * `member` is a real, paid membership (prices, quotas, the VIP group). `opens` answers access: may this visitor open
 * what is marked members-only? While the VIP module is off nothing is members-only, so it is true for everybody,
 * guests included; the marks stay stored and apply again when the module is turned back on.
 */
export type Viewer = { userId: number | null; member: boolean; endsAt: Date | null; opens: boolean }

/** The current visitor (server components). Cached per request. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const session = await getServerSession(authOptions).catch(() => null)
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id) || null
  if (!await isModuleEnabled('membership')) return { userId, member: false, endsAt: null, opens: true }
  if (!userId) return { userId, member: false, endsAt: null, opens: false }
  const membership = await getActiveMembership(userId)
  const member = !!membership || await groupGivesVip(userId)
  return { userId, member, endsAt: membership?.endsAt || null, opens: member }
})

export type PublicVipPlan = { seats: number; requiresApproval: boolean; tierId: number | null; billing: string; fixedEndsAt: Date | null; compareAt: number; signupFee: number; trialDays: number; trialPrice: number; payWhatYouWant: boolean; minPrice: number; id: number; slug: string; name: string; nameEn: string; description: string; descriptionEn: string; days: number; price: number; currency: string; perks: Perk[]; highlight: boolean }

/** Active VIP plans for the /vip landing page. */
export async function getVipPlans(): Promise<PublicVipPlan[]> {
  const rows = await db.membershipPlan.findMany({ where: { active: true, hidden: false }, orderBy: [{ sortOrder: 'asc' }, { days: 'asc' }] }).catch(() => [])
  // Listed perks show the owner's current text for them (one edit changes every plan); free lines as written.
  const { allLists } = await import('@/modules/vocabulary/server/vocabulary')
  const { resolvePerks } = await import('@/modules/membership/server/perks')
  const entries = (await allLists('membership')).PERK ?? []
  return rows.map((row) => ({
    seats: row.seats, requiresApproval: row.requiresApproval, tierId: row.tierId, billing: row.billing, fixedEndsAt: row.fixedEndsAt, compareAt: legacyNumber(row.compareAtMinor, row.currency), signupFee: legacyNumber(row.signupFeeMinor, row.currency), trialDays: row.trialDays, trialPrice: legacyNumber(row.trialPriceMinor, row.currency), payWhatYouWant: row.payWhatYouWant, minPrice: legacyNumber(row.minPriceMinor, row.currency),
    id: row.id, slug: row.slug, name: row.name, nameEn: row.nameEn, description: row.description, descriptionEn: row.descriptionEn,
    days: row.days, price: legacyNumber(row.priceMinor, row.currency), currency: row.currency, perks: resolvePerks(parsePerks(row.perks), entries), highlight: row.highlight,
  }))
}
