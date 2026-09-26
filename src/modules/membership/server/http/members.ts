import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { grantMembership, revokeMembership } from '@/modules/membership/server/membership'

async function admin(req: NextRequest) {
  return (await requirePerm(req, 'membership.manage')) || (await requirePerm(req, 'users.manage'))
}

/** VIP members: list, grant/extend by hand, revoke. */
export async function GET(req: NextRequest) {
  const off = await moduleGuard('membership')
  if (off) return off
  if (!await admin(req)) return err('forbidden', 403)
  const q = String(req.nextUrl.searchParams.get('q') || '').trim().slice(0, 120)
  const scope = req.nextUrl.searchParams.get('scope') === 'all' ? 'all' : 'active'
  const now = new Date()
  const periods = await db.userMembership.findMany({
    where: scope === 'active' ? { revokedAt: null, endsAt: { gt: now } } : {},
    orderBy: { endsAt: 'desc' },
    take: 2000,
  })
  const userIds = [...new Set(periods.map((p) => p.userId))]
  const users = await db.user.findMany({
    where: { id: { in: userIds }, ...(q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {}) },
    select: { id: true, email: true, name: true, telegramUsername: true },
  })
  const byUser = new Map(users.map((u) => [u.id, u]))
  const members = userIds.flatMap((userId) => {
    const user = byUser.get(userId)
    if (!user) return []
    const mine = periods.filter((p) => p.userId === userId)
    const active = mine.filter((p) => !p.revokedAt && p.endsAt > now)
    const endsAt = active.reduce<Date | null>((max, p) => (!max || p.endsAt > max ? p.endsAt : max), null)
    return [{ user, active: active.length > 0, endsAt, periods: mine.slice(0, 20).map((p) => ({ id: p.id, source: p.source, startsAt: p.startsAt, endsAt: p.endsAt, revokedAt: p.revokedAt, note: p.note, orderId: p.orderId })) }]
  })
  const [activeCount, plans] = await Promise.all([
    db.userMembership.groupBy({ by: ['userId'], where: { revokedAt: null, endsAt: { gt: now } } }).then((rows) => rows.length).catch(() => 0),
    db.membershipPlan.count({ where: { active: true } }).catch(() => 0),
  ])
  return ok({ members, stats: { active: activeCount, plans } })
}

export async function POST(req: NextRequest) {
  const off = await moduleGuard('membership')
  if (off) return off
  const actor = await admin(req)
  if (!actor) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const days = Math.round(Number(body?.days))
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) return err('تعداد روز نامعتبر است / Invalid days')
  const identifier = String(body?.user || '').trim()
  const user = /^\d+$/.test(identifier)
    ? await db.user.findUnique({ where: { id: Number(identifier) }, select: { id: true, email: true } })
    : await db.user.findFirst({ where: { OR: [{ email: identifier.toLowerCase() }, { telegramUsername: identifier.replace(/^@/, '') }] }, select: { id: true, email: true } })
  if (!user) return err('کاربر پیدا نشد / User not found', 404)
  const result = await grantMembership({ userId: user.id, days, source: 'ADMIN', note: String(body?.note || '').slice(0, 300), createdBy: actor.id })
  await auditAdmin({ req, actor, action: 'membership.grant', targetType: 'User', targetId: user.id, metadata: { days, endsAt: result.endsAt.toISOString() } })
  return ok({ userId: user.id, endsAt: result.endsAt })
}

export async function DELETE(req: NextRequest) {
  const off = await moduleGuard('membership')
  if (off) return off
  const actor = await admin(req)
  if (!actor) return err('forbidden', 403)
  const userId = Number(req.nextUrl.searchParams.get('userId'))
  if (!Number.isSafeInteger(userId) || userId <= 0) return err('invalid user')
  const count = await revokeMembership(userId)
  await auditAdmin({ req, actor, action: 'membership.revoke', targetType: 'User', targetId: userId, metadata: { periods: count } })
  return ok({ revoked: count })
}
