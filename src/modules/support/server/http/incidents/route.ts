import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requireUser } from '@/modules/identity/server/access'
import { err, ok } from '@/platform/http/response'
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const id = Number(req.nextUrl.searchParams.get('subscriptionId'))
  if (!Number.isSafeInteger(id) || id <= 0) return err('invalid subscription', 400)
  const subscription = await db.subscription.findFirst({ where: { id, userId: user.id }, select: { panelId: true } })
  if (!subscription) return err('not found', 404)
  const incidents = await db.serviceIncident.findMany({
    where: { AND: [
      { OR: [{ panelId: null }, ...(subscription.panelId === null ? [] : [{ panelId: subscription.panelId }])] },
      { OR: [{ status: { not: 'RESOLVED' } }, { updatedAt: { gte: new Date(Date.now() - 86400000) } }] },
    ] },
    select: { id: true, titleFa: true, titleEn: true, messageFa: true, messageEn: true, status: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' }, take: 20,
  })
  const response = ok(incidents)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
