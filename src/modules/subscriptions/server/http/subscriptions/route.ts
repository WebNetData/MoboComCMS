import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { requireUser } from '@/modules/identity/server/access'
import { safeHappLink as subscriptionUrl } from '@/modules/subscriptions/server/happ-protocol'
import { syncSubscription } from '@/modules/subscriptions/server/provision'
import { getUserLocale } from '@/modules/notifications/server/telegram-locale'
import { planName } from '@/modules/catalog/domain/plan-locale'

// Live sync hits the VPN panel API; without throttling a user could turn
// GET /api/subscriptions into an amplifier against the panel.
const SYNC_STALE_MS = 5 * 60_000
const SYNC_BATCH = 10

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const locale = await getUserLocale(user.id) || (req.cookies.get('lang')?.value === 'fa' ? 'fa' : 'en')

  const subs = await db.subscription.findMany({
    where: { userId: user.id },
    include: { plan: { include: { panel: { select: { name: true, type: true } } } } },
    orderBy: { createdAt: 'desc' },
  })

  // best-effort live sync (only for own subs; tolerate panel failure),
  // throttled to stale rows and capped per request
  const now = Date.now()
  const stale = subs.filter((s) => !s.lastSyncAt || now - s.lastSyncAt.getTime() > SYNC_STALE_MS).slice(0, SYNC_BATCH)
  await Promise.allSettled(stale.map((s) => syncSubscription(s.id)))

  const fresh = await db.subscription.findMany({
    where: { userId: user.id },
    include: { plan: { include: { panel: { select: { name: true, type: true } } } } },
    orderBy: { createdAt: 'desc' },
  })

  return ok(
    await Promise.all(fresh.map(async (s) => ({
      id: s.id,
      planName: planName(s.plan, locale),
      panelName: s.plan.panel?.name || null,
      panelType: s.plan.panel?.type || '',
      status: s.status,
      username: s.username,
      trafficUsedGB: s.trafficUsed,
      trafficLimitGB: s.trafficLimit,
      deviceLimit: s.deviceLimit,
      expiresAt: s.expiresAt,
      daysLeft: Math.max(0, Math.ceil((s.expiresAt.getTime() - Date.now()) / 86400000)),
      subToken: s.subToken,
      subUrl: await subscriptionUrl(s.subToken),
      lastSyncAt: s.lastSyncAt,
    })))
  )
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const body = await req.json().catch(() => null)
  const id = Number(body?.id)
  if (!id) return err('invalid id')

  const sub = await db.subscription.findUnique({ where: { id } })
  if (!sub || sub.userId !== user.id) return err('not found', 404)

  if (!rateLimitHit(`sub-sync:${user.id}`, 10, 60_000).ok) return err('همگام‌سازی بیش از حد تکرار شده است؛ کمی بعد تلاش کنید', 429)
  const res = await syncSubscription(id)
  if (!res.ok) return err(res.message || 'sync failed', 502)
  return ok({ synced: true })
}
