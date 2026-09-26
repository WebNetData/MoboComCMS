import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { walletBalances } from '@/modules/wallet/server/wallet'
import { minorToNumber, normalizeCurrency } from '@/shared/money'
import { startWalletTopup } from '@/modules/wallet/server/topup'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth) return err('unauthorized', 401)
  const [balances, txs, gatewayOptions] = await Promise.all([
    walletBalances(auth.id),
    db.walletTx.findMany({ where: { userId: auth.id }, orderBy: { id: 'desc' }, take: 150 }),
    checkoutGatewayOptions(),
  ])
  const totals: Record<string, { toppedUp: number; spent: number; count: number }> = {}
  for (const tx of txs) {
    const currency = normalizeCurrency(tx.currency)
    totals[currency] ||= { toppedUp: 0, spent: 0, count: 0 }
    totals[currency].count++
    if (tx.status !== 'DONE') continue
    const amount = minorToNumber(tx.amountMinor, currency)
    if (amount > 0) totals[currency].toppedUp += amount
    else totals[currency].spent += Math.abs(amount)
  }
  return ok({
    balances: balances.map(({ currency, balance }) => ({ currency, balance })),
    // Compatibility for older clients only.
    balance: balances.find((item) => item.currency === 'USD')?.balance || 0,
    transactions: txs.map((tx) => ({
      id: tx.id,
      amount: minorToNumber(tx.amountMinor, tx.currency),
      balanceAfter: minorToNumber(tx.balanceAfterMinor, tx.currency),
      currency: tx.currency,
      type: tx.type,
      status: tx.status,
      description: tx.description,
      invoiceId: tx.invoiceId,
      orderId: tx.orderId,
      createdAt: tx.createdAt,
    })),
    totals,
    topupCurrencies: [...new Set(gatewayOptions.flatMap((g) => g.acceptedCurrencies).map((currency) => normalizeCurrency(currency)))].sort(),
    topupGateways: gatewayOptions,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth) return err('unauthorized', 401)
  const body = await req.json().catch(() => null)
  const result = await startWalletTopup({
    userId: auth.id,
    email: auth.email,
    amount: String(body?.amount ?? ''),
    currency: body?.currency ? String(body.currency) : undefined,
    gatewayRef: typeof body?.gatewayRef === 'string' ? body.gatewayRef.trim() : undefined,
    idempotencyKey: String(req.headers.get('idempotency-key') || body?.idempotencyKey || '').trim(),
  })
  if (!result.ok) return err(result.message, result.status, { code: result.code })
  return ok(result)
}
