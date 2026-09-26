import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { safeHappLink as subscriptionUrl } from '@/modules/subscriptions/server/happ-protocol'
import { createResellerAccount, requireReseller, resellerCan, resellerUsage } from '@/modules/reseller/server/reseller'


/** GET /api/reseller/accounts — the reseller's own customers. */
export async function GET(req: NextRequest) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!resellerCan(guard, 'accounts.view')) return err('forbidden', 403)

  const { reseller } = guard
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  const status = req.nextUrl.searchParams.get('status') || ''

  const where: any = { resellerId: reseller.id }
  if (status) where.status = status
  if (q) where.OR = [{ username: { contains: q } }, { user: { email: { contains: q } } }]

  const [rows, usage] = await Promise.all([
    db.subscription.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 300,
      include: { plan: { select: { name: true, trafficGB: true, days: true } }, user: { select: { id: true, email: true, name: true, status: true } } },
    }),
    resellerUsage(reseller.id),
  ])

  return ok({
    accounts: await Promise.all(rows.map(async (s) => ({
      id: s.id,
      username: s.username,
      status: s.status,
      customer: { id: s.user.id, email: s.user.email, name: s.user.name, status: s.user.status },
      planName: s.plan.name,
      trafficLimitGB: s.trafficLimit,
      trafficUsedGB: s.trafficUsed,
      deviceLimit: s.deviceLimit,
      expiresAt: s.expiresAt,
      subUrl: await subscriptionUrl(s.subToken),
      createdAt: s.createdAt,
      lastSyncAt: s.lastSyncAt,
    }))),
    usage,
  })
}

/** POST /api/reseller/accounts — create an account for one of their customers. */
export async function POST(req: NextRequest) {
  const guard = await requireReseller(req)
  if (!guard.ok) return guard.response
  if (!resellerCan(guard, 'accounts.manage')) return err('forbidden', 403)

  const { reseller } = guard
  const b = await req.json().catch(() => null)
  if (!b?.email || !b?.planId) return err('customer email and plan are required', 400, { code: 'MISSING_FIELDS' })

  const res = await createResellerAccount(
    { ...reseller, prices: reseller.prices },
    {
      email: String(b.email),
      planId: Number(b.planId),
      username: b.username ? String(b.username) : undefined,
      trafficGB: b.trafficGB === '' || b.trafficGB == null ? undefined : Number(b.trafficGB),
      days: b.days === '' || b.days == null ? undefined : Number(b.days),
      deviceLimit: b.deviceLimit === '' || b.deviceLimit == null ? undefined : Number(b.deviceLimit),
      note: b.note ? String(b.note) : undefined,
      idempotencyKey: String(req.headers.get('idempotency-key') || b?.idempotencyKey || ''),
    }
  )

  if (!res.ok) {
    const status = res.code === 'INSUFFICIENT_FUNDS' ? 402 : res.code === 'SETTLEMENT_FAILED' ? 502 : 400
    return err(res.message || 'account creation failed', status, {
      code: res.code,
      needed: res.needed,
      balance: res.balance,
      currency: res.currency,
    })
  }

  return ok(res, 201)
}
