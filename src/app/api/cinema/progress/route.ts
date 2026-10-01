import type { NextRequest } from 'next/server'
import { requireUser } from '@/modules/identity/server/access'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import { saveCinemaWatchProgress } from '@/modules/media/server/links'
import { err, ok } from '@/platform/http/response'

export async function PUT(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const user = await requireUser(req)
  if (!user) return err('Unauthorized', 401)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Invalid progress', 400)
  const result = await saveCinemaWatchProgress(user.id, Number(body.linkId), Number(body.positionSeconds), Number(body.durationSeconds))
  return result ? ok(result) : err('Playback unavailable', 404)
}
