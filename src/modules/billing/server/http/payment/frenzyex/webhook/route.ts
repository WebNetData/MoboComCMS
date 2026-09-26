import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/platform/database/prisma'
import { verifyFrenzySignature, type FrenzyPaymentSnapshot } from '@/modules/billing/infrastructure/frenzyex'
import { settleFrenzyInvoice } from '@/modules/billing/server/frenzyex-reconciliation'

export const runtime = 'nodejs'

interface FrenzyCallback {
  event?: string
  test?: boolean
  request_id?: string
  payment_id?: string
  purchase_id?: string
  order_ref?: string
  order_id?: string
  status?: string
  payment_status?: string
  price_amount?: number | string
  price_currency?: string
  pay_amount?: number | string
  actually_paid?: number | string
  pay_currency?: string
  asset?: string
  tx_hash?: string
  paid_at?: string
  game_discount_toman?: number | string
}

async function finishInbox(id: number, status: 'DONE' | 'FAILED', error = '') {
  await db.webhookInbox.update({
    where: { id },
    data: { status, processedAt: status === 'DONE' ? new Date() : null, lockedAt: null, lastError: error.slice(0, 2000) },
  }).catch(() => {})
}

async function candidateSecrets(): Promise<string[]> {
  const rows = await db.gateway.findMany({ where: { provider: 'FRENZYEX', secretKey: { not: '' } }, select: { secretKey: true } })
  const values: string[] = rows.map((row: { secretKey: string }) => String(row.secretKey || '').trim()).filter(Boolean)
  const env = String(process.env.FRENZYEX_CALLBACK_SECRET || '').trim()
  if (env) values.push(env)
  return [...new Set<string>(values)]
}

function callbackRequestId(payload: FrenzyCallback) {
  return String(payload.request_id || payload.payment_id || payload.purchase_id || '').trim()
}
function callbackOrderRef(payload: FrenzyCallback) {
  return String(payload.order_ref || payload.order_id || '').trim()
}
function callbackSnapshot(payload: FrenzyCallback, requestId: string, orderRef: string): FrenzyPaymentSnapshot {
  return {
    requestId,
    status: String(payload.status || '').trim().toLowerCase(),
    orderRef,
    amount: String(payload.price_amount ?? '').trim(),
    amountCcy: String(payload.price_currency || '').trim().toUpperCase(),
    expiresAt: '',
    paidAt: String(payload.paid_at || '').trim(),
    txHash: String(payload.tx_hash || '').trim(),
    payCurrency: String(payload.pay_currency || payload.asset || '').trim(),
    paymentMethod: '',
    raw: payload as Record<string, unknown>,
  }
}

export async function POST(req: NextRequest) {
  // FrenzyEx signs the exact raw bytes. Never verify re-serialized JSON.
  const raw = new Uint8Array(await req.arrayBuffer())
  const rawText = Buffer.from(raw).toString('utf8')
  const signature = String(req.headers.get('x-frenzy-signature') || '').trim()
  const headerEvent = String(req.headers.get('x-frenzy-event') || '').trim()
  const bodyHash = createHash('sha256').update(raw).digest('hex')
  const payload = (() => { try { return JSON.parse(rawText) as FrenzyCallback } catch { return null } })()

  if (!payload) {
    await db.webhookLog.create({ data: { source: 'frenzyex', payload: JSON.stringify({ bodyHash, error: 'invalid-json' }), valid: false } }).catch(() => {})
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const secrets = await candidateSecrets()
  const signatureValid = secrets.some((secret) => verifyFrenzySignature(raw, signature, secret))
  await db.webhookLog.create({ data: { source: 'frenzyex', payload: JSON.stringify({ bodyHash, headerEvent, payload }), valid: signatureValid } }).catch(() => {})
  if (!signatureValid) return NextResponse.json({ error: 'invalid signature' }, { status: 401 })

  const event = String(payload.event || headerEvent || '')
  if (payload.test === true || event === 'payment.test' || headerEvent === 'payment.test') return NextResponse.json({ received: true, test: true })
  if (event !== 'payment.completed' || (headerEvent && headerEvent !== 'payment.completed')) return NextResponse.json({ received: true, ignored: true })
  if (String(payload.status || '').toLowerCase() !== 'paid') return NextResponse.json({ received: true, ignored: true })

  const requestId = callbackRequestId(payload)
  const orderRef = callbackOrderRef(payload)
  if (!requestId || !orderRef) return NextResponse.json({ error: 'missing request identity' }, { status: 422 })

  let invoice = await db.invoice.findFirst({ where: { providerTxnId: requestId }, include: { gateway: true } })
  if (!invoice) invoice = await db.invoice.findUnique({ where: { number: orderRef }, include: { gateway: true } })
  if (!invoice || (invoice.gateway?.provider && invoice.gateway.provider !== 'FRENZYEX')) return NextResponse.json({ error: 'invoice not found' }, { status: 404 })
  if (invoice.number !== orderRef) return NextResponse.json({ error: 'order_ref mismatch' }, { status: 422 })
  if (invoice.providerTxnId && invoice.providerTxnId !== requestId) return NextResponse.json({ error: 'request_id mismatch' }, { status: 422 })

  const exactSecret = String(invoice.gateway?.secretKey || process.env.FRENZYEX_CALLBACK_SECRET || '').trim()
  if (!exactSecret) return NextResponse.json({ error: 'callback secret is not configured' }, { status: 500 })
  if (!verifyFrenzySignature(raw, signature, exactSecret)) return NextResponse.json({ error: 'signature does not match invoice gateway' }, { status: 401 })

  // FrenzyEx documents request_id as the callback idempotency key.
  const inbox = await db.webhookInbox.upsert({
    where: { provider_eventKey: { provider: 'FRENZYEX', eventKey: requestId } },
    create: { provider: 'FRENZYEX', eventKey: requestId, payload: rawText },
    update: { payload: rawText },
  })
  if (inbox.status === 'DONE') return NextResponse.json({ received: true, duplicate: true })
  const leaseCutoff = new Date(Date.now() - 5 * 60_000)
  const claim = await db.webhookInbox.updateMany({
    where: { id: inbox.id, OR: [{ status: { in: ['PENDING', 'FAILED'] } }, { status: 'PROCESSING', lockedAt: { lt: leaseCutoff } }] },
    data: { status: 'PROCESSING', lockedAt: new Date(), attempts: { increment: 1 }, lastError: '' },
  })
  if (claim.count !== 1) return NextResponse.json({ received: true, processing: true })

  try {
    const settled = await settleFrenzyInvoice({
      invoiceId: invoice.id,
      requestId,
      snapshot: callbackSnapshot(payload, requestId, orderRef),
      source: 'callback',
      audit: { bodyHash, signatureValid: true },
    })
    if (!settled.ok) throw new Error(settled.message || 'invoice settlement failed')
    await finishInbox(inbox.id, 'DONE')
    return NextResponse.json({ received: true, duplicate: Boolean(settled.alreadyPaid) })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finishInbox(inbox.id, 'FAILED', message)
    console.error('[mobocomcms] FrenzyEx callback failed', message)
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }
}
