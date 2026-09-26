import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { apiErr, apiOk, authorize } from '@/modules/public-api/server/v1'
import { walletBalances } from '@/modules/wallet/server/wallet'
import { startWalletTopup } from '@/modules/wallet/server/topup'
import { minorToNumber, normalizeCurrency } from '@/shared/money'


export async function GET(req: NextRequest) {
  const auth = await authorize(req)
  if (!auth.ok) return auth.response
  const [balances, txs] = await Promise.all([
    walletBalances(auth.caller.userId),
    db.walletTx.findMany({ where: { userId: auth.caller.userId }, orderBy: { id: 'desc' }, take: 100 }),
  ])
  return apiOk({
    balances,
    transactions: txs.map((t) => ({
      id: t.id,
      amount: minorToNumber(t.amountMinor, normalizeCurrency(t.currency)),
      balanceAfter: minorToNumber(t.balanceAfterMinor, normalizeCurrency(t.currency)),
      currency: normalizeCurrency(t.currency), type: t.type, status: t.status, description: t.description, createdAt: t.createdAt,
    })),
  })
}

/** POST { amount, currency? } with Idempotency-Key → payment URL. */
export async function POST(req: NextRequest) {
  const auth = await authorize(req)
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => null)
  const result = await startWalletTopup({
    userId: auth.caller.userId,
    email: auth.caller.email,
    amount: String(body?.amount ?? ''),
    currency: body?.currency ? String(body.currency) : undefined,
    idempotencyKey: String(req.headers.get('idempotency-key') || body?.idempotencyKey || '').trim(),
  })
  if (!result.ok) return apiErr(result.message, result.status, result.code)
  return apiOk(result, result.replayed ? 200 : 201)
}
