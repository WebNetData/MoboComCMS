import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import type { Permission } from '@/modules/identity/rbac'
import { minorToNumber, normalizeCurrency, toMinor, BASE_CURRENCY } from '@/shared/money'

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function exactMinor(row: { amountMinor?: bigint | null; amount?: number; currency?: string }, currency: string) {
  return typeof row.amountMinor === 'bigint' && row.amountMinor !== 0n ? row.amountMinor : toMinor(row.amount || 0, currency)
}

function invoiceMinor(row: { totalMinor?: bigint | null; total: number; currency?: string }, currency: string) {
  return typeof row.totalMinor === 'bigint' && row.totalMinor !== 0n ? row.totalMinor : toMinor(row.total || 0, currency)
}

function expenseMinor(row: { amountMinor?: bigint | null; amount: number; currency?: string }, currency: string) {
  return typeof row.amountMinor === 'bigint' && row.amountMinor !== 0n ? row.amountMinor : toMinor(row.amount || 0, currency)
}

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'finance.manage' as Permission)
  if (!admin) return err('forbidden', 403)

  const months = Math.min(Math.max(Number(req.nextUrl.searchParams.get('months')) || 12, 3), 24)
  const requestedCurrency = req.nextUrl.searchParams.get('currency')
  const since = new Date()
  since.setMonth(since.getMonth() - (months - 1))
  since.setDate(1)
  since.setHours(0, 0, 0, 0)

  const [invoiceCurrencies, expenseCurrencies, paymentCurrencies] = await Promise.all([
    db.invoice.findMany({ select: { currency: true }, distinct: ['currency'] }),
    db.expense.findMany({ select: { currency: true }, distinct: ['currency'] }),
    db.payment.findMany({ select: { currency: true }, distinct: ['currency'] }),
  ])
  const currencies = [...new Set([...invoiceCurrencies, ...expenseCurrencies, ...paymentCurrencies].map((x) => normalizeCurrency(x.currency || 'USD')))].sort()
  // The books open in the site's base currency; another currency that has rows is one choice away.
  const currency = requestedCurrency ? normalizeCurrency(requestedCurrency) : BASE_CURRENCY
  if (!currencies.includes(currency)) currencies.push(currency)

  const [salesInvoices, unpaidInvoices, expenses, billingPayments, recentPayments, gatewayRows, plans] = await Promise.all([
    db.invoice.findMany({
      where: { kind: 'BILLING', currency, status: { in: ['PAID', 'REFUNDED'] }, issuedAt: { gte: since } },
      orderBy: { issuedAt: 'desc' },
      include: { user: { select: { email: true, name: true } }, plan: { select: { id: true, name: true } } },
    }),
    db.invoice.findMany({ where: { kind: 'BILLING', currency, status: 'UNPAID' }, select: { total: true, totalMinor: true, currency: true } }),
    db.expense.findMany({ where: { currency, spentAt: { gte: since } }, orderBy: { spentAt: 'desc' } }),
    db.payment.findMany({
      where: { currency, status: 'CONFIRMED', createdAt: { gte: since }, invoice: { kind: 'BILLING' } },
      include: { gateway: { select: { name: true, provider: true } }, invoice: { select: { kind: true } } },
    }),
    db.payment.findMany({
      where: { currency, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { email: true, name: true } }, gateway: { select: { name: true, provider: true } }, invoice: { select: { kind: true } } },
    }),
    db.gateway.findMany({ orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }] }),
    db.plan.findMany({ where: { currency }, select: { id: true, name: true, price: true, priceMinor: true, currency: true } }),
  ])

  let grossMinor = 0n
  let refundedMinor = 0n
  let feesMinor = 0n
  let expenseTotalMinor = 0n
  let unpaidMinor = 0n
  for (const i of salesInvoices) {
    const value = invoiceMinor(i, currency)
    grossMinor += value
    if (i.status === 'REFUNDED') refundedMinor += value
  }
  for (const p of billingPayments) feesMinor += typeof p.feeMinor === 'bigint' && p.feeMinor !== 0n ? p.feeMinor : toMinor(p.fee || 0, currency)
  for (const e of expenses) expenseTotalMinor += expenseMinor(e, currency)
  for (const i of unpaidInvoices) unpaidMinor += invoiceMinor(i, currency)
  const netMinor = grossMinor - refundedMinor - feesMinor - expenseTotalMinor

  const byMonthMap = new Map<string, { month: string; revenueMinor: bigint; refundsMinor: bigint; expensesMinor: bigint; count: number }>()
  for (let i = 0; i < months; i++) {
    const d = new Date(since)
    d.setMonth(since.getMonth() + i)
    byMonthMap.set(monthKey(d), { month: monthKey(d), revenueMinor: 0n, refundsMinor: 0n, expensesMinor: 0n, count: 0 })
  }
  for (const invoice of salesInvoices) {
    const row = byMonthMap.get(monthKey(new Date(invoice.issuedAt)))
    if (!row) continue
    const value = invoiceMinor(invoice, currency)
    row.revenueMinor += value
    if (invoice.status === 'REFUNDED') row.refundsMinor += value
    row.count += 1
  }
  for (const e of expenses) {
    const row = byMonthMap.get(monthKey(new Date(e.spentAt)))
    if (row) row.expensesMinor += expenseMinor(e, currency)
  }

  const byGatewayMap = new Map<string, { name: string; provider: string; amountMinor: bigint; count: number }>()
  for (const p of billingPayments) {
    if (p.provider === 'WALLET') continue
    const name = p.gateway?.name || p.provider
    const row = byGatewayMap.get(name) || { name, provider: p.gateway?.provider || p.provider, amountMinor: 0n, count: 0 }
    row.amountMinor += exactMinor(p, currency)
    row.count += 1
    byGatewayMap.set(name, row)
  }

  const planRevenue = new Map<number, bigint>()
  const topCustomers = new Map<number, { email: string; name: string; amountMinor: bigint; count: number }>()
  for (const invoice of salesInvoices) {
    const value = invoiceMinor(invoice, currency)
    if (invoice.planId) planRevenue.set(invoice.planId, (planRevenue.get(invoice.planId) || 0n) + value)
    if (invoice.userId === null) continue
    const current = topCustomers.get(invoice.userId) || { email: invoice.user?.email || '—', name: invoice.user?.name || '', amountMinor: 0n, count: 0 }
    current.amountMinor += value
    current.count += 1
    topCustomers.set(invoice.userId, current)
  }

  const paidCount = salesInvoices.length
  const refundedCount = salesInvoices.filter((x) => x.status === 'REFUNDED').length
  const failedCount = recentPayments.filter((p) => p.status === 'FAILED' && p.invoice?.kind === 'BILLING').length
  let pendingMinor = 0n
  for (const p of recentPayments.filter((x) => x.status === 'PENDING' && x.invoice?.kind === 'BILLING')) pendingMinor += exactMinor(p, currency)

  return ok({
    currency,
    currencies: currencies.sort(),
    summary: {
      gross: minorToNumber(grossMinor, currency),
      refunded: minorToNumber(refundedMinor, currency),
      fees: minorToNumber(feesMinor, currency),
      expenses: minorToNumber(expenseTotalMinor, currency),
      net: minorToNumber(netMinor, currency),
      payments: paidCount,
      refundCount: refundedCount,
      failedCount,
      pendingPayments: minorToNumber(pendingMinor, currency),
      unpaidCount: unpaidInvoices.length,
      unpaidAmount: minorToNumber(unpaidMinor, currency),
      paidCount,
      paidAmount: minorToNumber(grossMinor, currency),
      avgOrder: paidCount ? minorToNumber(grossMinor / BigInt(paidCount), currency) : 0,
    },
    byMonth: [...byMonthMap.values()].map((m) => ({
      month: m.month,
      revenue: minorToNumber(m.revenueMinor, currency),
      refunds: minorToNumber(m.refundsMinor, currency),
      expenses: minorToNumber(m.expensesMinor, currency),
      net: minorToNumber(m.revenueMinor - m.refundsMinor - m.expensesMinor, currency),
      count: m.count,
    })),
    byGateway: [...byGatewayMap.values()].map((g) => ({ ...g, amount: minorToNumber(g.amountMinor, currency), amountMinor: undefined })).sort((a, b) => b.amount - a.amount),
    byPlan: plans
      .map((p) => ({ id: p.id, name: p.name, price: minorToNumber(p.priceMinor || toMinor(p.price, currency), currency), amount: minorToNumber(planRevenue.get(p.id) || 0n, currency) }))
      .filter((p) => p.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    topCustomers: [...topCustomers.values()]
      .map((c) => ({ email: c.email, name: c.name, amount: minorToNumber(c.amountMinor, currency), count: c.count }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8),
    gateways: gatewayRows.map((g) => ({
      id: g.id,
      name: g.name,
      provider: g.provider,
      active: g.active,
      isDefault: g.isDefault,
      fiat: normalizeCurrency(g.fiat || 'USD'),
      feePercent: g.feeBps ? g.feeBps / 100 : g.feePercent,
      hasApiKey: Boolean(g.apiKey),
    })),
    recentPayments: recentPayments.slice(0, 15).map((p) => ({
      id: p.id,
      provider: p.provider,
      status: p.status,
      amount: minorToNumber(exactMinor(p, currency), currency),
      currency,
      cryptoCurrency: p.cryptoCurrency,
      cryptoAmount: p.cryptoAmount,
      gatewayName: p.gateway?.name || '',
      user: p.user?.email || '—',
      orderId: p.orderId,
      invoiceId: p.invoiceId,
      kind: p.invoice?.kind || '',
      createdAt: p.createdAt,
    })),
    recentExpenses: expenses.slice(0, 10).map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      amount: minorToNumber(expenseMinor(e, currency), currency),
      currency,
      spentAt: e.spentAt,
    })),
  })
}
