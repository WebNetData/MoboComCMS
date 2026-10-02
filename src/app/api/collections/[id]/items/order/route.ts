import type { NextRequest } from 'next/server'
import { collectionAuth, collectionBody, collectionFailure } from '@/modules/content/server/collections-http'
import { collectionId, moveCollectionItem } from '@/modules/content/server/collections'
import { ok } from '@/platform/http/response'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await collectionAuth(req)
  if (auth.response) return auth.response
  try { const body = await collectionBody(req); return ok(await moveCollectionItem(auth.userId!, collectionId((await params).id), body.item, body.direction)) } catch (error) { return collectionFailure(error) }
}
