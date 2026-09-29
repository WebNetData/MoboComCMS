import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requireUser } from '@/modules/identity/server/access'
import { PaywallError, isOwnerType, parseContentKey, type OwnerType } from '@/modules/paywall/domain/paywall'
import { adminGrant, getPaidItem, myPurchases, paywallOverview, removePaidItem, revokePurchase, savePaidItem } from '@/modules/paywall/server/paywall'

/** Section editors may price their own items; the paid content page needs its own permission. */
const SECTION_PERMS: Record<OwnerType, string[]> = {
  post: ['cms.posts'], software: ['software.manage', 'cms.posts'], game: ['games.manage', 'cms.posts'],
  title: ['cinema.manage', 'cms.posts'], album: ['music.manage', 'cms.posts'], track: ['music.manage', 'cms.posts'],
}
const MANAGE = ['paywall.manage', 'membership.manage', 'settings.manage']

const failure = (error: unknown) => {
  if (error instanceof PaywallError) return err(error.message, error.status, { code: error.code })
  throw error
}

function ownerFrom(req: NextRequest, body?: Record<string, unknown>) {
  const q = req.nextUrl.searchParams
  const ownerType = String(body?.ownerType ?? q.get('ownerType') ?? '')
  const ownerId = Number(body?.ownerId ?? q.get('ownerId'))
  return isOwnerType(ownerType) && Number.isSafeInteger(ownerId) && ownerId > 0 ? { ownerType, ownerId } : null
}

/** GET /api/admin/paywall — the dashboard, or ?ownerType=&ownerId= for one item's price panel. */
export async function GET(req: NextRequest) {
  const owner = ownerFrom(req)
  const guard = await adminGuard(req, 'paywall', owner ? [...MANAGE, ...SECTION_PERMS[owner.ownerType]] : MANAGE)
  if ('response' in guard) return guard.response
  if (owner) return ok(await getPaidItem(owner.ownerType, owner.ownerId))
  const q = req.nextUrl.searchParams
  return ok(await paywallOverview({ type: q.get('type') || '', q: q.get('q') || '' }))
}

/** PUT /api/admin/paywall — set the price of one item. */
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) || {}
  const owner = ownerFrom(req, body)
  if (!owner) return err('مورد نامعتبر است', 400)
  const guard = await adminGuard(req, 'paywall', [...MANAGE, ...SECTION_PERMS[owner.ownerType]])
  if ('response' in guard) return guard.response
  try {
    const item = await savePaidItem(owner.ownerType, owner.ownerId, body)
    await auditAdmin({ req, actor: guard.admin, action: 'paywall.price', targetType: owner.ownerType, targetId: String(owner.ownerId), metadata: { price: item.price, currency: item.currency, vipAccess: item.vipAccess, active: item.active } })
    return ok({ item })
  } catch (error) { return failure(error) }
}

/** DELETE /api/admin/paywall?ownerType=&ownerId= — takes the price off; the item follows its normal access again. */
export async function DELETE(req: NextRequest) {
  const owner = ownerFrom(req)
  if (!owner) return err('مورد نامعتبر است', 400)
  const guard = await adminGuard(req, 'paywall', [...MANAGE, ...SECTION_PERMS[owner.ownerType]])
  if ('response' in guard) return guard.response
  await removePaidItem(owner.ownerType, owner.ownerId)
  await auditAdmin({ req, actor: guard.admin, action: 'paywall.remove', targetType: owner.ownerType, targetId: String(owner.ownerId), metadata: {} })
  return ok({ removed: true })
}

/** POST /api/admin/paywall — { op: 'grant', user, key, note } | { op: 'revoke', id }. */
export async function POST(req: NextRequest) {
  const guard = await adminGuard(req, 'paywall', MANAGE)
  if ('response' in guard) return guard.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (body.op === 'grant') {
      const key = parseContentKey(body.key)
      if (!key) return err('مورد نامعتبر است', 400)
      const userId = await adminGrant({ user: String(body.user || ''), key, note: String(body.note || '') })
      await auditAdmin({ req, actor: guard.admin, action: 'paywall.grant', targetType: key.ownerType, targetId: String(key.ownerId), metadata: { userId } })
      return ok({ granted: true })
    }
    if (body.op === 'revoke') {
      const id = Number(body.id)
      if (!Number.isSafeInteger(id) || id <= 0) return err('شناسه نامعتبر است', 400)
      await revokePurchase(id)
      await auditAdmin({ req, actor: guard.admin, action: 'paywall.revoke', targetType: 'purchase', targetId: String(id), metadata: {} })
      return ok({ revoked: true })
    }
    return err('عملیات نامعتبر است', 400)
  } catch (error) { return failure(error) }
}

/** GET /api/me/purchases — "my purchases". */
export async function GET_mine(req: NextRequest) {
  const off = await moduleGuard('paywall')
  if (off) return off
  const user = await requireUser(req)
  if (!user) return err('ابتدا وارد حساب خود شوید', 401)
  return ok({ purchases: await myPurchases(user.id) })
}
