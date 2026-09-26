import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { apiOk, authorize } from '@/modules/public-api/server/v1'
import { safeHappLink } from '@/modules/subscriptions/server/happ-protocol'


export async function GET(req: NextRequest) {
  const auth = await authorize(req)
  if (!auth.ok) return auth.response

  const subs = await db.subscription.findMany({
    where: { userId: auth.caller.userId },
    orderBy: { id: 'desc' },
    include: { plan: { select: { name: true, days: true, trafficGB: true, deviceLimit: true } }, panel: { select: { name: true, type: true } } },
  })

  return apiOk({
    count: subs.length,
    subscriptions: await Promise.all(subs.map(async (s) => ({
      id: s.id,
      status: s.status,
      plan: s.plan.name,
      panel: s.panel?.name || null,
      username: s.username,
      traffic: {
        usedGB: s.trafficUsed,
        limitGB: s.trafficLimit,
        remainingGB: s.trafficLimit > 0 ? Math.max(0, s.trafficLimit - s.trafficUsed) : null,
      },
      deviceLimit: s.deviceLimit,
      expiresAt: s.expiresAt,
      daysLeft: Math.max(0, Math.ceil((s.expiresAt.getTime() - Date.now()) / 86400_000)),
      subscriptionUrl: await safeHappLink(s.subToken),
      lastSyncAt: s.lastSyncAt,
    }))),
  })
}
