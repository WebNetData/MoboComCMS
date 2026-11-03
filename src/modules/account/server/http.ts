import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { minorToNumber, normalizeCurrency } from '@/shared/money'
import { AUDIENCE_ITEMS, isAudienceItem, parseAudience } from '@/modules/account/domain/item-audience'
import { GroupError } from '@/modules/account/domain/user-groups'
import { MAINTENANCE_SECTIONS } from '@/modules/site/domain/maintenance'
import { siteGroupCatalog } from '@/modules/account/server/site-groups'
import { adminGroups, groupMembers } from '@/modules/account/server/user-groups'
import { loadSectionAccess, saveSectionAccess } from '@/modules/account/server/section-access'
import { reindexItem } from '@/modules/search/server/search'
import { audienceSnapshot, saveItemAudience } from '@/modules/account/server/audience-command'
import { logEvent } from '@/platform/observability/logger'
import { writeUserGroup } from '@/modules/account/server/group-command'
import { memberGroupsSnapshot } from '@/modules/account/server/member-groups'
import { RevisionError } from '@/modules/content/server/revisions'
import { JsonSettingMutationError, sectionSettingsRevision } from '@/modules/settings/server'

const positiveId = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : 0 }

const GROUPS = ['users.manage']

/** GET /api/admin/user-groups — groups, every site group, section access; ?group=&q=&page= a group's members. */
export async function GET_groups(req: NextRequest) {
  const g = await adminGuard(req, null, GROUPS)
  if ('response' in g) return g.response
  const url = req.nextUrl.searchParams, group = positiveId(url.get('group'))
  if (url.has('userId')) {
    const id = positiveId(url.get('userId'))
    if (!id) return err('شناسهٔ کاربر معتبر نیست')
    try { const response = ok(await memberGroupsSnapshot(id)); response.headers.set('Cache-Control', 'private, no-store'); return response } catch (error) { if (error instanceof GroupError) return err(error.message, error.status); throw error }
  }
  if (url.has('group') && !group) return err('شناسهٔ گروه معتبر نیست')
  if (group) return ok(await groupMembers(group, url.get('q') || '', Math.max(1, Math.min(1000000, Math.floor(Number(url.get('page')) || 1)))))
  const [groups, catalog, access] = await Promise.all([adminGroups(), siteGroupCatalog(), loadSectionAccess(true)])
  return ok({ groups, catalog, access, accessRevision: sectionSettingsRevision(access), sections: MAINTENANCE_SECTIONS.map((section) => ({ id: section.id, label: section.label })) })
}

/** POST /api/admin/user-groups { op: save | delete | member.add | member.remove | sections, … } */
export async function POST_groups(req: NextRequest) {
  const g = await adminGuard(req, null, GROUPS)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  try {
    if (body?.op === 'sections') {
      await saveSectionAccess(body.access, { req, actor: g.admin, expected: typeof body.revision === 'string' ? body.revision : null })
      return ok({ access: await loadSectionAccess(true) })
    }
    return ok(await writeUserGroup(req, body || {}))
  } catch (error) {
    if (error instanceof GroupError || error instanceof RevisionError) return err(error.message, error.status)
    if (error instanceof JsonSettingMutationError) return err('تنظیمات ذخیره‌شده معتبر نیست؛ چیزی تغییر نکرد', 409)
    throw error
  }
}

const itemGuard = (req: NextRequest, type: keyof typeof AUDIENCE_ITEMS) => adminGuard(req, null, [AUDIENCE_ITEMS[type].permission])

/** GET /api/admin/item-audience?type=&id= — who sees an item, every site group, and a product's group prices. */
export async function GET_item(req: NextRequest) {
  const url = req.nextUrl.searchParams, type = url.get('type'), id = positiveId(url.get('id'))
  if (!isAudienceItem(type) || !id) return err('not found', 404)
  const g = await itemGuard(req, type)
  if ('response' in g) return g.response
  let snapshot
  try { snapshot = await audienceSnapshot(type, id) } catch (error) { if (error instanceof GroupError) return err(error.message, error.status); throw error }
  const [catalog, groups] = await Promise.all([
    siteGroupCatalog(),
    type === 'product' ? db.userGroup.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, active: true } }) : [],
  ])
  const currency = normalizeCurrency(snapshot.item.currency)
  return ok({ groups: parseAudience(snapshot.item.audienceGroups), limited: !!snapshot.item.audienceGroups, revision: snapshot.revision, catalog, userGroups: groups, currency, pricingRules: snapshot.pricingRules, basePrice: String(minorToNumber(snapshot.item.priceMinor || 0n, currency)), legacyVipPrice: String(minorToNumber(snapshot.item.memberPriceMinor || 0n, currency)), fileDelivery: snapshot.item.kind === 'VIRTUAL' && snapshot.item.digitalMode === 'FILES', prices: Object.fromEntries(snapshot.prices.filter(item => item.mode === 'PRICE').map((item) => [item.groupId, String(minorToNumber(item.priceMinor, currency))])) })
}

/** POST /api/admin/item-audience { type, id, groups, prices? } — prices are { groupId: amount in the product's currency }. */
export async function POST_item(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const type = body?.type, id = positiveId(body?.id)
  if (!isAudienceItem(type) || !id) return err('not found', 404)
  const g = await itemGuard(req, type)
  if ('response' in g) return g.response
  let saved
  try { saved = await saveItemAudience(req, type, id, body) } catch (error) { if (error instanceof GroupError) return err(error.message, error.status); throw error }
  // A limited item leaves the search index; opened again, it returns. An album's tracks follow it.
  const tracks = type === 'album' ? await db.musicTrack.findMany({ where: { albumId: id }, select: { id: true } }) : []
  const indexed = await Promise.allSettled([{ type, id }, ...tracks.map((track) => ({ type: 'track' as const, id: track.id }))].map(ref => reindexItem(ref)))
  const indexPending = indexed.some(result => result.status === 'rejected')
  if (indexPending) logEvent('error', 'account.audience_index_pending', { type, id })
  return ok({ ok: true, revision: saved.revision, indexPending })
}
