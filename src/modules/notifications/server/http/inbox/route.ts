import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requireUser } from '@/modules/identity/server/access'
import { err, ok } from '@/platform/http/response'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const privateOk = (data: unknown) => {
    const response = ok(data)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
  if (req.nextUrl.searchParams.get('countOnly') === '1') return privateOk({ unread: await db.userNotification.count({ where: { userId: user.id, readAt: null } }) })
  const before = req.nextUrl.searchParams.get('before')
  const cursor = before === null ? 0 : Number(before)
  if (before !== null && (!Number.isSafeInteger(cursor) || cursor <= 0)) return err('invalid cursor', 400)
  const unreadOnly = req.nextUrl.searchParams.get('unread') === '1'
  const notifications = await db.userNotification.findMany({
    where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}), ...(cursor > 0 ? { id: { lt: cursor } } : {}) },
    orderBy: { id: 'desc' }, take: 31,
  })
  const unread = await db.userNotification.count({ where: { userId: user.id, readAt: null } })
  return privateOk({ notifications: notifications.slice(0, 30), nextCursor: notifications.length > 30 ? notifications[29].id : null, unread })
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
  const response = ok({ updated: true, unread: await db.userNotification.count({ where: { userId: user.id, readAt: null } }) })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
