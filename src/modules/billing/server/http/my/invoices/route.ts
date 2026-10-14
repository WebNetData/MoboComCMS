import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { minorToNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { formatAmount } from '@/shared/money/format'
import { invoiceSubject } from '@/modules/billing/domain/invoice-subject'
import { getSettings } from '@/modules/settings/server'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)

  const rows = await db.invoice.findMany({
    where: { userId: user.id },
    orderBy: { id: 'desc' },
    include: {
      plan: { select: { name: true } },
      product: { select: { name: true } },
      gateway: { select: { name: true, provider: true } },
      order: { select: { meta: true } },
    },
  })
  const siteName = (await getSettings().catch(() => null))?.brandName || 'موبوکام'
  const subjectOf = (row: typeof rows[number]) => {
    let meta: Record<string, unknown> = {}
    try { meta = JSON.parse(row.order?.meta || '{}') } catch { meta = {} }
    return invoiceSubject({ kind: row.kind, title: row.title, detail: row.detail, planName: row.plan?.name, productName: row.product?.name, meta, siteName, amountText: formatAmount(row.subtotal, normalizeCurrency(row.currency || 'USD'), 'fa-IR'), notes: row.notes })
  }
  const jobs = await db.fulfillmentJob.findMany({
    where: { invoiceId: { in: rows.map(row => row.id) } },
    select: { invoiceId: true, status: true, attempts: true, updatedAt: true },
  })
  const jobByInvoice = new Map(jobs.map(job => [job.invoiceId, job]))
  const subscriptions = await db.subscription.findMany({
    where: { userId: user.id, orderId: { in: rows.map(row => row.orderId).filter((id): id is number => id !== null) } },
    select: { id: true, orderId: true },
  })
  const subByOrder = new Map(subscriptions.map(sub => [sub.orderId, sub.id]))
  const topupTxs = await db.walletTx.findMany({
    where: { userId: user.id, invoiceId: { in: rows.filter(row => row.kind === 'WALLET_TOPUP').map(row => row.id) } },
    select: { invoiceId: true, status: true },
  })
  const topupByInvoice = new Map<number | null, string>()
  for (const tx of topupTxs) if (tx.status === 'DONE' || !topupByInvoice.has(tx.invoiceId)) topupByInvoice.set(tx.invoiceId, tx.status)

  const totalsMap = new Map<string, { paidMinor: bigint; unpaidMinor: bigint }>()
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency || 'USD')
    const current = totalsMap.get(currency) || { paidMinor: 0n, unpaidMinor: 0n }
    const totalMinor = typeof row.totalMinor === 'bigint' && row.totalMinor !== 0n ? row.totalMinor : toMinor(row.total || 0, currency)
    if (row.status === 'PAID') current.paidMinor += totalMinor
    if (row.status === 'UNPAID') current.unpaidMinor += totalMinor
    totalsMap.set(currency, current)
  }
  const totalsByCurrency = [...totalsMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => ({
    currency,
    paid: minorToNumber(value.paidMinor, currency),
    unpaid: minorToNumber(value.unpaidMinor, currency),
  }))
  const usdTotals = totalsByCurrency.find((item) => item.currency === 'USD')

  return ok({
    invoices: rows.map((i) => ({
      id: i.id,
      number: i.number,
      title: subjectOf(i).title,
      detail: subjectOf(i).detail,
      expiresAt: i.status === 'UNPAID' ? i.expiresAt : null,
      closedReason: i.closedReason || '',
      kind: i.kind === 'WALLET_TOPUP' ? 'topup' : i.planId ? 'plan' : i.productId ? 'product' : 'other',
      subtotal: i.subtotal,
      discount: i.discount,
      tax: i.tax,
      total: i.total,
      currency: i.currency,
      status: i.status,
      gatewayName: i.gateway?.name || '',
      provider: i.gateway?.provider || 'MANUAL',
      paidCrypto: i.paidCrypto,
      paidAt: i.paidAt,
      issuedAt: i.issuedAt,
      dueAt: i.dueAt,
      url: `/invoice/${i.number}`,
      paymentUrl: i.status === 'UNPAID' && /^https:\/\//i.test(i.paymentUrl) ? i.paymentUrl : '',
      deliveryStatus: i.status !== 'PAID' ? 'NOT_PAID' : i.kind === 'WALLET_TOPUP' ? topupByInvoice.get(i.id) === 'DONE' ? 'DELIVERED' : 'PROCESSING' : subByOrder.has(i.orderId) || jobByInvoice.get(i.id)?.status === 'DONE' || !i.orderId ? 'DELIVERED' : jobByInvoice.get(i.id)?.status === 'FAILED' ? 'RETRYING' : 'PROCESSING',
      subscriptionId: subByOrder.get(i.orderId) || null,
    })),
    totalsByCurrency,
    // Compatibility for older USD-only clients. Never aggregates different currencies.
    totals: {
      paid: usdTotals?.paid || 0,
      unpaid: usdTotals?.unpaid || 0,
      count: rows.length,
      currency: 'USD',
    },
  })
}
