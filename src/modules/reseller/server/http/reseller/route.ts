import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { safeHappLink as subscriptionUrl } from '@/modules/subscriptions/server/happ-protocol'
import { requireReseller, resellerCan, resellerPlanPrice, resellerUsage, usageReport } from '@/modules/reseller/server/reseller'
import { walletBalances } from '@/modules/wallet/server/wallet'


/** GET /api/reseller — contract, live quota usage and agency pricing. */
export async function GET(req: NextRequest) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!resellerCan(guard, 'accounts.manage')) return err('forbidden', 403)

  const { reseller } = guard
  const [usage, plans, recent, balances] = await Promise.all([
    resellerUsage(reseller.id),
    db.plan.findMany({ where: { active: true }, orderBy: { sort: 'asc' }, select: { id: true, name: true, price: true, priceMinor: true, currency: true, trafficGB: true, days: true, deviceLimit: true, featured: true, panel: { select: { name: true, type: true } } } }),
    db.subscription.findMany({
      where: { resellerId: reseller.id },
      orderBy: { id: 'desc' },
      take: 5,
      include: { plan: { select: { name: true } }, user: { select: { email: true } } },
    }),
    guard.owner ? walletBalances(reseller.userId) : Promise.resolve([]),
  ])

  return ok({
    owner: guard.owner,
    reseller: {
      id: reseller.id,
      active: reseller.active,
      priceMode: reseller.priceMode,
      discountPercent: reseller.discountPercent,
      maxAccounts: reseller.maxAccounts,
      maxActiveAccounts: reseller.maxActiveAccounts,
      trafficQuotaGB: reseller.trafficQuotaGB,
      maxTrafficPerAccountGB: reseller.maxTrafficPerAccountGB,
      allowUnlimitedTraffic: reseller.allowUnlimitedTraffic,
      maxDaysPerAccount: reseller.maxDaysPerAccount,
      allowUnlimitedDays: reseller.allowUnlimitedDays,
      maxDevicesPerAccount: reseller.maxDevicesPerAccount,
      note: reseller.note,
      ...(guard.owner ? { walletBalance: balances.find((b) => b.currency === 'USD')?.balance || 0, walletBalances: balances } : {}),
      customerId: reseller.user?.id ?? null,
    },
    usage: usageReport(reseller, usage),
    plans: (resellerCan(guard, 'accounts.manage') ? plans : []).map((p) => ({
      ...p,
      listPrice: p.price,
      currency: p.currency,
      price: resellerPlanPrice({ ...reseller, prices: reseller.prices }, p),
    })),
    recent: await Promise.all(recent.map(async (s) => ({
      id: s.id,
      username: s.username,
      planName: s.plan.name,
      customer: s.user.email,
      status: s.status,
      expiresAt: s.expiresAt,
      trafficLimitGB: s.trafficLimit,
      trafficUsedGB: s.trafficUsed,
      subUrl: await subscriptionUrl(s.subToken),
    }))),
  })
}
