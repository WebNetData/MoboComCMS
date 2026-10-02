import type { NextRequest } from 'next/server'
import { collectionAuth, collectionFailure } from '@/modules/content/server/collections-http'
import { collectionId, followCollection } from '@/modules/content/server/collections'
import { ok } from '@/platform/http/response'

type Context = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Context) {
  const auth = await collectionAuth(req)
  if (auth.response) return auth.response
  try { return ok(await followCollection(auth.userId!, collectionId((await params).id), true)) } catch (error) { return collectionFailure(error) }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const auth = await collectionAuth(req)
  if (auth.response) return auth.response
  try { return ok(await followCollection(auth.userId!, collectionId((await params).id), false)) } catch (error) { return collectionFailure(error) }
}
