import type { NextRequest } from 'next/server'
import { requireUser } from '@/modules/identity/server/access'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import { clearRecentViews, recordRecentView } from '@/modules/content/server/recent-views'
import { err, ok } from '@/platform/http/response'

export async function POST(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const user = await requireUser(req)
  if (!user) return err('Unauthorized', 401)
  const body = await req.json().catch(() => null)
  if (typeof body?.item !== 'string' || body.item.length > 32) return err('Invalid item', 400)
  return await recordRecentView(user.id, body.item) ? ok({ recorded: true }) : err('Item unavailable', 404)
}

export async function DELETE(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const user = await requireUser(req)
  if (!user) return err('Unauthorized', 401)
  return ok(await clearRecentViews(user.id))
}
