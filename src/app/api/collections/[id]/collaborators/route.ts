import type { NextRequest } from 'next/server'
import { collectionAuth, collectionBody, collectionFailure } from '@/modules/content/server/collections-http'
import { addCollectionCollaborator, collectionId, removeCollectionCollaborator } from '@/modules/content/server/collections'
import { ok } from '@/platform/http/response'

type Context = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Context) {
  const auth = await collectionAuth(req)
  if (auth.response) return auth.response
  try { return ok(await addCollectionCollaborator(auth.userId!, collectionId((await params).id), (await collectionBody(req)).email)) } catch (error) { return collectionFailure(error) }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const auth = await collectionAuth(req)
  if (auth.response) return auth.response
  try { return ok(await removeCollectionCollaborator(auth.userId!, collectionId((await params).id), collectionId(req.nextUrl.searchParams.get('userId')))) } catch (error) { return collectionFailure(error) }
}
