import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { settleInvoiceManually } from '@/modules/billing/server/settle'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { legacyNumber } from '@/shared/money'
import { mellatInquiry, mellatMessage, mellatOrderMatches, mellatReversal, mellatSettle, mellatStartPage, mellatVerify, type MellatCredentials } from '@/modules/billing/infrastructure/mellat'

// Bank Mellat browser round-trip: /start posts the RefId to the bank; the bank
// posts the customer back to /callback, where the payment is verified,
// confirmed on our side, and only then settled (or reversed if it cannot be
// honoured, e.g. the product sold out meanwhile).

const site = () => (process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
const redirect = (req: NextRequest, path: string) => Response.redirect(new URL(path, site() || req.nextUrl.origin), 303)

/** GET /api/payment/mellat/start?ref=RefId */
export async function GET_start(req: NextRequest) {
  const ref = String(req.nextUrl.searchParams.get('ref') || '')
  if (!/^[A-Za-z0-9]{6,40}$/.test(ref)) return new Response('invalid reference', { status: 400 })
  const invoice = await db.invoice.findFirst({ where: { providerTxnId: ref }, select: { status: true, number: true, gateway: { select: { provider: true } } } })
  if (!invoice || invoice.gateway?.provider !== 'MELLAT') return new Response('payment not found', { status: 404 })
  if (!['DRAFT', 'UNPAID'].includes(invoice.status)) return redirect(req, `/invoice/${invoice.number}`)
  return new Response(mellatStartPage(ref, undefined, req.headers.get('x-nonce') || undefined), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

function field(form: FormData | null, name: string) {
  return String(form?.get(name) ?? '').trim()
}

async function finishInbox(id: number, status: 'DONE' | 'FAILED', error = '') {
  await db.webhookInbox.update({ where: { id }, data: { status, processedAt: status === 'DONE' ? new Date() : null, lockedAt: null, lastError: error.slice(0, 2000) } }).catch(() => null)
}

/** POST /api/payment/mellat/callback — the customer's browser, posted by the bank. */
export async function POST_callback(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const refId = field(form, 'RefId'), resCode = field(form, 'ResCode'), saleOrderId = field(form, 'SaleOrderId'), saleReferenceId = field(form, 'SaleReferenceId')
  const pan = field(form, 'CardHolderPan').replace(/[^\d*]/g, '').slice(0, 19)
  await db.webhookLog.create({ data: { source: 'mellat', payload: JSON.stringify({ refId, resCode, saleOrderId, saleReferenceId, pan }), valid: /^\d+$/.test(saleOrderId) } }).catch(() => null)

  if (!/^[A-Za-z0-9]{6,40}$/.test(refId)) return redirect(req, '/payment/result?failed=1')
  const invoice = await db.invoice.findFirst({ where: { providerTxnId: refId }, include: { gateway: true } })
  if (!invoice || invoice.gateway?.provider !== 'MELLAT') return redirect(req, '/payment/result?failed=1')
  const done = invoice.orderId ? `/payment/result?order=${invoice.orderId}` : `/invoice/${invoice.number}`
  const failed = (reason: string) => `${invoice.orderId ? `/payment/result?order=${invoice.orderId}&failed=1` : `/invoice/${invoice.number}?failed=1`}&reason=${encodeURIComponent(reason)}`
  if (invoice.status === 'PAID') return redirect(req, done)

  // The bank's order id embeds this invoice's number (see mellatOrderId).
  if (!mellatOrderMatches(invoice.number, saleOrderId)) return redirect(req, failed('شناسهٔ سفارش بانک با فاکتور مطابقت ندارد'))
  if (resCode !== '0' || !/^\d+$/.test(saleReferenceId)) return redirect(req, failed(mellatMessage(resCode || '17')))

  const credentials: MellatCredentials = { terminalId: invoice.gateway.apiKey.trim(), userName: invoice.gateway.accountUser.trim(), password: invoice.gateway.secretKey }
  const refs = { orderId: saleOrderId, saleOrderId, saleReferenceId }

  // One processing per bank reference, even if the browser posts twice.
  const inbox = await db.webhookInbox.upsert({
    where: { provider_eventKey: { provider: 'MELLAT', eventKey: saleReferenceId } },
    create: { provider: 'MELLAT', eventKey: saleReferenceId, payload: JSON.stringify({ refId, saleOrderId, saleReferenceId, invoiceId: invoice.id }) },
    update: {},
  })
  if (inbox.status === 'DONE') return redirect(req, done)
  const claim = await db.webhookInbox.updateMany({
    where: { id: inbox.id, OR: [{ status: { in: ['PENDING', 'FAILED'] } }, { status: 'PROCESSING', lockedAt: { lt: new Date(Date.now() - 5 * 60_000) } }] },
    data: { status: 'PROCESSING', lockedAt: new Date(), attempts: { increment: 1 }, lastError: '' },
  })
  if (claim.count !== 1) return redirect(req, done)

  // 1. Verify (43 = already verified). A lost answer is resolved with an inquiry.
  let verify = await mellatVerify(credentials, refs)
  if (verify.network) verify = await mellatInquiry(credentials, refs)
  if (verify.code !== '0' && verify.code !== '43') {
    await finishInbox(inbox.id, 'FAILED', `verify ${verify.code}: ${verify.message}`)
    const verificationMessage = verify.network
      ? `${verify.message} — وضعیت پرداخت از سوی بانک تأیید نشد؛ فاکتور و حساب خود را بررسی کنید و با پشتیبانی تماس بگیرید.`
      : `${verify.message} — در صورت کسر مبلغ، ظرف ۷۲ ساعت به حساب شما بازمی‌گردد`
    return redirect(req, failed(verificationMessage))
  }

  // 2. Confirm on our side (stock reservation, invoice paid, fulfilment).
  const settled = await settleInvoiceManually({ invoiceId: invoice.id, providerTxnId: refId, amount: undefined, raw: { provider: 'MELLAT', refId, saleOrderId, saleReferenceId, cardPan: pan } })
  if (!settled.ok) {
    const reversal = await mellatReversal(credentials, refs)
    await finishInbox(inbox.id, 'FAILED', `settlement ${settled.message}; reversal ${reversal.code}`)
    logEvent('error', 'mellat.reversed', { invoiceId: invoice.id, reason: settled.message, reversal: reversal.code })
    const reversalConfirmed = !reversal.network && (reversal.code === '0' || reversal.code === '48')
    const reversalMessage = reversalConfirmed
      ? 'برگشت تراکنش از سوی بانک تأیید شد.'
      : 'برگشت تراکنش از سوی بانک تأیید نشد؛ وضعیت فاکتور و حساب خود را بررسی کنید و با پشتیبانی تماس بگیرید.'
    return redirect(req, failed(`سفارش ثبت نشد (${settled.message}). ${reversalMessage}`))
  }

  // A wallet top-up is credited now (the durable pending row is reused, so a replay never credits twice).
  if (invoice.kind === 'WALLET_TOPUP' && invoice.userId !== null) {
    const ledger = await db.walletTx.findFirst({ where: { invoiceId: invoice.id, type: 'TOPUP' }, orderBy: { id: 'desc' } })
    const reusableTxId = ledger && ledger.status !== 'FAILED' ? ledger.id : null
    const credit = await moveWallet({
      userId: invoice.userId, amount: legacyNumber(invoice.totalMinor, invoice.currency), currency: invoice.currency, type: 'TOPUP',
      description: `Wallet top-up ${invoice.number}`, invoiceId: invoice.id, txId: reusableTxId,
      idempotencyKey: reusableTxId ? undefined : `wallet-topup-invoice:${invoice.id}`,
    })
    if (!credit.ok) logEvent('error', 'mellat.topup_credit_failed', { invoiceId: invoice.id, message: credit.message })
  }

  // 3. Settle (45 = already settled); retried once. A failure is kept for staff follow-up.
  let settle = await mellatSettle(credentials, refs)
  if (settle.code !== '0' && settle.code !== '45') settle = await mellatSettle(credentials, refs)
  if (settle.code !== '0' && settle.code !== '45') {
    await finishInbox(inbox.id, 'FAILED', `settle ${settle.code}: ${settle.message} (invoice paid; settle again from the bank panel)`)
    logEvent('error', 'mellat.settle_failed', { invoiceId: invoice.id, code: settle.code })
  } else await finishInbox(inbox.id, 'DONE')
  return redirect(req, done)
}

/** A GET to the callback (refresh / bookmark) just goes home. */
export async function GET_callback(req: NextRequest) {
  return redirect(req, '/')
}
