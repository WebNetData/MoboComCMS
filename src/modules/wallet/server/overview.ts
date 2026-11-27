import { db } from '@/platform/database/prisma'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'
import { isCloudWalletTopup } from '@/modules/checkout/domain/surface'
import { walletBalances } from '@/modules/wallet/server/wallet'
import { minorToNumber, normalizeCurrency, toMinor } from '@/shared/money'

/** One private, owner-scoped projection shared by the member and Cloud wallet surfaces. */
export async function walletOverview(userId: number, surface: 'dashboard' | 'cloud' = 'dashboard') {
  const [balances, txs, gatewayOptions] = await Promise.all([
    walletBalances(userId),
    db.walletTx.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 150 }),
    checkoutGatewayOptions(),
  ])
  const invoiceIds = surface === 'cloud' ? [...new Set(txs.flatMap((tx) => tx.invoiceId == null ? [] : [tx.invoiceId]))] : []
  const invoices = invoiceIds.length ? await db.invoice.findMany({ where: { id: { in: invoiceIds }, userId }, select: { id: true, number: true, kind: true, userId: true, idempotencyKey: true } }) : []
  const cloudInvoiceNumbers = new Map(invoices.filter((invoice) => isCloudWalletTopup(invoice, userId)).map((invoice) => [invoice.id, invoice.number]))
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
  return {
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
      ...(surface === 'cloud' ? { cloudInvoiceNumber: tx.invoiceId == null ? null : cloudInvoiceNumbers.get(tx.invoiceId) || null } : {}),
      orderId: tx.orderId,
      createdAt: tx.createdAt,
    })),
    totals,
    topupCurrencies: [...new Set(gatewayOptions.flatMap((gateway) => gateway.acceptedCurrencies).map((currency) => normalizeCurrency(currency)))].sort(),
    topupGateways: gatewayOptions,
  }
}
