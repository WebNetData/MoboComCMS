import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdminStrict } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject } from '@/platform/http/read-json'
import { contentChanged } from '@/modules/content/server/events'
import { restoreValues, type Snapshot } from '@/modules/content/domain/revisions'
import { RevisionError, listRevisions, recordRevision, revisionDetail, revisionSnapshot, type RestoreCommit } from '@/modules/content/server/revisions'

// The history of an item for staff, and putting an earlier version back. Who may read or restore the
// history of an item is whoever may edit that item: the permission comes from the item's own owner.

/** `extraPerms`: what putting back a particular version also needs (a builder version that adds script code). */
type Owner = { requiredPerms?: readonly string[]; perms: readonly string[]; module: string | null; extraPerms?: (snapshot: Snapshot) => Promise<string[]>; current: (id: number) => Promise<Record<string, unknown> | null>; restore: (id: number, snapshot: Snapshot, commit: RestoreCommit) => Promise<{ before: Record<string, unknown>; after: Record<string, unknown> }> }

async function ownerOf(type: string): Promise<Owner | null> {
  const { pageIdOfHistoryType, builderHistoryOwner } = await import('@/modules/site/server/builder')
  const builderPage = pageIdOfHistoryType(type)
  if (builderPage) return builderHistoryOwner(builderPage)
  if (type === 'settings-content-pdf') {
    const { pdfSettingsState, restorePdfSettings } = await import('@/modules/content/server/pdf')
    return { perms: ['content-pdf.manage', 'settings.manage'], module: 'content-pdf', current: pdfSettingsState, restore: restorePdfSettings }
  }
  if (type === 'settings-human-check') {
    const { humanCheckSettingsState, restoreHumanCheckSettings } = await import('@/modules/identity/server/human-check')
    return { perms: ['settings.manage'], module: null, current: humanCheckSettingsState, restore: restoreHumanCheckSettings }
  }
  if (type === 'settings-livechat') {
    const { chatSettingsState, restoreChatSettings } = await import('@/modules/livechat/server/livechat')
    return { perms: ['settings.manage', 'support.chat'], module: 'livechat', current: () => chatSettingsState(), restore: restoreChatSettings }
  }
  if (type === 'settings-maintenance') {
    const { maintenanceSettingsState, restoreMaintenanceSettings } = await import('@/modules/site/server/maintenance')
    return { perms: ['settings.manage'], module: null, current: () => maintenanceSettingsState(), restore: restoreMaintenanceSettings }
  }
  if (type === 'settings-section-access') {
    const { sectionAccessSettingsState, restoreSectionAccessSettings } = await import('@/modules/account/server/section-access')
    return { perms: ['users.manage'], module: null, current: sectionAccessSettingsState, restore: restoreSectionAccessSettings }
  }
  if (type === 'settings-site') {
    const { siteSettingsState, restoreSiteSettings } = await import('@/modules/site/server/revision-state')
    return { perms: ['settings.manage'], module: null, current: siteSettingsState, restore: restoreSiteSettings }
  }
  if (type === 'settings-navigation') {
    const { navigationSettingsState, restoreNavigationSettings } = await import('@/modules/navigation/server/megamenu')
    return { perms: ['settings.manage'], module: 'mega-menu', current: navigationSettingsState, restore: restoreNavigationSettings }
  }
  if (type === 'settings-media') {
    const { mediaSettingsState, restoreMediaSettings } = await import('@/modules/media/server/admin')
    return { perms: ['settings.manage'], module: null, current: mediaSettingsState, restore: restoreMediaSettings }
  }
  if (type === 'settings-notifications') {
    const { notificationSettingsState, restoreNotificationSettings } = await import('@/modules/notifications/server/policy')
    return { perms: ['settings.manage'], module: null, current: notificationSettingsState, restore: restoreNotificationSettings }
  }
  if (type === 'settings-businesses') {
    const { businessSettingsState, restoreBusinessSettings } = await import('@/modules/businesses/server/businesses')
    return { perms: ['settings.manage'], module: null, current: businessSettingsState, restore: restoreBusinessSettings }
  }
  if (type === 'settings-journal') {
    const { journalSettingsState, restoreJournalSettings } = await import('@/modules/journal/server/admin')
    return { perms: ['cms.posts', 'settings.manage'], module: 'journal', current: () => journalSettingsState(), restore: restoreJournalSettings }
  }
  if (type === 'settings-cinema') {
    const { cinemaSettingsState, restoreCinemaSettings } = await import('@/modules/cinema/server/admin')
    return { perms: ['cinema.manage', 'settings.manage'], module: 'cinema', current: () => cinemaSettingsState(), restore: restoreCinemaSettings }
  }
  if (type === 'settings-music') {
    const { musicSettingsState, restoreMusicSettings } = await import('@/modules/music/server/admin')
    return { perms: ['music.manage', 'settings.manage'], module: 'music', current: () => musicSettingsState(), restore: restoreMusicSettings }
  }
  if (type === 'settings-games') {
    const { gamesSettingsState, restoreGamesSettings } = await import('@/modules/games/server/portal')
    return { perms: ['games.manage', 'settings.manage'], module: 'games', current: () => gamesSettingsState(), restore: restoreGamesSettings }
  }
  if (type === 'settings-software') {
    const { softwareSettingsState, restoreSoftwareSettings } = await import('@/modules/software/server/admin')
    return { perms: ['software.manage', 'settings.manage'], module: 'software', current: () => softwareSettingsState(), restore: restoreSoftwareSettings }
  }
  if (type === 'settings-general') {
    const { generalSettingsState, restoreGeneralSettings } = await import('@/modules/settings/server')
    return { perms: ['settings.manage'], module: null, current: () => generalSettingsState(), restore: restoreGeneralSettings }
  }
  if (type === 'settings-delivery') {
    const { deliverySettingsState, restoreDeliverySettings } = await import('@/modules/shipping/server/shipping')
    return { perms: ['orders.manage', 'settings.manage'], module: 'store', current: () => deliverySettingsState(), restore: restoreDeliverySettings }
  }
  if (type === 'settings-storefront') {
    const { storefrontSettingsState, restoreStorefrontSettings } = await import('@/modules/store/server/catalog')
    return { perms: ['settings.manage', 'cms.products'], module: 'store', current: () => storefrontSettingsState(), restore: restoreStorefrontSettings }
  }
  if (type === 'settings-returns') {
    const { returnSettingsState, restoreReturnSettings } = await import('@/modules/store/server/returns')
    return { perms: ['settings.manage', 'orders.manage'], module: 'store', current: () => returnSettingsState(), restore: restoreReturnSettings }
  }
  if (type === 'settings-section-names') {
    const { sectionNamesState, restoreSectionNames } = await import('@/modules/site/server/section-names')
    return { perms: ['settings.manage'], module: null, current: sectionNamesState, restore: restoreSectionNames }
  }
  if (type === 'settings-watermark') {
    const { watermarkSettingsState, restoreWatermarkSettings } = await import('@/modules/watermark/server/watermark')
    return { perms: ['settings.manage'], module: null, current: () => watermarkSettingsState(), restore: restoreWatermarkSettings }
  }
  if (type === 'settings-crm-engagement') {
    const { engagementSettingsState, restoreEngagementSettings } = await import('@/modules/automation/server/engagement')
    return { perms: ['automation.manage'], requiredPerms: ['users.manage'], module: null, current: () => engagementSettingsState(), restore: restoreEngagementSettings }
  }
  if (type === 'settings-profile-fields') {
    const { profileFieldsSettingsState, restoreProfileFieldsSettings } = await import('@/modules/identity/server/profile-fields')
    return { perms: ['users.manage', 'settings.manage'], module: null, current: () => profileFieldsSettingsState(), restore: restoreProfileFieldsSettings }
  }
  if (type === 'settings-trust-seals') {
    const { trustSealsSettingsState, restoreTrustSealsSettings } = await import('@/modules/site/config/store')
    return { perms: ['settings.manage'], module: null, current: () => trustSealsSettingsState(), restore: restoreTrustSealsSettings }
  }
  if (type === 'settings-seo') {
    const { seoSettingsState, restoreSeoSettings } = await import('@/modules/seo/server/config')
    return { perms: ['settings.manage'], module: null, current: () => seoSettingsState(), restore: restoreSeoSettings }
  }
  if (type === 'patterns-pages' || type === 'patterns-posts') {
    const entity = type === 'patterns-pages' ? 'pages' : 'posts'
    const [{ patternHistoryOwner }, { documentPermission }] = await Promise.all([import('@/modules/editor/server/patterns'), import('@/modules/editor/server/documents')])
    const owner = patternHistoryOwner(entity)
    return { perms: [documentPermission(entity)], module: 'block-editor', current: owner.current, restore: owner.restore }
  }
  if (type === 'settings-forum') {
    const { forumSettingsState, restoreForumSettings } = await import('@/modules/forum/server/community')
    return { perms: ['forum.moderate'], module: 'forum', current: () => forumSettingsState(), restore: restoreForumSettings }
  }
  if (type === 'posts') {
    const { postRevisionState, restorePostRevision } = await import('@/modules/site/server/revision-state')
    return { perms: ['cms.posts'], module: 'journal', current: postRevisionState, restore: async (id, snapshot, commit) => { const result = await restorePostRevision(id, snapshot, commit); contentChanged({ type: 'post', id }, result.before, result.after); return result } }
  }
  if (type === 'products') {
    const { productRevisionState, restoreProductRevision } = await import('@/modules/catalog/server/revision-state')
    return { perms: ['cms.products'], module: 'store', current: productRevisionState, restore: async (id, snapshot, commit) => { const result = await restoreProductRevision(id, snapshot, commit); contentChanged({ type: 'product', id }, result.before, result.after); return result } }
  }
  if (type === 'pages') {
    const { pageRevisionState, restorePageRevision } = await import('@/modules/site/server/revision-state')
    return { perms: ['cms.pages'], module: null, current: pageRevisionState, restore: restorePageRevision }
  }
  const media = await import('@/modules/media/server/admin')
  const resource = media.mediaResource(type)
  return resource ? { perms: resource.perms, module: resource.module, current: (id) => media.mediaItemRow(type, id), restore: (id, snapshot, commit) => media.restoreMediaItem(type, id, current => restoreValues(snapshot, current), commit) } : null
}

const idOf = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0 }

/** GET /api/admin/history?type=&id=[&version=] — the versions of an item, or what one version changed. */
export async function GET_history(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const type = String(params.get('type') || ''), id = idOf(params.get('id'))
  const owner = await ownerOf(type)
  if (!owner || !id) return err('نوع یا شناسه معتبر نیست', 400)
  const g = await adminGuard(req, owner.module, owner.perms)
  if ('response' in g) return g.response
  for (const permission of owner.requiredPerms || []) if (!await requirePerm(req, permission)) return err('دسترسی کافی نیست', 403)
  try {
    const version = idOf(params.get('version'))
    if (version) return ok(await revisionDetail(type, id, version))
    // Where the item came from, when an import made or changed it: read from what the importer records.
    const { IMPORTED_AS, itemProvenance } = await import('@/modules/imports/server/provenance')
    const provenance = IMPORTED_AS[type] ? await itemProvenance(IMPORTED_AS[type], id, await owner.current(id)).catch(() => null) : null
    return ok({ type, id, versions: await listRevisions(type, id), provenance })
  } catch (error) { return error instanceof RevisionError ? err(error.message, error.status) : err('خطای داخلی', 500) }
}

/** POST /api/admin/history { type, id, version } — puts the item's own fields back as they were in that version. */
export async function POST_history(req: NextRequest) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  let body: Record<string, unknown>
  try { body = await readJsonObject(req, 8192) } catch { return err('درخواست معتبر نیست', 422) }
  const type = String(body.type || ''), id = idOf(body.id), version = idOf(body.version)
  const owner = await ownerOf(type)
  if (!owner || !id || !version) return err('درخواست معتبر نیست', 400)
  const g = await adminGuard(req, owner.module, owner.perms)
  if ('response' in g) return g.response
  for (const permission of owner.requiredPerms || []) if (!await requirePerm(req, permission)) return err('دسترسی کافی نیست', 403)
  try {
    const snapshot = await revisionSnapshot(type, id, version)
    const extra = await owner.extraPerms?.(snapshot)
    if (extra?.length) { const allowed = await adminGuard(req, owner.module, extra); if ('response' in allowed) return allowed.response }
    let made: number | null = null
    await owner.restore(id, snapshot, async (tx, before, after) => {
      made = await recordRevision({ entityType: type, entityId: id, before, after, actor: g.admin, source: 'restore', client: tx, strict: true })
      await auditAdminStrict({ req, actor: g.admin, action: 'content.restore', targetType: type, targetId: id, metadata: { version, newVersion: made } }, tx)
    })
    return ok({ restored: version, version: made })
  } catch (error) {
    if (error instanceof RevisionError) return err(error.message, error.status)
    if ((error as { code?: string }).code === 'P2034' || (error as { status?: number }).status === 409) return err('این مورد هم‌زمان تغییر کرده است؛ دوباره بررسی کنید', 409)
    if ((error as { status?: number }).status === 404) return err('این مورد پیدا نشد', 404)
    // Another item took a unique value (an address) since that version: the restore is refused, nothing is changed.
    if ((error as { code?: string }).code === 'P2002') return err('این نسخه قابل بازگردانی نیست: نشانی یا مقدار یکتای آن حالا متعلق به مورد دیگری است', 409)
    console.error('[content.history]', error)
    return err('خطای داخلی؛ دوباره تلاش کنید', 500)
  }
}
