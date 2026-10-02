import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { publicCollections } from '@/modules/content/server/collections'
import { err, ok } from '@/platform/http/response'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'cms.posts')) return err('forbidden', 403)
  return ok(await publicCollections(req.nextUrl.searchParams.get('page')))
}
