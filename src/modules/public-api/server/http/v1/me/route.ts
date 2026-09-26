import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { apiErr, apiOk, authorize } from '@/modules/public-api/server/v1'
import { walletBalances } from '@/modules/wallet/server/wallet'

export async function GET(req: NextRequest) {
  const auth = await authorize(req)
  if (!auth.ok) return auth.response

  const [user, subs, invoices] = await Promise.all([
    db.user.findUnique({
      where: { id: auth.caller.userId },
      select: { id: true, email: true, name: true, phone: true, role: true, status: true, createdAt: true },
    }),
    db.subscription.count({ where: { userId: auth.caller.userId } }),
    db.invoice.count({ where: { userId: auth.caller.userId } }),
  ])
  if (!user) return apiErr('user not found', 404)

  return apiOk({
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    wallet: { balances: await walletBalances(user.id) },
    counts: { subscriptions: subs, invoices },
  })
}
