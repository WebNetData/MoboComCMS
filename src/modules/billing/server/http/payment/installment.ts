import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { settleInvoiceManually } from '@/modules/billing/server/settle'
import { amountInRial, installmentCredentials, isInstallmentGateway } from '@/modules/billing/server/gateways'
import { legacyNumber } from '@/shared/money'
import { revertInstallment, settleInstallment, verifyInstallment, type InstallmentItem, type Reference } from '@/modules/billing/infrastructure/installments'

// Installment providers send the customer back here (GET or POST, depending
// on the provider). The payment is verified with the provider, confirmed on
// our side, and only then settled/delivered; if our side cannot honour it
// (e.g. sold out meanwhile) the provider payment is reverted.

const site = () => (process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
const redirect = (req: NextRequest, path: string) => Response.redirect(new URL(path, site() || req.nextUrl.origin), 303)

async function params(req: NextRequest) {
  const values: Record<string, string> = {}
  req.nextUrl.searchParams.forEach((value, key) => { values[key] = value })
  if (req.method === 'POST') {
    const type = req.headers.get('content-type') || ''
    if (type.includes('application/json')) {
      const body = await req.json().catch(() => null) as Record<string, unknown> | null
      for (const [key, value] of Object.entries(body || {})) if (typeof value === 'string' || typeof value === 'number') values[key] = String(value)
    } else {
      const form = await req.formData().catch(() => null)
      form?.forEach((value, key) => { if (typeof value === 'string') values[key] = value })
    }
  }
  return values
}

async function finishInbox(id: number, status: 'DONE' | 'FAILED', error = '') {
  await db.webhookInbox.update({ where: { id }, data: { status, processedAt: status === 'DONE' ? new Date() : null, lockedAt: null, lastError: error.slice(0, 2000) } }).catch(() => null)
}

/** Did the provider say the customer approved the purchase? */
function approved(provider: string, values: Record<string, string>) {
  if (values.failed === '1') return false
  if (provider === 'SNAPPPAY') return String(values.state || '').toUpperCase() === 'OK'
  if (provider === 'DIGIPAY') return String(values.result || '').toUpperCase() === 'SUCCESS' && /^[\w-]{4,64}$/.test(values.trackingCode || '')
  return true // Azki: success returns to redirect_uri, failure to fallback_uri (?failed=1); verification decides.
}

async function handle(req: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const provider = String((await context.params).provider || '').toUpperCase()
  if (!isInstallmentGateway(provider)) return new Response('unknown provider', { status: 404 })
  const values = await params(req)
  await db.webhookLog.create({ data: { source: provider.toLowerCase(), payload: JSON.stringify(values).slice(0, 4000), valid: !!values.ref } }).catch(() => null)
  const number = String(values.ref || values.transactionId || values.providerId || values.provider_id || '')
  if (!/^[A-Za-z0-9-]{3,40}$/.test(number)) return redirect(req, '/payment/result?failed=1')
  const invoice = await db.invoice.findUnique({ where: { number }, include: { gateway: true, order: { include: { lines: true } } } })
  if (!invoice || invoice.gateway?.provider !== provider || !invoice.providerTxnId) return redirect(req, '/payment/result?failed=1')
  const done = invoice.orderId ? `/payment/result?order=${invoice.orderId}` : `/invoice/${invoice.number}`
  const failed = (reason: string) => `${invoice.orderId ? `/payment/result?order=${invoice.orderId}&failed=1` : `/invoice/${invoice.number}?failed=1`}&reason=${encodeURIComponent(reason)}`
  if (invoice.status === 'PAID') return redirect(req, done)
  // A token posted back must be the one we created (SnappPay sends it along).
  if (values.paymentToken && values.paymentToken !== invoice.providerTxnId) return redirect(req, failed('شناسهٔ پرداخت با فاکتور مطابقت ندارد'))
  if (!approved(provider, values)) return redirect(req, failed('خرید اقساطی تأیید نشد یا لغو شد'))

  const credentials = installmentCredentials(invoice.gateway)
  const ref: Reference = { token: invoice.providerTxnId, reference: invoice.number, trackingCode: values.trackingCode, type: values.type }
  const inbox = await db.webhookInbox.upsert({
    where: { provider_eventKey: { provider, eventKey: invoice.providerTxnId } },
    create: { provider, eventKey: invoice.providerTxnId, payload: JSON.stringify({ invoiceId: invoice.id, ...ref }) },
    update: {},
  })
  if (inbox.status === 'DONE') return redirect(req, done)
  const claim = await db.webhookInbox.updateMany({
    where: { id: inbox.id, OR: [{ status: { in: ['PENDING', 'FAILED'] } }, { status: 'PROCESSING', lockedAt: { lt: new Date(Date.now() - 5 * 60_000) } }] },
    data: { status: 'PROCESSING', lockedAt: new Date(), attempts: { increment: 1 }, lastError: '' },
  })
  if (claim.count !== 1) return redirect(req, done)

  // 1. Verify with the provider (one retry on a lost answer).
  let verify = await verifyInstallment(credentials, ref)
  if (!verify.ok && verify.network) verify = await verifyInstallment(credentials, ref)
  if (!verify.ok) {
    await finishInbox(inbox.id, 'FAILED', `verify: ${verify.message}`)
    return redirect(req, failed(`${verify.message} — اگر اعتباری از شما کسر شده باشد، سرویس‌دهنده آن را برمی‌گرداند`))
  }

  // 2. Confirm on our side (stock, invoice, fulfilment).
  const settled = await settleInvoiceManually({ invoiceId: invoice.id, providerTxnId: invoice.providerTxnId, amount: undefined, raw: { provider, ...ref } })
  if (!settled.ok) {
    const revert = await revertInstallment(credentials, ref)
    await finishInbox(inbox.id, 'FAILED', `settlement ${settled.message}; revert ${revert.ok ? 'ok' : revert.message}`)
    logEvent('error', 'installment.reverted', { provider, invoiceId: invoice.id, reason: settled.message, revert: revert.ok })
    return redirect(req, failed(`سفارش ثبت نشد (${settled.message}). خرید اقساطی لغو شد`))
  }

  // 3. Settle / deliver with the provider (retried once; kept for staff follow-up on failure).
  const items: InstallmentItem[] = await Promise.all((invoice.order?.lines || []).map(async (line) => ({ id: String(line.productId || line.id), name: line.name, count: line.quantity, amountRial: await amountInRial(legacyNumber(line.unitPriceMinor, line.currency), line.currency), category: 'general' })))
  let settle = await settleInstallment(credentials, ref, items)
  if (!settle.ok) settle = await settleInstallment(credentials, ref, items)
  if (!settle.ok) {
    await finishInbox(inbox.id, 'FAILED', `settle: ${settle.message} (invoice paid; settle again from the provider panel)`)
    logEvent('error', 'installment.settle_failed', { provider, invoiceId: invoice.id, message: settle.message })
  } else await finishInbox(inbox.id, 'DONE')
  return redirect(req, done)
}

export const GET_installmentCallback = handle
export const POST_installmentCallback = handle
