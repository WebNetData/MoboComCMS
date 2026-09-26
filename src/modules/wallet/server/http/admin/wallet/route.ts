import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import type { Permission } from '@/modules/identity/rbac'
import { moveWallet, walletBalance } from '@/modules/wallet/server/wallet'

/** GET ?userId=1 → wallet history for one customer (admin view) */
export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'users.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const userId = Number(req.nextUrl.searchParams.get('userId'))
  if (!userId) return err('userId is required')
  const [txs, balance] = await Promise.all([
    db.walletTx.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 200 }),
    walletBalance(userId),
  ])
  return ok({
    balance,
    transactions: txs.map((t) => ({
      id: t.id,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      type: t.type,
      status: t.status,
      description: t.description,
      adminId: t.adminId,
      invoiceId: t.invoiceId,
      orderId: t.orderId,
      createdAt: t.createdAt,
    })),
  })
}

/** POST { userId, amount, type?: ADMIN_CREDIT|ADMIN_DEBIT, description? } */
export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'users.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const userId = Number(b?.userId)
  const raw = Math.round((Number(b?.amount) || 0) * 100) / 100
  if (!userId) return err('userId is required')
  if (!raw) return err('amount is required')

  const debit = b?.type === 'ADMIN_DEBIT' || (b?.type === undefined && raw < 0)
  const amount = debit ? -Math.abs(raw) : Math.abs(raw)
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
  if (!user) return err('user not found', 404)

  const result = await moveWallet({
    userId,
    amount,
    type: debit ? 'ADMIN_DEBIT' : 'ADMIN_CREDIT',
    description: String(b?.description || (debit ? 'Manual debit by admin' : 'Manual credit by admin')),
    adminId: admin.id,
  })
  if (!result.ok) return err(result.message || 'wallet update failed', 400)

  return ok({ ok: true, balance: result.balance, txId: result.txId, email: user.email })
}
