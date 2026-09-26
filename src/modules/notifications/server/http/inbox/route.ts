import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requireUser } from '@/modules/identity/server/access'
import { err, ok } from '@/platform/http/response'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  if (req.nextUrl.searchParams.get('countOnly') === '1') return ok({ unread: await db.userNotification.count({ where: { userId: user.id, readAt: null } }) })
  const cursor = Number(req.nextUrl.searchParams.get('before') || 0)
  const notifications = await db.userNotification.findMany({
    where: { userId: user.id, ...(Number.isInteger(cursor) && cursor > 0 ? { id: { lt: cursor } } : {}) },
    orderBy: { id: 'desc' }, take: 31,
  })
  const unread = await db.userNotification.count({ where: { userId: user.id, readAt: null } })
  return ok({ notifications: notifications.slice(0, 30), nextCursor: notifications.length > 30 ? notifications[29].id : null, unread })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const body = await req.json().catch(() => null)
  if (body?.all === true) {
    await db.userNotification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } })
  } else {
    const id = Number(body?.id)
    if (!Number.isInteger(id) || id <= 0) return err('invalid notification id', 400)
    await db.userNotification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } })
  }
  return ok({ updated: true })
}
