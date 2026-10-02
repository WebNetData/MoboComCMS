import type { NextRequest } from 'next/server'
import { collectionAuth, collectionBody, collectionFailure } from '@/modules/content/server/collections-http'
import { createCollection, myCollections } from '@/modules/content/server/collections'
import { ok } from '@/platform/http/response'

export async function GET(req: NextRequest) {
  const auth = await collectionAuth(req)
  if (auth.response) return auth.response
  try { return ok(await myCollections(auth.userId!)) } catch (error) { return collectionFailure(error) }
}

export async function POST(req: NextRequest) {
  const auth = await collectionAuth(req)
  if (auth.response) return auth.response
  try { return ok(await createCollection(auth.userId!, await collectionBody(req)), 201) } catch (error) { return collectionFailure(error) }
}
