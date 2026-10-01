import type { NextRequest } from 'next/server'
import { collectionAuth, collectionBody, collectionFailure } from '@/modules/content/server/collections-http'
import { addCollectionItem, collectionId, removeCollectionItem } from '@/modules/content/server/collections'
import { ok } from '@/platform/http/response'

type Context = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Context) {
  const auth = await collectionAuth(req)
  if (auth.response) return auth.response
  try { return ok(await addCollectionItem(auth.userId!, collectionId((await params).id), (await collectionBody(req)).item)) } catch (error) { return collectionFailure(error) }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const auth = await collectionAuth(req)
  if (auth.response) return auth.response
  try { return ok(await removeCollectionItem(auth.userId!, collectionId((await params).id), req.nextUrl.searchParams.get('item'))) } catch (error) { return collectionFailure(error) }
}
