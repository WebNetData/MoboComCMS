import { createHash } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { getPanelAdapter } from '@/modules/providers/server/panels'
import { walletBalance } from '@/modules/wallet/server/wallet'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { renewalTarget } from '@/modules/subscriptions/domain/renewal'
import { planName } from '@/modules/catalog/domain/plan-locale'

export function renewalTerms(plan: { id: number; price: number; priceMinor: bigint; currency: string; days: number; trafficGB: number }) {
  const currency = normalizeCurrency(plan.currency)
  const minor = plan.priceMinor || toMinor(plan.price, currency)
  return createHash('sha256').update(JSON.stringify([plan.id, currency, String(minor), plan.days, plan.trafficGB])).digest('hex')
}

export async function getRenewalPreview(id: number, userId: number, locale: 'en' | 'fa' = 'en') {
  const sub = await db.subscription.findUnique({ where: { id }, include: { panel: true, plan: { include: { panel: true } } } })
  if (!sub || sub.userId !== userId) return null
  const pending = await db.fulfillmentJob.findFirst({ where: { subscriptionId: id, kind: 'RENEW_SUBSCRIPTION', status: { not: 'DONE' } } })
  if (pending) throw new Error('RENEWAL_PENDING')
  const panel = sub.panel || sub.plan.panel
  const adapter = panel && getPanelAdapter(panel)
  if (!adapter) throw new Error('PANEL_UNAVAILABLE')
  const current = await adapter.getUser(sub.username)
  if (!current.ok || !current.user) throw new Error('PANEL_UNAVAILABLE')
  const now = Date.now()
  const used = current.user.trafficUsed / 1024 ** 3
  const limit = current.user.trafficLimit / 1024 ** 3
  if (!Number.isFinite(used) || used < 0) throw new Error('PANEL_UNAVAILABLE')
  const target = renewalTarget({ now, localExpiresAt: sub.expiresAt.getTime(), panelExpiresAt: current.user.expiresAt?.getTime() ?? null, localLimitGB: sub.trafficLimit, panelLimitGB: limit, days: sub.plan.days, trafficGB: sub.plan.trafficGB })
  const currency = normalizeCurrency(sub.plan.currency)
  const minor = sub.plan.priceMinor || toMinor(sub.plan.price, currency)
  const balance = await walletBalance(userId, currency)
  return {
    planName: planName(sub.plan, locale), terms: renewalTerms(sub.plan), checkedAt: new Date(now).toISOString(),
    currentExpiresAt: current.user.expiresAt?.toISOString() || sub.expiresAt.toISOString(),
    currentRemainingGB: limit === 0 ? null : Math.max(0, limit - used),
    nextExpiresAt: target.expiresAt, nextRemainingGB: target.trafficLimitGB === 0 ? null : Math.max(0, target.trafficLimitGB - used),
    days: sub.plan.days, trafficGB: sub.plan.trafficGB, price: legacyNumber(minor, currency), currency, balance,
    canPay: toMinor(balance, currency) >= minor,
  }
}
