import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requireUser } from '@/modules/identity/server/access'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { err, ok } from '@/platform/http/response'
import { notificationPreferenceCatalog, validNotificationPreference } from '@/modules/notifications/server/preferences'
import { notificationOffered } from '@/modules/notifications/domain/event-modules'
import { getModuleStates } from '@/extensions/server/modules'

function privateOk(data: unknown) {
  const response = ok(data)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const muted = await db.userNotificationMute.findMany({ where: { userId: user.id }, select: { kind: true, channel: true } })
  const states = await getModuleStates()
  return privateOk({ catalog: notificationPreferenceCatalog.filter((event) => notificationOffered(event.kind, states)), muted })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const body = await req.json().catch(() => null)
  const kind = body?.kind
  const channel = body?.channel
  const enabled = body?.enabled
  if (typeof kind !== 'string' || typeof channel !== 'string' || typeof enabled !== 'boolean' || !validNotificationPreference(kind, channel)) return err('invalid notification preference', 400)
  if (!rateLimitHit(`inbox-preferences:${user.id}`, 60, 60_000).ok) return err('too many changes', 429)
  const key = { userId: user.id, kind, channel }
  if (enabled) await db.userNotificationMute.deleteMany({ where: key })
  else await db.userNotificationMute.upsert({ where: { userId_kind_channel: key }, create: key, update: {} })
  return privateOk({ kind, channel, enabled })
}
