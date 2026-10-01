import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import { collectionId, CollectionError, featureCollection } from '@/modules/content/server/collections'
import { auditAdmin } from '@/platform/audit/server'
import { err, ok } from '@/platform/http/response'

type Context = { params: Promise<{ id: string }> }

async function set(req: NextRequest, { params }: Context, on: boolean) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const admin = await requirePerm(req, 'cms.posts')
  if (!admin) return err('forbidden', 403)
  try {
    const id = collectionId((await params).id)
    const result = await featureCollection(id, on)
    await auditAdmin({ req, actor: admin, action: on ? 'collection.feature' : 'collection.unfeature', targetType: 'UserCollection', targetId: id })
    return ok(result)
  } catch (error) { return error instanceof CollectionError ? err(error.message, error.status) : err('Unable to curate collection', 500) }
}

export async function PUT(req: NextRequest, context: Context) { return set(req, context, true) }
export async function DELETE(req: NextRequest, context: Context) { return set(req, context, false) }
