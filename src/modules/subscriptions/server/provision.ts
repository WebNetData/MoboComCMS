import { db } from '@/platform/database/prisma'
import { getPanelAdapter, type PanelAdapter } from '@/modules/providers/server/panels'
import { randomPassword, randomToken } from '@/shared/security/random'
import { notifySubscriptionReady } from '@/modules/notifications/server/telegram'
import { sanitizeUsername, suggestUsername } from '@/modules/subscriptions/server/usernames'
import { getSettings } from '@/modules/settings/server'

export interface ProvisionResult {
  ok: boolean
  message?: string
  subscriptionId?: number
  username?: string
}

async function fallbackUsername(userId: number, subId: number) {
  const settings = await getSettings()
  const prefix = sanitizeUsername(settings.subscriptionPrefix || 'happ').slice(0, 12) || 'happ'
  return `${prefix}_${subId.toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Creates a user on the VPN panel and a local Subscription row.
 * Called after a successful payment.
 *
 * `opts.username` is the config name the customer picked in the buy flow. A
 * naming clash must never fail a paid order, so the name is checked up front
 * and retried with a suffix when the panel still rejects it.
 */
export async function provisionSubscription(opts: {
  userId: number
  planId: number
  orderId?: number
  username?: string
  resellerId?: number
  trafficGB?: number
  days?: number
  deviceLimit?: number
  allowPlanOverride?: boolean
}): Promise<ProvisionResult> {
  const plan = await db.plan.findUnique({ where: { id: opts.planId }, include: { panel: true } })
  if (!plan) return { ok: false, message: 'plan not found' }
  if (!plan.panel || !plan.panel.active) return { ok: false, message: 'panel not configured for this plan' }

  const trafficGB = opts.trafficGB != null ? opts.allowPlanOverride || opts.resellerId || plan.trafficGB === 0 ? opts.trafficGB : Math.max(0, Math.min(opts.trafficGB, plan.trafficGB)) : plan.trafficGB
  const days = opts.days != null ? opts.allowPlanOverride || plan.days === 0 ? opts.days : Math.max(0, Math.min(opts.days, plan.days)) : plan.days
  const deviceLimit = opts.deviceLimit != null ? opts.allowPlanOverride || plan.deviceLimit === 0 ? opts.deviceLimit : Math.max(0, Math.min(opts.deviceLimit, plan.deviceLimit)) : plan.deviceLimit
  const adapter: PanelAdapter | null = getPanelAdapter(plan.panel)
  if (!adapter) return { ok: false, message: 'panel adapter unavailable' }
  const user = await db.user.findUnique({ where: { id: opts.userId } })
  if (!user) return { ok: false, message: 'user not found' }

  // Order is the idempotency boundary. A retry reuses the same local row.
  let sub = opts.orderId
    ? await db.subscription.findFirst({ where: { orderId: opts.orderId }, orderBy: { id: 'asc' } })
    : null
  if (sub && sub.status === 'ACTIVE' && sub.username !== 'pending') {
    return { ok: true, subscriptionId: sub.id, username: sub.username }
  }
  if (!sub) {
    sub = await db.subscription.create({
      data: {
        userId: opts.userId,
        planId: plan.id,
        orderId: opts.orderId,
        panelId: plan.panel.id,
        username: 'pending',
        trafficLimit: trafficGB,
        deviceLimit,
        expiresAt: new Date(Date.now() + (days || 30) * 86400_000),
        subToken: randomToken(24),
        status: 'PENDING',
        resellerId: opts.resellerId ?? null,
      },
    })
  }

  let desired = sub.username !== 'pending'
    ? adapter.normalizeUsername(sub.username)
    : opts.username
      ? adapter.normalizeUsername(sanitizeUsername(opts.username))
      : adapter.normalizeUsername(await fallbackUsername(opts.userId, sub.id))

  const taken = desired
    ? await db.subscription.findFirst({ where: { username: desired, id: { not: sub.id } }, select: { id: true } })
    : null
  if (taken || !desired) desired = adapter.normalizeUsername(suggestUsername(desired || 'happ'))

  // Persist the intended remote identity before the network call. If the
  // process crashes after remote creation, the retry can discover that user.
  if (sub.username !== desired) {
    sub = await db.subscription.update({ where: { id: sub.id }, data: { username: desired, status: 'PENDING' } })
  }

  let remote = await adapter.getUser(desired).catch(() => ({ ok: false } as any))
  let createdUser = remote.ok && remote.user ? remote.user : null

  if (!createdUser) {
    const inbounds = plan.panel.inbounds
      ? plan.panel.inbounds.split(',').map((value) => value.trim()).filter(Boolean)
      : undefined
    const created = await adapter.createUser({ username: desired, trafficGB, days, deviceLimit, inbounds })
    if (created.ok && created.user) createdUser = created.user
    else {
      const retryName = adapter.normalizeUsername(suggestUsername(desired.slice(0, 20)))
      if (retryName !== desired) {
        desired = retryName
        await db.subscription.update({ where: { id: sub.id }, data: { username: desired } })
        remote = await adapter.getUser(desired).catch(() => ({ ok: false } as any))
        if (remote.ok && remote.user) createdUser = remote.user
        else {
          const retry = await adapter.createUser({ username: desired, trafficGB, days, deviceLimit, inbounds })
          if (retry.ok && retry.user) createdUser = retry.user
          else return { ok: false, message: retry.message || created.message || 'panel user creation failed' }
        }
      } else {
        return { ok: false, message: created.message || 'panel user creation failed' }
      }
    }
  }

  const password = sub.email || randomPassword(14)
  const updated = await db.subscription.update({
    where: { id: sub.id },
    data: {
      username: createdUser.username || desired,
      email: password,
      status: 'ACTIVE',
      trafficLimit: Math.round((createdUser.trafficLimit || 0) / 1024 ** 3 * 1000) / 1000,
      trafficUsed: Math.round((createdUser.trafficUsed || 0) / 1024 ** 3 * 1000) / 1000,
      expiresAt: createdUser.expiresAt || sub.expiresAt,
      panelSubUrl: createdUser.subUrl || '',
      lastSyncAt: new Date(),
    },
  })

  if (!opts.resellerId) await notifySubscriptionReady(updated.id).catch(() => {})
  return { ok: true, subscriptionId: updated.id, username: updated.username }
}

/**
 * Provisions from an order, reusing the config name the customer picked at
 * checkout (kept in `Order.meta`) so the gateway and webhook rails agree.
 */
export async function provisionFromOrder(opts: { orderId: number; userId: number; planId: number }) {
  const order = await db.order.findUnique({ where: { id: opts.orderId }, select: { meta: true } })
  let username: string | undefined
  let terms: { trafficGB?: number; days?: number; deviceLimit?: number; allowPlanOverride?: boolean } = {}
  try {
    const meta = JSON.parse(order?.meta || '{}')
    if (meta?.username) username = sanitizeUsername(String(meta.username))
    if (meta?.kind === 'offer' && Number.isSafeInteger(meta.trafficGB) && Number.isSafeInteger(meta.days) && Number.isSafeInteger(meta.deviceLimit)) terms = { trafficGB: meta.trafficGB, days: meta.days, deviceLimit: meta.deviceLimit, allowPlanOverride: true }
  } catch {}
  return provisionSubscription({ ...opts, username, ...terms })
}

/** Pulls live traffic/expiry/status from the panel into the local subscription row. */
export async function syncSubscription(subId: number): Promise<{ ok: boolean; message?: string }> {
  const sub = await db.subscription.findUnique({ where: { id: subId }, include: { panel: true, plan: { include: { panel: true } } } })
  if (!sub || !(sub.panel || sub.plan.panel)) return { ok: false, message: 'subscription or panel not found' }
  const adapter = getPanelAdapter((sub.panel || sub.plan.panel)!)
  if (!adapter) return { ok: false, message: 'panel adapter unavailable' }

  const res = await adapter.getUser(sub.username)
  if (!res.ok || !res.user) return { ok: false, message: res.message || 'panel user not found' }

  // accounts created before the panel groups were configured carry no config at
  // all — the update doubles as a repair and hands back their squad/group
  let panelUser = res.user
  if (panelUser.squads?.length === 0) {
    const repair = await adapter.updateUser(sub.username, {})
    if (repair.ok && repair.user) panelUser = repair.user
  }

  const disabled = panelUser.status === 'disabled'
  const expired = panelUser.status === 'expired' || panelUser.status === 'limit_reached'

  await db.subscription.update({
    where: { id: sub.id },
    data: {
      trafficUsed: Math.round((panelUser.trafficUsed || 0) / 1024 ** 3 * 1000) / 1000,
      trafficLimit: Math.round((panelUser.trafficLimit || 0) / 1024 ** 3 * 1000) / 1000,
      expiresAt: panelUser.expiresAt || sub.expiresAt,
      panelSubUrl: panelUser.subUrl || sub.panelSubUrl,
      lastSyncAt: new Date(),
      // never flip a locally disabled subscription back to active on a sync
      ...(disabled ? { status: 'DISABLED' } : expired ? { status: 'EXPIRED' } : {}),
    },
  })
  return { ok: true }
}
