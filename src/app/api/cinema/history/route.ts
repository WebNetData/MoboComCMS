import type { NextRequest } from 'next/server'
import { requireUser } from '@/modules/identity/server/access'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import { clearWatchHistory } from '@/modules/cinema/server/progress'
import { err, ok } from '@/platform/http/response'

export async function DELETE(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const user = await requireUser(req)
  if (!user) return err('Unauthorized', 401)
  return ok(await clearWatchHistory(user.id))
}
