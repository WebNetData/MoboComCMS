import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import { contentChanged } from '@/modules/content/server/events'
import { restoreValues } from '@/modules/content/domain/revisions'
import { RevisionError, listRevisions, recordRevision, revisionDetail, revisionSnapshot } from '@/modules/content/server/revisions'

// The history of an item for staff, and putting an earlier version back. Who may read or restore the
// history of an item is whoever may edit that item: the permission comes from the item's own owner.

type Owner = { perms: readonly string[]; module: string | null; current: (id: number) => Promise<Record<string, unknown> | null>; restore: (id: number, values: (current: Record<string, unknown>) => Record<string, unknown>) => Promise<{ before: Record<string, unknown>; after: Record<string, unknown> }> }

const cms = (model: 'post' | 'page', perm: string, itemType: 'post' | null): Owner => ({
  perms: [perm], module: model === 'post' ? 'journal' : null,
  current: (id) => (model === 'post' ? db.post.findUnique({ where: { id } }) : db.page.findUnique({ where: { id } })) as Promise<Record<string, unknown> | null>,
  restore: async (id, values) => {
    const delegate = (model === 'post' ? db.post : db.page) as unknown as { findUnique: (args: unknown) => Promise<Record<string, unknown> | null>; update: (args: unknown) => Promise<Record<string, unknown>> }
    const before = await delegate.findUnique({ where: { id } })
    if (!before) throw new RevisionError('این مورد پیدا نشد', 404)
    const after = await delegate.update({ where: { id }, data: values(before) })
    if (itemType) contentChanged({ type: itemType, id }, before, after)
    return { before, after }
  },
})

async function ownerOf(type: string): Promise<Owner | null> {
  if (type === 'posts') return cms('post', 'cms.posts', 'post')
  if (type === 'pages') return cms('page', 'cms.pages', null)
  const media = await import('@/modules/media/server/admin')
  const resource = media.mediaResource(type)
  return resource ? { perms: resource.perms, module: resource.module, current: (id) => media.mediaItemRow(type, id), restore: (id, values) => media.restoreMediaItem(type, id, values) } : null
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
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const body = (await req.json().catch(() => null)) || {}
  const type = String(body.type || ''), id = idOf(body.id), version = idOf(body.version)
  const owner = await ownerOf(type)
  if (!owner || !id || !version) return err('درخواست معتبر نیست', 400)
  const g = await adminGuard(req, owner.module, owner.perms)
  if ('response' in g) return g.response
  try {
    const snapshot = await revisionSnapshot(type, id, version)
    const { before, after } = await owner.restore(id, (current) => restoreValues(snapshot, current))
    const made = await recordRevision({ entityType: type, entityId: id, before, after, actor: g.admin, source: 'restore' })
    await auditAdmin({ req, actor: g.admin, action: 'content.restore', targetType: type, targetId: id, metadata: { version, newVersion: made } })
    return ok({ restored: version, version: made })
  } catch (error) {
    if (error instanceof RevisionError) return err(error.message, error.status)
    // Another item took a unique value (an address) since that version: the restore is refused, nothing is changed.
    if ((error as { code?: string }).code === 'P2002') return err('این نسخه قابل بازگردانی نیست: نشانی یا مقدار یکتای آن حالا متعلق به مورد دیگری است', 409)
    console.error('[content.history]', error)
    return err('خطای داخلی؛ دوباره تلاش کنید', 500)
  }
}
