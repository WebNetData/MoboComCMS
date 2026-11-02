import { randomBytes } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { MembershipError, planPeriod } from '@/modules/membership/domain/plans'
import { grantMembership } from '@/modules/membership/server/membership'

// Three ways into a membership other than buying it for yourself: a gift, a seat in a group, and an application the team decides.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** Long enough that guessing is not a way in; no look-alike letters, so it can be read out. */
const newCode = () => [...randomBytes(16)].map((byte) => ALPHABET[byte % ALPHABET.length]).join('')
export const normalizeCode = (value: unknown) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32)

// ------------------------------------------------------------------ gifts

/** A paid gift order becomes a code. Safe to repeat: an order has one gift. */
export async function openGift(order: { id: number; userId: number }, meta: Record<string, unknown>) {
  const planId = Number(meta.membershipPlanId)
  const existing = await db.membershipGift.findUnique({ where: { orderId: order.id } })
  if (existing) return existing
  const email = String(meta.giftEmail || '').trim().toLowerCase().slice(0, 190), message = String(meta.giftMessage || '').trim().slice(0, 300)
  const gift = await db.membershipGift.create({ data: { code: newCode(), planId, buyerId: order.userId, orderId: order.id, recipientEmail: email, message } })
  await createInboxEvent({ userId: order.userId, kind: 'MEMBERSHIP', dedupeKey: `membership:gift:${gift.id}`, titleFa: 'هدیهٔ شما آماده است', titleEn: 'Your gift is ready', bodyFa: 'کد هدیه را در صفحهٔ اشتراک من ببینید و برای گیرنده بفرستید.', bodyEn: 'Find the gift code on your membership page.', href: '/vip/account' }).catch(() => undefined)
  if (email) {
    const { getSettings } = await import('@/modules/settings/server')
    const { sendMail } = await import('@/modules/mail/server/mailer')
    const site = ((await getSettings()).siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
    await sendMail({ to: email, subject: 'یک اشتراک ویژه هدیه گرفتید', text: `${message ? `${message}\n\n` : ''}برای فعال‌سازی هدیه وارد این نشانی شوید:\n${site}/vip/account?gift=${gift.code}\n\nکد هدیه: ${gift.code}`, source: 'membership-gift' }).catch((error) => logEvent('warn', 'membership.gift_mail_failed', { giftId: gift.id, error: String(error) }))
  }
  return gift
}

/** Claimed first, so two people with one code cannot both have it; a repeat by the same person only finishes the grant. */
export async function redeemGift(rawCode: unknown, userId: number) {
  const code = normalizeCode(rawCode)
  const gift = code.length >= 12 ? await db.membershipGift.findUnique({ where: { code } }) : null
  if (!gift || gift.revokedAt) throw new MembershipError('این کد هدیه معتبر نیست', 404, 'GIFT_INVALID')
  if (gift.claimedBy && gift.claimedBy !== userId) throw new MembershipError('این کد قبلاً استفاده شده است', 409, 'GIFT_USED')
  if (!gift.claimedBy && (await db.membershipGift.updateMany({ where: { id: gift.id, claimedBy: null, revokedAt: null }, data: { claimedBy: userId, claimedAt: new Date() } })).count !== 1) throw new MembershipError('این کد قبلاً استفاده شده است', 409, 'GIFT_USED')
  const plan = await db.membershipPlan.findUnique({ where: { id: gift.planId } })
  if (!plan) throw new MembershipError('پلن این هدیه دیگر وجود ندارد؛ با پشتیبانی تماس بگیرید', 409, 'GIFT_PLAN_GONE')
  const now = new Date()
  const current = await db.userMembership.findFirst({ where: { userId, revokedAt: null, endsAt: { gt: now } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true } })
  return grantMembership({ userId, days: plan.days, source: 'GIFT', planId: plan.id, orderId: gift.orderId, dedupeKey: `gift-code:${gift.id}`, period: planPeriod(plan, current?.endsAt, now) })
}

// ------------------------------------------------------------------ groups

/** The buyer's own end, which every seat follows. */
const ownerEnd = async (ownerId: number) => (await db.userMembership.findFirst({ where: { userId: ownerId, revokedAt: null, source: { not: 'TEAM' } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true } }))?.endsAt ?? null

/** A plan with seats opens a group, or adds its seats to the one the buyer holds on that plan. */
export async function openTeam(order: { id: number; userId: number }, planId: number, seats: number, name: string) {
  const endsAt = await ownerEnd(order.userId)
  if (!endsAt) return null
  const held = await db.membershipTeam.findFirst({ where: { ownerId: order.userId, planId, closedAt: null } })
  if (held) return db.membershipTeam.update({ where: { id: held.id }, data: { seats: Math.max(held.seats, seats), endsAt } })
  return db.membershipTeam.upsert({ where: { orderId: order.id }, create: { ownerId: order.userId, planId, orderId: order.id, seats, endsAt, code: newCode(), name: name.slice(0, 80) }, update: {} })
}

/** Seats end with the buyer's membership: a renewal carries them on, a refund or expiry closes the group. Repeats safely. */
export async function syncOwnerTeams(ownerId: number, now = new Date()) {
  const teams = await db.membershipTeam.findMany({ where: { ownerId, closedAt: null }, include: { members: { where: { removedAt: null }, select: { periodId: true } } } })
  if (!teams.length) return
  const endsAt = await ownerEnd(ownerId)
  for (const team of teams) {
    const periods = team.members.map((member) => member.periodId)
    if (!endsAt || endsAt <= now) {
      await db.$transaction([db.userMembership.updateMany({ where: { id: { in: periods }, revokedAt: null }, data: { revokedAt: now } }), db.membershipTeam.update({ where: { id: team.id }, data: { closedAt: now } })])
      continue
    }
    await db.$transaction([db.userMembership.updateMany({ where: { id: { in: periods }, revokedAt: null }, data: { endsAt } }), db.membershipTeam.update({ where: { id: team.id }, data: { endsAt } })])
  }
}

/** A seat is taken by moving the counter from the value read, so the last seat goes to one person however many ask. */
export async function joinTeam(rawCode: unknown, userId: number, now = new Date()) {
  const code = normalizeCode(rawCode)
  for (let attempt = 0; attempt < 5; attempt++) {
    const team = code.length >= 12 ? await db.membershipTeam.findUnique({ where: { code } }) : null
    if (!team || team.closedAt || team.endsAt <= now) throw new MembershipError('این لینک دعوت معتبر نیست', 404, 'TEAM_INVALID')
    if (team.ownerId === userId) throw new MembershipError('شما مالک این گروه هستید', 409, 'TEAM_OWNER')
    const seat = await db.membershipTeamMember.findUnique({ where: { teamId_userId: { teamId: team.id, userId } } })
    if (seat && !seat.removedAt) return team
    if (team.used >= team.seats) throw new MembershipError('ظرفیت این گروه تکمیل شده است', 409, 'TEAM_FULL')
    if ((await db.membershipTeam.updateMany({ where: { id: team.id, used: team.used, closedAt: null }, data: { used: { increment: 1 } } })).count !== 1) continue
    try {
      const period = await grantMembership({ userId, days: 1, source: 'TEAM', planId: team.planId, orderId: team.orderId, period: { startsAt: now, endsAt: team.endsAt }, dedupeKey: `team:${team.id}:${userId}:${now.getTime()}` })
      await db.membershipTeamMember.upsert({ where: { teamId_userId: { teamId: team.id, userId } }, create: { teamId: team.id, userId, periodId: period.id }, update: { periodId: period.id, removedAt: null, joinedAt: now } })
      return team
    } catch (error) {
      await db.membershipTeam.updateMany({ where: { id: team.id, used: { gt: 0 } }, data: { used: { decrement: 1 } } })
      throw error
    }
  }
  throw new MembershipError('گروه شلوغ است؛ دوباره تلاش کنید', 409, 'TEAM_BUSY')
}

/** The owner frees a seat: the person loses it now and the seat can be given again. */
export async function removeTeamMember(ownerId: number, teamId: number, userId: number) {
  const seat = await db.membershipTeamMember.findFirst({ where: { teamId, userId, removedAt: null, team: { ownerId } } })
  if (!seat) throw new MembershipError('این عضو در گروه شما نیست', 404, 'TEAM_MEMBER')
  if ((await db.membershipTeamMember.updateMany({ where: { id: seat.id, removedAt: null }, data: { removedAt: new Date() } })).count !== 1) return
  await db.$transaction([db.userMembership.updateMany({ where: { id: seat.periodId, revokedAt: null }, data: { revokedAt: new Date() } }), db.membershipTeam.updateMany({ where: { id: teamId, used: { gt: 0 } }, data: { used: { decrement: 1 } } })])
}

/** A leaked invite stops working; those already in stay. */
export async function rotateTeamCode(ownerId: number, teamId: number) {
  if ((await db.membershipTeam.updateMany({ where: { id: teamId, ownerId, closedAt: null }, data: { code: newCode() } })).count !== 1) throw new MembershipError('گروه پیدا نشد', 404, 'TEAM_INVALID')
}

// ------------------------------------------------------------------ approval

/** A plan that needs the team's yes holds here, paid or free, until they decide. Safe to repeat. */
export async function openApplication(input: { userId: number; planId: number; orderId: number | null }) {
  const held = input.orderId
    ? await db.membershipApplication.findUnique({ where: { orderId: input.orderId } })
    : await db.membershipApplication.findFirst({ where: { userId: input.userId, planId: input.planId, status: 'PENDING' } })
  if (held) return held
  const row = await db.membershipApplication.create({ data: input })
  await createInboxEvent({ userId: input.userId, kind: 'MEMBERSHIP', dedupeKey: `membership:application:${row.id}`, titleFa: 'درخواست عضویت شما ثبت شد', titleEn: 'Your application is in', bodyFa: 'پس از تأیید تیم، اشتراک شما فعال می‌شود.', bodyEn: 'Your membership starts once the team approves it.', href: '/vip/account' }).catch(() => undefined)
  return row
}

/** Decided once. A refused paid application goes back through the same refund as any invoice, so its order closes properly. */
export async function decideApplication(id: number, decision: 'APPROVED' | 'REJECTED', actor: { id: number; email: string }, note: unknown) {
  const text = String(note ?? '').trim().slice(0, 300), now = new Date()
  const row = await db.membershipApplication.findUnique({ where: { id } })
  if (!row) throw new MembershipError('درخواست پیدا نشد', 404, 'APPLICATION')
  if ((await db.membershipApplication.updateMany({ where: { id, status: 'PENDING' }, data: { status: decision, note: text, decidedBy: actor.id, decidedAt: now } })).count !== 1) throw new MembershipError('این درخواست قبلاً بررسی شده است', 409, 'APPLICATION_DECIDED')
  const reopen = () => db.membershipApplication.updateMany({ where: { id, status: decision }, data: { status: 'PENDING', decidedBy: null, decidedAt: null } })
  try {
    if (decision === 'APPROVED') {
      const { fulfillMembershipOrder } = await import('@/modules/membership/server/membership')
      if (row.orderId) await fulfillMembershipOrder(row.orderId, { approved: true })
      else {
        const plan = await db.membershipPlan.findUnique({ where: { id: row.planId } })
        if (!plan) throw new MembershipError('پلن این درخواست دیگر وجود ندارد', 409, 'APPLICATION_PLAN')
        await grantMembership({ userId: row.userId, days: plan.trialDays, source: 'PURCHASE', kind: 'TRIAL', planId: plan.id, dedupeKey: `trial:${row.userId}:${plan.tierId ? `t${plan.tierId}` : `p${plan.id}`}`, period: planPeriod(plan, null, now, { trial: true }) })
      }
    } else if (row.orderId) {
      const invoice = await db.invoice.findFirst({ where: { orderId: row.orderId, status: 'PAID' }, include: { gateway: { select: { provider: true } } } })
      if (invoice) {
        const { refundPaidInvoice } = await import('@/modules/billing/server/order-closure')
        const { toMinor, normalizeCurrency } = await import('@/shared/money')
        const currency = normalizeCurrency(invoice.currency), totalMinor = toMinor(invoice.total, currency)
        const refunded = await refundPaidInvoice(invoice, { totalMinor, walletMinor: totalMinor, by: actor.email, actorId: actor.id })
        if (!refunded.ok) throw new MembershipError(refunded.message, refunded.status, 'APPLICATION_REFUND')
      }
    }
  } catch (error) { await reopen(); throw error }
  await createInboxEvent({ userId: row.userId, kind: 'MEMBERSHIP', dedupeKey: `membership:decision:${row.id}`, titleFa: decision === 'APPROVED' ? 'درخواست عضویت شما تأیید شد' : 'درخواست عضویت شما پذیرفته نشد', titleEn: decision === 'APPROVED' ? 'Your application was approved' : 'Your application was declined', bodyFa: decision === 'APPROVED' ? 'اشتراک شما فعال است.' : `${text ? `${text} ` : ''}${row.orderId ? 'مبلغ پرداختی به کیف پول شما برگشت.' : ''}`, bodyEn: decision === 'APPROVED' ? 'Your membership is active.' : 'Any payment went back to your wallet.', href: '/vip/account' }).catch(() => undefined)
}

// ------------------------------------------------------------------ reads

/** What a member has beyond their own periods, for their page. */
export async function memberExtras(userId: number) {
  const [gifts, teams, seats, pending] = await Promise.all([
    db.membershipGift.findMany({ where: { buyerId: userId, revokedAt: null }, orderBy: { id: 'desc' }, take: 20 }),
    db.membershipTeam.findMany({ where: { ownerId: userId, closedAt: null }, include: { members: { where: { removedAt: null }, select: { userId: true, joinedAt: true } } } }),
    db.membershipTeamMember.findMany({ where: { userId, removedAt: null, team: { closedAt: null } }, select: { team: { select: { name: true } } } }),
    db.membershipApplication.count({ where: { userId, status: 'PENDING' } }),
  ])
  const people = new Map((await db.user.findMany({ where: { id: { in: teams.flatMap((team) => team.members.map((member) => member.userId)) } }, select: { id: true, name: true, email: true } })).map((user) => [user.id, user]))
  const plans = new Map((await db.membershipPlan.findMany({ where: { id: { in: gifts.map((gift) => gift.planId) } }, select: { id: true, name: true } })).map((plan) => [plan.id, plan.name]))
  return {
    pending,
    gifts: gifts.map((gift) => ({ id: gift.id, code: gift.code, plan: plans.get(gift.planId) || 'اشتراک ویژه', claimed: !!gift.claimedBy, email: gift.recipientEmail })),
    teams: teams.map((team) => ({ id: team.id, name: team.name, code: team.code, seats: team.seats, used: team.used, endsAt: team.endsAt, members: team.members.map((member) => ({ userId: member.userId, name: people.get(member.userId)?.name || people.get(member.userId)?.email || `#${member.userId}`, joinedAt: member.joinedAt })) })),
    seatIn: seats.map((seat) => seat.team.name),
  }
}

/** The team's view: who waits for a decision, the gifts sold and the groups running. */
export async function adminExtras() {
  const [applications, gifts, teams] = await Promise.all([
    db.membershipApplication.findMany({ where: { status: 'PENDING' }, orderBy: { id: 'asc' }, take: 200 }),
    db.membershipGift.findMany({ orderBy: { id: 'desc' }, take: 100 }),
    db.membershipTeam.findMany({ where: { closedAt: null }, orderBy: { id: 'desc' }, take: 100 }),
  ])
  const ids = [...applications.map((row) => row.userId), ...gifts.flatMap((row) => [row.buyerId, ...(row.claimedBy ? [row.claimedBy] : [])]), ...teams.map((row) => row.ownerId)]
  const people = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })).map((user) => [user.id, user.name || user.email || `#${user.id}`]))
  const plans = new Map((await db.membershipPlan.findMany({ select: { id: true, name: true } })).map((plan) => [plan.id, plan.name]))
  const orders = new Map((await db.order.findMany({ where: { id: { in: applications.flatMap((row) => (row.orderId ? [row.orderId] : [])) } }, select: { id: true, totalMinor: true, currency: true } })).map((order) => [order.id, order]))
  return {
    applications: applications.map((row) => ({ id: row.id, user: people.get(row.userId) || `#${row.userId}`, userId: row.userId, plan: plans.get(row.planId) || `#${row.planId}`, createdAt: row.createdAt, paid: row.orderId ? `${orders.get(row.orderId)?.totalMinor ?? 0n} ${orders.get(row.orderId)?.currency ?? ''}` : 'رایگان' })),
    gifts: gifts.map((row) => ({ id: row.id, buyer: people.get(row.buyerId) || `#${row.buyerId}`, plan: plans.get(row.planId) || `#${row.planId}`, claimedBy: row.claimedBy ? people.get(row.claimedBy) || `#${row.claimedBy}` : '', revoked: !!row.revokedAt, createdAt: row.createdAt })),
    teams: teams.map((row) => ({ id: row.id, name: row.name, owner: people.get(row.ownerId) || `#${row.ownerId}`, plan: plans.get(row.planId) || `#${row.planId}`, seats: row.seats, used: row.used, endsAt: row.endsAt })),
  }
}
