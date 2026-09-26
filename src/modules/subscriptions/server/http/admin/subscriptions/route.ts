import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { getPanelAdapter } from '@/modules/providers/server/panels'
import { syncSubscription } from '@/modules/subscriptions/server/provision'

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'subs.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const subs = await db.subscription.findMany({
    include: {
      user: { select: { email: true, name: true } },
      plan: { select: { name: true } },
      panel: { select: { name: true, type: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  return ok(
    subs.map((s) => ({
      id: s.id,
      user: s.user.email,
      userName: s.user.name,
      plan: s.plan.name,
      panel: s.panel?.name || '-',
      panelType: s.panel?.type || '-',
      username: s.username,
      status: s.status,
      trafficUsedGB: s.trafficUsed,
      trafficLimitGB: s.trafficLimit,
      deviceLimit: s.deviceLimit,
      expiresAt: s.expiresAt,
      lastSyncAt: s.lastSyncAt,
    }))
  )
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'subs.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  if (!id) return err('invalid id')
  const sub = await db.subscription.findUnique({ where: { id }, include: { plan: { include: { panel: true } } } })
  if (!sub || !sub.plan.panel) return err('not found', 404)
  const adapter = getPanelAdapter(sub.plan.panel)
  if (!adapter) return err('panel adapter unavailable')

  if (b?.action === 'extend') {
    const days = Math.max(1, Number(b?.days) || 30)
    const newExpire = new Date(Math.max(Date.now(), sub.expiresAt.getTime()) + days * 86400_000)
    const r = await adapter.updateUser(sub.username, { days: Math.ceil((newExpire.getTime() - Date.now()) / 86400_000) })
    if (!r.ok) {
      console.warn(`[admin] panel extend failed for subscription ${id}: ${r.message || 'unknown'}`)
      return err('عملیات روی پنل ناموفق بود؛ جزئیات در لاگ سرور ثبت شد', 502)
    }
    const updated = await db.subscription.update({ where: { id }, data: { expiresAt: newExpire, status: 'ACTIVE' } })
    return ok(updated)
  }

  if (b?.action === 'toggle') {
    const disable = sub.status === 'DISABLED' ? false : true
    const r = await adapter.updateUser(sub.username, { disabled: disable })
    if (!r.ok) {
      console.warn(`[admin] panel toggle failed for subscription ${id}: ${r.message || 'unknown'}`)
      return err('عملیات روی پنل ناموفق بود؛ جزئیات در لاگ سرور ثبت شد', 502)
    }
    const updated = await db.subscription.update({
      where: { id },
      data: { status: disable ? 'DISABLED' : 'ACTIVE' },
    })
    return ok(updated)
  }

  if (b?.action === 'sync') {
    const r = await syncSubscription(id)
    if (!r.ok) {
      console.warn(`[admin] subscription sync failed for ${id}: ${r.message || 'unknown'}`)
      return err('همگام‌سازی با پنل ناموفق بود؛ جزئیات در لاگ سرور ثبت شد', 502)
    }
    const updated = await db.subscription.findUnique({ where: { id } })
    return ok(updated)
  }

  if (b?.action === 'revoke') {
    const r = await adapter.deleteUser(sub.username)
    if (!r.ok) {
      console.warn(`[admin] panel revoke failed for subscription ${id}: ${r.message || 'unknown'}`)
      return err('عملیات روی پنل ناموفق بود؛ جزئیات در لاگ سرور ثبت شد', 502)
    }
    await db.subscription.update({ where: { id }, data: { status: 'DISABLED' } })
    return ok({ revoked: true })
  }

  return err('unknown action')
}
