import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { moduleGuard } from '@/extensions/server/modules'
import { requireUser } from '@/modules/identity/server/access'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import { deleteOwnPostComment } from '@/modules/journal/server/comment-delete'

export const dynamic = 'force-dynamic'

/** DELETE /api/account/article-comments/:id — a member removes their own article comment. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const off = await moduleGuard('journal')
  if (off) return off
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const id = Number((await params).id)
  if (!Number.isSafeInteger(id) || id <= 0) return err('invalid comment')
  if (!rateLimitHit(`post-comment-delete:${user.id}`, 30, 3_600_000).ok) return err('Please try again later / کمی بعد دوباره تلاش کنید', 429)
  const result = await deleteOwnPostComment(user.id, id)
  // Someone else's comment and a missing one answer alike.
  return result.deleted ? ok(result) : err('not found', 404)
}
