import { cache } from 'react'
import { getServerSession } from 'next-auth'
import { db } from '@/platform/database/prisma'
import { authOptions } from '@/modules/identity/auth'
import { extendMembership, parsePerks, type Perk } from '@/modules/membership/domain/membership'
import { legacyNumber } from '@/shared/money'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { isModuleEnabled } from '@/extensions/server/modules'

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

export async function isMember(userId: number | null | undefined): Promise<boolean> {
  if (!await isModuleEnabled('membership')) return false
  return !!(await getActiveMembership(userId))
}

/**
 * Adds VIP days. Idempotent per `dedupeKey` (order grants, gifts), and stacks on
 * top of the current membership so renewals never lose remaining days.
 */
export async function grantMembership(input: {
  userId: number
  days: number
  source: 'PURCHASE' | 'GIFT' | 'ADMIN'
  planId?: number | null
  orderId?: number | null
  dedupeKey?: string | null
  note?: string
  createdBy?: number | null
}): Promise<{ ok: true; endsAt: Date; created: boolean }> {
  if (input.dedupeKey) {
    const existing = await db.userMembership.findUnique({ where: { dedupeKey: input.dedupeKey } })
    if (existing) return { ok: true, endsAt: existing.endsAt, created: false }
  }
  const current = await db.userMembership.findFirst({ where: { userId: input.userId, revokedAt: null, endsAt: { gt: new Date() } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true } })
  const period = extendMembership(current?.endsAt, input.days)
  try {
    const row = await db.userMembership.create({ data: {
      userId: input.userId,
      planId: input.planId ?? null,
      source: input.source,
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      orderId: input.orderId ?? null,
      dedupeKey: input.dedupeKey || null,
      note: String(input.note || '').slice(0, 500),
      createdBy: input.createdBy ?? null,
    } })
    await createInboxEvent({
      userId: input.userId,
      kind: 'MEMBERSHIP',
      dedupeKey: `membership:${row.id}`,
      titleFa: input.source === 'GIFT' ? 'اشتراک ویژه هدیه گرفتید' : 'اشتراک ویژهٔ شما فعال شد',
      titleEn: input.source === 'GIFT' ? 'You received VIP days' : 'Your VIP membership is active',
      bodyFa: `${input.days} روز عضویت ویژه اضافه شد؛ اعتبار تا ${period.endsAt.toLocaleDateString('fa-IR')}.`,
      bodyEn: `${input.days} VIP days added — valid until ${period.endsAt.toLocaleDateString('en-US')}.`,
      href: '/vip',
    }).catch(() => undefined)
    return { ok: true, endsAt: row.endsAt, created: true }
  } catch (error) {
    // A concurrent grant with the same dedupe key already won.
    if (input.dedupeKey) {
      const existing = await db.userMembership.findUnique({ where: { dedupeKey: input.dedupeKey } })
      if (existing) return { ok: true, endsAt: existing.endsAt, created: false }
    }
    throw error
  }
}

/** Ends every active period of a user now. */
export async function revokeMembership(userId: number): Promise<number> {
  const result = await db.userMembership.updateMany({ where: { userId, revokedAt: null, endsAt: { gt: new Date() } }, data: { revokedAt: new Date() } })
  return result.count
}

/** Grants a paid VIP plan order (fulfillment job). */
export async function fulfillMembershipOrder(orderId: number): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, status: true, meta: true } })
  if (!order || order.status !== 'PAID') throw new Error('membership order is not paid')
  let meta: Record<string, unknown> = {}
  try { meta = JSON.parse(order.meta || '{}') } catch { /* ignore */ }
  const planId = Number(meta.membershipPlanId)
  const days = Number(meta.days)
  if (!planId || !days) throw new Error('membership order has no plan')
  await grantMembership({ userId: order.userId, days, source: 'PURCHASE', planId, orderId: order.id, dedupeKey: `order:${order.id}` })
}

/** VIP gift days that come with a paid VPN plan or product. Safe to call more than once. */
export async function grantGiftForOrder(orderId: number): Promise<void> {
  if (!await isModuleEnabled('membership')) return
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, status: true, planId: true, productId: true } })
  if (!order || order.status !== 'PAID') return
  const days = order.planId
    ? (await db.plan.findUnique({ where: { id: order.planId }, select: { vipGiftDays: true } }))?.vipGiftDays || 0
    : order.productId ? (await db.product.findUnique({ where: { id: order.productId }, select: { vipGiftDays: true } }))?.vipGiftDays || 0 : 0
  if (days > 0) await grantMembership({ userId: order.userId, days, source: 'GIFT', orderId: order.id, dedupeKey: `gift:order:${order.id}` })
}

export type Viewer = { userId: number | null; member: boolean; endsAt: Date | null }

/** The current visitor (server components). Cached per request. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const session = await getServerSession(authOptions).catch(() => null)
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id) || null
  if (!userId || !await isModuleEnabled('membership')) return { userId, member: false, endsAt: null }
  const membership = await getActiveMembership(userId)
  return { userId, member: !!membership, endsAt: membership?.endsAt || null }
})

export type PublicVipPlan = { id: number; slug: string; name: string; nameEn: string; description: string; descriptionEn: string; days: number; price: number; currency: string; perks: Perk[]; highlight: boolean }

/** Active VIP plans for the /vip landing page. */
export async function getVipPlans(): Promise<PublicVipPlan[]> {
  const rows = await db.membershipPlan.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { days: 'asc' }] }).catch(() => [])
  return rows.map((row) => ({
    id: row.id, slug: row.slug, name: row.name, nameEn: row.nameEn, description: row.description, descriptionEn: row.descriptionEn,
    days: row.days, price: legacyNumber(row.priceMinor, row.currency), currency: row.currency, perks: parsePerks(row.perks), highlight: row.highlight,
  }))
}
