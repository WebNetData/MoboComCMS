import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { NO_PLAYBACK_PREFS, mergePlaybackPrefs, normalizePlaybackPrefs, type PlaybackPrefs } from '@/modules/media/domain/playback-prefs'

/** A member's playback preferences; a visitor has none. */
export async function getPlaybackPrefs(userId: number | null | undefined): Promise<PlaybackPrefs> {
  if (!userId) return NO_PLAYBACK_PREFS
  const row = await db.user.findUnique({ where: { id: userId }, select: { playbackPrefs: true } }).catch(() => null)
  return row ? normalizePlaybackPrefs(row.playbackPrefs) : NO_PLAYBACK_PREFS
}

export async function savePlaybackPrefs(userId: number, patch: unknown): Promise<PlaybackPrefs> {
  const next = mergePlaybackPrefs(await getPlaybackPrefs(userId), patch)
  await db.user.update({ where: { id: userId }, data: { playbackPrefs: JSON.stringify(next) } })
  return next
}

/** GET /api/media/playback-prefs — the signed-in member's preferences. */
export async function GET_playbackPrefs(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  return ok(await getPlaybackPrefs(user.id))
}

/** PUT /api/media/playback-prefs { audio?, subtitle?, subtitleStyle? } — changes what is sent, keeps the rest. */
export async function PUT_playbackPrefs(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const origin = req.headers.get('origin')
  if (origin && new URL(origin).host !== req.headers.get('host')) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('invalid', 400)
  return ok(await savePlaybackPrefs(user.id, body))
}
