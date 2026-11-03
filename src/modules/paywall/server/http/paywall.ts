import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { moduleGuard } from '@/extensions/server/modules'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { db } from '@/platform/database/prisma'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { requireUser } from '@/modules/identity/server/access'
import { PaywallError, isOwnerType, parseContentKey, type OwnerType } from '@/modules/paywall/domain/paywall'
import { adminGrant, getPaidItem, myPurchases, paywallOverview, removePaidItem, revokePurchase, savePaidItem } from '@/modules/paywall/server/paywall'

/** Section editors may price their own items; the paid content page needs its own permission. */
const SECTION_PERMS: Record<OwnerType, string[]> = {
  post: ['cms.posts'], software: ['software.manage'], game: ['games.manage'],
  title: ['cinema.manage'], album: ['music.manage'], track: ['music.manage'],
  link: [], prompt: ['prompts.manage'],
}
const LINK_PERMS: Record<string, string[]> = { title: SECTION_PERMS.title, episode: SECTION_PERMS.title, game: SECTION_PERMS.game, gameupdate: SECTION_PERMS.game, software: SECTION_PERMS.software }

/** A link is priced by whoever manages the section it belongs to. */
async function sectionPerms(owner: { ownerType: OwnerType; ownerId: number }) {
  if (owner.ownerType !== 'link') return SECTION_PERMS[owner.ownerType]
  const link = await db.mediaLink.findUnique({ where: { id: owner.ownerId }, select: { ownerType: true } }).catch(() => null)
  return link ? LINK_PERMS[link.ownerType] || [] : []
}
const MANAGE = ['paywall.manage', 'membership.manage', 'settings.manage']

const failure = (error: unknown) => {
  if (error instanceof PaywallError) return err(error.message, error.status, { code: error.code })
  if (error instanceof JsonBodyError) return err(error.message, error.status)
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
  const guard = await adminGuard(req, null, owner ? [...MANAGE, ...await sectionPerms(owner)] : MANAGE)
  if ('response' in guard) return guard.response
  if (owner) return ok(await getPaidItem(owner.ownerType, owner.ownerId))
  const q = req.nextUrl.searchParams
  return ok(await paywallOverview({ type: q.get('type') || '', q: q.get('q') || '' }))
}

/** PUT /api/admin/paywall — set the price of one item. */
export async function PUT(req: NextRequest) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('درخواست باید از همین سایت ارسال شود', 403)
  let body: Record<string, unknown>
  try { body = await readJsonObject(req, 65536) } catch (error) { return failure(error) }
  const owner = ownerFrom(req, body)
  if (!owner) return err('مورد نامعتبر است', 400)
  const permissions = [...MANAGE, ...await sectionPerms(owner)]
  const guard = await adminGuard(req, null, permissions)
  if ('response' in guard) return guard.response
  try {
    const item = await savePaidItem(owner.ownerType, owner.ownerId, body, { req, permissions })
    return ok({ item })
  } catch (error) { return failure(error) }
}

/** DELETE /api/admin/paywall?ownerType=&ownerId= — takes the price off; the item follows its normal access again. */
export async function DELETE(req: NextRequest) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('درخواست باید از همین سایت ارسال شود', 403)
  const owner = ownerFrom(req)
  if (!owner) return err('مورد نامعتبر است', 400)
  const permissions = [...MANAGE, ...await sectionPerms(owner)]
  const guard = await adminGuard(req, null, permissions)
  if ('response' in guard) return guard.response
  try { await removePaidItem(owner.ownerType, owner.ownerId, req.nextUrl.searchParams.get('revision') ?? undefined, { req, permissions }); return ok({ removed: true }) } catch (error) { return failure(error) }
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
