export type CustomerSubscription = {
  status: string
  trafficUsedGB: number
  trafficLimitGB: number
  expiresAt: string
  daysLeft: number
  planName?: string
  username?: string
}

export type CustomerSubscriptionState = 'active' | 'attention' | 'disabled' | 'expired' | 'pending'

export function subscriptionState(sub: CustomerSubscription, now = Date.now()): CustomerSubscriptionState {
  const expiry = new Date(sub.expiresAt).getTime()
  if (sub.status === 'EXPIRED' || (Number.isFinite(expiry) && expiry <= now)) return 'expired'
  if (sub.status === 'DISABLED') return 'disabled'
  if (sub.status !== 'ACTIVE') return 'pending'
  const exhausted = sub.trafficLimitGB > 0 && sub.trafficUsedGB >= sub.trafficLimitGB
  const lowData = sub.trafficLimitGB > 0 && Math.max(0, sub.trafficLimitGB - sub.trafficUsedGB) <= sub.trafficLimitGB * 0.1
  return exhausted || lowData || sub.daysLeft <= 7 ? 'attention' : 'active'
}

export function customerOverview(subs: CustomerSubscription[], now = Date.now()) {
  const current = subs.filter(sub => ['active', 'attention'].includes(subscriptionState(sub, now)))
  const unlimited = current.some(sub => sub.trafficLimitGB === 0)
  return {
    active: current.length,
    attention: current.filter(sub => subscriptionState(sub, now) === 'attention').length,
    usedGB: current.reduce((sum, sub) => sum + Math.max(0, sub.trafficUsedGB || 0), 0),
    limitGB: unlimited ? null : current.reduce((sum, sub) => sum + Math.max(0, sub.trafficLimitGB || 0), 0),
    soonestDays: current.length ? Math.min(...current.map(sub => Math.max(0, sub.daysLeft))) : null,
  }
}

export function sortCustomerSubscriptions<T extends CustomerSubscription>(subs: T[], now = Date.now()): T[] {
  const priority: Record<CustomerSubscriptionState, number> = { attention: 0, active: 1, pending: 2, disabled: 3, expired: 4 }
  return [...subs].sort((a, b) => priority[subscriptionState(a, now)] - priority[subscriptionState(b, now)] || new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())
}
