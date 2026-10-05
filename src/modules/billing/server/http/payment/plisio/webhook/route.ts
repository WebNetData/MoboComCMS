import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/platform/database/prisma'
import { verifyCallback, mapPlisioStatus, type PlisioCallbackData } from '@/modules/billing/infrastructure/plisio'
import { markInvoicePaid, recordProviderEvent, voidOpenInvoice, invoiceDueMinor } from '@/modules/billing/server/billing'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { enqueueOrderFulfillment, processFulfillmentJob } from '@/modules/fulfillment/server/jobs'
import { releaseInventoryReservation } from '@/modules/catalog/server/inventory'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'

async function finishInbox(id: number, status: 'DONE' | 'FAILED', error = '') {
  await db.webhookInbox.update({
    where: { id },
    data: { status, processedAt: status === 'DONE' ? new Date() : null, lockedAt: null, lastError: error.slice(0, 2000) },
  }).catch(() => {})
}

async function candidateSecrets(invoiceGatewaySecret = '', envOnly = false) {
  const values: string[] = []
  const exact = String(invoiceGatewaySecret || '').trim()
  if (exact) return [exact]
  if (!envOnly) {
    const rows = await db.gateway.findMany({ where: { provider: 'PLISIO', secretKey: { not: '' } }, select: { secretKey: true } })
    for (const row of rows) {
      const secret = String(row.secretKey || '').trim()
      if (secret) values.push(secret)
    }
  }
  const env = String(process.env.PLISIO_SECRET_KEY || '').trim()
  if (env) values.push(env)
  return [...new Set(values)]
}

export async function POST(req: NextRequest) {
  let payload: PlisioCallbackData | null = null
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) payload = await req.json().catch(() => null)
  else {
    const form = await req.formData().catch(() => null)
    if (form) {
      payload = {} as PlisioCallbackData
      for (const [key, value] of form.entries()) (payload as any)[key] = typeof value === 'string' ? value : ''
    }
  }
  if (!payload?.txn_id) {
    await db.webhookLog.create({ data: { source: 'plisio', payload: 'invalid-payload', valid: false } })
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  const orderNumber = String(payload.order_number || '')
  let invoice = orderNumber ? await db.invoice.findUnique({ where: { number: orderNumber }, include: { gateway: true } }) : null
  if (!invoice && orderNumber) {
    const legacyId = Number(orderNumber.replace(/^KV-/, '').split('-')[0])
    if (legacyId) invoice = await db.invoice.findFirst({ where: { orderId: legacyId }, include: { gateway: true } })
  }
  if (invoice?.gateway?.provider && invoice.gateway.provider !== 'PLISIO') {
    await db.webhookLog.create({ data: { source: 'plisio', payload: JSON.stringify(payload), valid: false } })
    return NextResponse.json({ error: 'invoice gateway mismatch' }, { status: 422 })
  }
  const invoiceGatewaySecret = invoice?.gateway?.provider === 'PLISIO' ? invoice.gateway.secretKey : ''
  const secrets = await candidateSecrets(invoiceGatewaySecret, Boolean(invoice && !invoice.gatewayId))
  const valid = secrets.some((secret) => verifyCallback(payload, secret))
  await db.webhookLog.create({ data: { source: 'plisio', payload: JSON.stringify(payload), valid } })
  if (!valid) return NextResponse.json({ error: 'invalid signature' }, { status: 422 })
  if (String((payload as any).ipn_type || 'invoice') !== 'invoice') return NextResponse.json({ received: true })

  if (!invoice) return NextResponse.json({ error: 'invoice not found' }, { status: 404 })

  const eventKey = `${payload.txn_id}:${String(payload.status || 'unknown')}`
  const inbox = await db.webhookInbox.upsert({
    where: { provider_eventKey: { provider: 'PLISIO', eventKey } },
    create: { provider: 'PLISIO', eventKey, payload: JSON.stringify(payload) },
    update: { payload: JSON.stringify(payload) },
  })
  if (inbox.status === 'DONE') return NextResponse.json({ received: true, duplicate: true })
  const leaseCutoff = new Date(Date.now() - 5 * 60_000)
  const claim = await db.webhookInbox.updateMany({
    where: { id: inbox.id, OR: [{ status: { in: ['PENDING', 'FAILED'] } }, { status: 'PROCESSING', lockedAt: { lt: leaseCutoff } }] },
    data: { status: 'PROCESSING', lockedAt: new Date(), attempts: { increment: 1 }, lastError: '' },
  })
  if (claim.count !== 1) return NextResponse.json({ received: true, processing: true })

  try {
    const order = invoice.orderId ? await db.order.findUnique({ where: { id: invoice.orderId } }) : null
    const railStatus = mapPlisioStatus(String(payload.status || ''))
    const ledgerStatus = railStatus === 'PAID' ? 'CONFIRMED' : railStatus === 'PENDING' ? 'PENDING' : 'FAILED'
    const sourceCurrency = normalizeCurrency(payload.source_currency || invoice.currency)
    if (sourceCurrency !== normalizeCurrency(invoice.currency)) {
      await finishInbox(inbox.id, 'FAILED', 'currency mismatch')
      return NextResponse.json({ error: 'currency mismatch' }, { status: 422 })
    }
    const sourceAmount = String(payload.source_amount || '0')

    await recordProviderEvent({
      provider: 'PLISIO',
      event: `invoice.${String(payload.status || 'unknown')}`,
      eventKey: `plisio:${eventKey}`,
      status: ledgerStatus,
      gatewayId: invoice.gatewayId,
      orderId: invoice.orderId,
      invoiceId: invoice.id,
      userId: invoice.userId,
      amount: sourceAmount,
      currency: sourceCurrency,
      providerTxnId: String(payload.txn_id || ''),
      cryptoCurrency: String(payload.currency || ''),
      cryptoAmount: String(payload.amount || ''),
      raw: payload,
    })

    if (railStatus === 'PAID') {
      const dueMinor = invoiceDueMinor({ totalMinor: invoice.totalMinor, walletAppliedMinor: invoice.walletAppliedMinor })
      const paidMinor = toMinor(sourceAmount, sourceCurrency)
      if (paidMinor < dueMinor) {
        await finishInbox(inbox.id, 'FAILED', 'provider amount is below invoice due')
        return NextResponse.json({ error: 'underpaid invoice' }, { status: 422 })
      }
      const settlement = await markInvoicePaid({
        invoiceId: invoice.id,
        gatewayId: invoice.gatewayId,
        providerTxnId: String(payload.txn_id || ''),
        cryptoCurrency: String(payload.currency || ''),
        cryptoAmount: String(payload.amount || ''),
        amount: legacyNumber(dueMinor, sourceCurrency),
        raw: { source: 'plisio-ipn', status: payload.status },
      })
      if (!settlement.ok) throw new Error(settlement.message || 'invoice settlement failed')

      if (invoice.kind === 'WALLET_TOPUP') {
        const pending = await db.walletTx.findFirst({ where: { invoiceId: invoice.id, type: 'TOPUP' }, orderBy: { id: 'desc' } })
        const credit = await moveWallet({
          userId: invoice.userId,
          amount: legacyNumber(invoice.totalMinor, invoice.currency),
          currency: invoice.currency,
          type: 'TOPUP',
          description: `Wallet top-up ${invoice.number}`,
          invoiceId: invoice.id,
          txId: pending?.id ?? null,
          idempotencyKey: pending ? undefined : `wallet-topup-invoice:${invoice.id}`,
        })
        if (!credit.ok) throw new Error(credit.message || 'wallet top-up failed')
      } else if (invoice.orderId) {
        const job = await enqueueOrderFulfillment({ orderId: invoice.orderId, invoiceId: invoice.id, planId: invoice.planId, productId: invoice.productId })
        if (job) await processFulfillmentJob(job.id) // best effort; durable job remains on failure
      }
    } else if (railStatus !== 'PENDING' && invoice.status === 'UNPAID') {
      // Claimed first: a payment settling at the same moment either wins the invoice or finds it void.
      const closed = await voidOpenInvoice(invoice.id, `credit released ${invoice.number} (${String(payload.status || 'failed')})`)
      if (closed.voided) {
        if (invoice.orderId) await releaseInventoryReservation(invoice.orderId)
        if (order?.status === 'PENDING') await db.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: railStatus } })
      }
    }

    await finishInbox(inbox.id, 'DONE')
    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finishInbox(inbox.id, 'FAILED', message)
    console.error('[mobocomcms] plisio webhook failed', message)
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }
}
