import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { grantMembership, revokeMembership } from '@/modules/membership/server/membership'
import { memberState } from '@/modules/membership/domain/plans'

async function admin(req: NextRequest) {
  return (await requirePerm(req, 'membership.manage')) || (await requirePerm(req, 'users.manage'))
}

/** VIP members: list, grant/extend by hand, revoke. */
export async function GET(req: NextRequest) {
  const off = await moduleGuard('membership')
  if (off) return off
  if (!await admin(req)) return err('forbidden', 403)
  const q = String(req.nextUrl.searchParams.get('q') || '').trim().slice(0, 120)
  const wanted = String(req.nextUrl.searchParams.get('state') || '')
  const scope = req.nextUrl.searchParams.get('scope') === 'all' || wanted === 'LAPSED' ? 'all' : 'active'
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
  const [accounts, tierPlans] = await Promise.all([
    db.membershipAccount.findMany({ where: { userId: { in: userIds } } }),
    db.membershipPlan.findMany({ where: { tierId: { not: null } }, select: { id: true, tier: { select: { name: true, rank: true, color: true } } } }),
  ])
  const accountOf = new Map(accounts.map((row) => [row.userId, row]))
  const tierOf = new Map(tierPlans.map((row) => [row.id, row.tier]))
  const members = userIds.flatMap((userId) => {
    const user = byUser.get(userId)
    if (!user) return []
    const mine = periods.filter((p) => p.userId === userId)
    const active = mine.filter((p) => !p.revokedAt && p.endsAt > now)
    const endsAt = active.reduce<Date | null>((max, p) => (!max || p.endsAt > max ? p.endsAt : max), null)
    const running = active.filter((p) => p.startsAt <= now)
    const tier = running.flatMap((p) => { const found = p.planId ? tierOf.get(p.planId) : null; return found ? [found] : [] }).sort((a, b) => b.rank - a.rank)[0] || null
    const account = accountOf.get(userId)
    const state = memberState({ endsAt, active: active.length > 0, trial: running.length > 0 && running.every((p) => p.kind === 'TRIAL'), cancelled: !!account?.cancelledAt }, now)
    if (wanted && state !== wanted) return []
    return [{ user, state, tier, note: account?.adminNote ?? '', autoRenew: account?.autoRenew ?? false, cancelReason: account?.cancelReason ?? '', active: active.length > 0, endsAt, periods: mine.slice(0, 20).map((p) => ({ id: p.id, source: p.source, startsAt: p.startsAt, endsAt: p.endsAt, revokedAt: p.revokedAt, note: p.note, orderId: p.orderId })) }]
  })
  const [activeCount, plans] = await Promise.all([
    db.userMembership.groupBy({ by: ['userId'], where: { revokedAt: null, endsAt: { gt: now } } }).then((rows) => rows.length).catch(() => 0),
    db.membershipPlan.count({ where: { active: true } }).catch(() => 0),
  ])
  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const cell = (value: unknown) => { const text = String(value ?? ''); const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe }
    const lines = [['شناسه', 'نام', 'ایمیل', 'وضعیت', 'سطح', 'پایان', 'تمدید خودکار'], ...members.map((row) => [row.user.id, row.user.name, row.user.email, row.state, row.tier?.name, row.endsAt?.toISOString(), row.autoRenew ? 'بله' : 'خیر'])]
    await auditAdmin({ req, actor: await admin(req) as Awaited<ReturnType<typeof requirePerm>> & object, action: 'membership.export', targetType: 'User', targetId: 'all', metadata: { rows: members.length } })
    return new Response(`\ufeff${lines.map((row) => row.map(cell).join(',')).join('\n')}\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="vip-members.csv"', 'Cache-Control': 'no-store' } })
  }
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

/** PATCH { userId, note } — the team's private note on a member. */
export async function PATCH(req: NextRequest) {
  const off = await moduleGuard('membership')
  if (off) return off
  const actor = await admin(req)
  if (!actor) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const userId = Number(body?.userId)
  if (!Number.isSafeInteger(userId) || userId <= 0) return err('invalid user')
  const adminNote = String(body?.note ?? '').trim().slice(0, 500)
  await db.membershipAccount.upsert({ where: { userId }, create: { userId, adminNote }, update: { adminNote } })
  await auditAdmin({ req, actor, action: 'membership.note', targetType: 'User', targetId: userId })
  return ok({ ok: true })
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
