import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { CONTENT_EDIT_PERMISSIONS } from '@/modules/identity/rbac'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import {
  CollectionError, addEditorialItem, adminCollections, collectionId, createEditorialCollection, deleteEditorialCollection, featureCollection, getCollection,
  moveEditorialItem, publishEditorialCollection, removeEditorialItem, updateEditorialCollection,
} from '@/modules/content/server/collections'

// Collections in the admin panel: selecting members' public lists, and writing the site's own. A collection
// holds items of every section, so any content permission opens it, not one section's.
const guard = (req: NextRequest) => adminGuard(req, null, CONTENT_EDIT_PERMISSIONS)
type Context = { params: Promise<{ id: string }> }
const failure = (error: unknown) => (error instanceof CollectionError ? err(error.message, error.status) : err('Unable to change the collection', 500))

/** GET /api/admin/collections?page= · ?find=<text> (items to add: published ones, by the site search) */
export async function GET_collections(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const find = req.nextUrl.searchParams.get('find')
  if (find !== null) {
    const { searchSite } = await import('@/modules/search/server/search')
    const result = await searchSite({ q: find, log: false, suggestion: true })
    return ok({ items: result.hits.slice(0, 12).map((hit) => ({ key: `${hit.type}:${hit.id}`, type: hit.type, title: hit.title, subtitle: hit.subtitle, image: hit.image })) })
  }
  return ok(await adminCollections(req.nextUrl.searchParams.get('page')))
}

/** POST /api/admin/collections { title, description?, cover? } — a new draft written for the site. */
export async function POST_collections(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const g = await guard(req)
  if ('response' in g) return g.response
  try {
    const body = (await req.json().catch(() => null)) || {}
    const created = await createEditorialCollection(g.admin.id, body)
    await auditAdmin({ req, actor: g.admin, action: 'collection.editorial.create', targetType: 'UserCollection', targetId: created.id })
    return ok(created, 201)
  } catch (error) { return failure(error) }
}

/** GET /api/admin/collections/:id — a staff collection with its items, draft or published. */
export async function GET_collection(req: NextRequest, { params }: Context) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try {
    const detail = await getCollection(collectionId((await params).id), null, undefined, true)
    return detail.staffAuthored ? ok(detail) : err('Collection unavailable', 404)
  } catch (error) { return failure(error) }
}

/** PATCH /api/admin/collections/:id { title?, description?, cover? } | { publish: boolean } | { item, action: add | remove | up | down } */
export async function PATCH_collection(req: NextRequest, { params }: Context) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const g = await guard(req)
  if ('response' in g) return g.response
  try {
    const id = collectionId((await params).id)
    const body = (await req.json().catch(() => null)) || {}
    let result: Record<string, unknown>
    let action = 'update'
    if (typeof body.publish === 'boolean') { result = await publishEditorialCollection(id, body.publish); action = body.publish ? 'publish' : 'withdraw' }
    else if (body.item !== undefined) {
      action = `item.${String(body.action)}`
      if (body.action === 'add') result = await addEditorialItem(id, body.item)
      else if (body.action === 'remove') result = await removeEditorialItem(id, body.item)
      else if (body.action === 'up' || body.action === 'down') result = await moveEditorialItem(id, body.item, body.action)
      else return err('Unknown action', 400)
    } else result = await updateEditorialCollection(id, body)
    await auditAdmin({ req, actor: g.admin, action: `collection.editorial.${action}`, targetType: 'UserCollection', targetId: id, metadata: body.item !== undefined ? { item: String(body.item).slice(0, 60) } : undefined })
    return ok(result)
  } catch (error) { return failure(error) }
}

/** DELETE /api/admin/collections/:id — removes a staff collection for good. */
export async function DELETE_collection(req: NextRequest, { params }: Context) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const g = await guard(req)
  if ('response' in g) return g.response
  try {
    const id = collectionId((await params).id)
    const result = await deleteEditorialCollection(id)
    await auditAdmin({ req, actor: g.admin, action: 'collection.editorial.delete', targetType: 'UserCollection', targetId: id })
    return ok(result)
  } catch (error) { return failure(error) }
}

/** PUT | DELETE /api/admin/collections/:id/feature — selects a member's public list for the site, or releases it. */
export async function setFeatured(req: NextRequest, { params }: Context, on: boolean) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const g = await guard(req)
  if ('response' in g) return g.response
  try {
    const id = collectionId((await params).id)
    const result = await featureCollection(id, on)
    await auditAdmin({ req, actor: g.admin, action: on ? 'collection.feature' : 'collection.unfeature', targetType: 'UserCollection', targetId: id })
    return ok(result)
  } catch (error) { return failure(error) }
}
