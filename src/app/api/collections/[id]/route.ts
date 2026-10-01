import type { NextRequest } from 'next/server'
import { collectionAuth, collectionBody, collectionFailure } from '@/modules/content/server/collections-http'
import { collectionId, deleteCollection, updateCollection } from '@/modules/content/server/collections'
import { ok } from '@/platform/http/response'

type Context = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Context) {
  const auth = await collectionAuth(req)
  if (auth.response) return auth.response
  try { return ok(await updateCollection(auth.userId!, collectionId((await params).id), await collectionBody(req))) } catch (error) { return collectionFailure(error) }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const auth = await collectionAuth(req)
  if (auth.response) return auth.response
  try { return ok(await deleteCollection(auth.userId!, collectionId((await params).id))) } catch (error) { return collectionFailure(error) }
}
