import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { AUDIENCE_ITEMS, isAudienceItem } from '@/modules/account/domain/item-audience'
import { MembershipError, normalizeTier } from '@/modules/membership/domain/plans'
import { cancelMembership, memberOverview, resumeMembership, setAutoRenew, startFreeTrial } from '@/modules/membership/server/lifecycle'
import { readRule, saveRule } from '@/modules/membership/server/rules'

const failure = (error: unknown) => {
  if (error instanceof MembershipError) return err(error.message, error.status, { code: error.code })
  throw error
}

/** POST /api/me/membership { action: auto-renew | cancel | resume | trial, … } — a member's own choices. */
export async function POST_me(req: NextRequest) {
  const off = await moduleGuard('membership')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const body = await req.json().catch(() => null)
  try {
    switch (body?.action) {
      case 'auto-renew': await setAutoRenew(user.id, body.on === true, Number(body.planId) || null); break
      case 'cancel': await cancelMembership(user.id, body.reason); break
      case 'resume': await resumeMembership(user.id); break
      case 'trial': await startFreeTrial(user.id, Number(body.planId) || 0); break
      default: return err('عملیات نامعتبر است')
    }
    return ok(await memberOverview(user.id))
  } catch (error) { return failure(error) }
}

const TIERS = ['membership.manage', 'users.manage']

/** GET /api/admin/membership/tiers */
export async function GET_tiers(req: NextRequest) {
  const g = await adminGuard(req, 'membership', TIERS)
  if ('response' in g) return g.response
  const tiers = await db.membershipTier.findMany({ orderBy: { rank: 'asc' }, include: { _count: { select: { plans: true } } } })
  return ok({ tiers: tiers.map(({ _count, ...tier }) => ({ ...tier, plans: _count.plans })) })
}

/** POST /api/admin/membership/tiers { op: save | delete, … } */
export async function POST_tiers(req: NextRequest) {
  const g = await adminGuard(req, 'membership', TIERS)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  const id = Number(body?.id) || 0
  try {
    if (body?.op === 'delete') {
      await db.membershipTier.deleteMany({ where: { id } })
      await auditAdmin({ req, actor: g.admin, action: 'membership.tier-delete', targetType: 'MembershipTier', targetId: id })
      return ok({ ok: true })
    }
    const data = normalizeTier(body?.tier || {})
    if (await db.membershipTier.findFirst({ where: { rank: data.rank, ...(id ? { id: { not: id } } : {}) }, select: { id: true } })) return err('سطح دیگری همین رتبه را دارد')
    const saved = id ? await db.membershipTier.update({ where: { id }, data }) : await db.membershipTier.create({ data })
    await auditAdmin({ req, actor: g.admin, action: 'membership.tier-save', targetType: 'MembershipTier', targetId: saved.id, metadata: { rank: saved.rank, storeDiscountPercent: saved.storeDiscountPercent, freeShipping: saved.freeShipping } })
    return ok({ tier: { id: saved.id } })
  } catch (error) { return failure(error) }
}

const ruleGuard = (req: NextRequest, type: keyof typeof AUDIENCE_ITEMS) => adminGuard(req, 'membership', ['membership.manage', AUDIENCE_ITEMS[type].permission])

/** GET /api/admin/membership/rules?type=&id= */
export async function GET_rule(req: NextRequest) {
  const url = req.nextUrl.searchParams, type = url.get('type'), id = Number(url.get('id')) || 0
  if (!isAudienceItem(type) || type === 'product' || !id) return err('not found', 404)
  const g = await ruleGuard(req, type)
  if ('response' in g) return g.response
  return ok(await readRule(type, id))
}

/** POST /api/admin/membership/rules { type, id, minRank, dripDays } */
export async function POST_rule(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const type = body?.type, id = Number(body?.id) || 0
  if (!isAudienceItem(type) || type === 'product' || !id) return err('not found', 404)
  const g = await ruleGuard(req, type)
  if ('response' in g) return g.response
  const saved = await saveRule(type, id, body)
  await auditAdmin({ req, actor: g.admin, action: 'membership.rule', targetType: type, targetId: id, metadata: saved })
  return ok(saved)
}
