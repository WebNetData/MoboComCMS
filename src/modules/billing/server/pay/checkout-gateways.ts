import { isAutomaticTransfer } from '@/modules/billing/domain/auto-transfer'
import { randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { parseRoutingSnapshot } from '@/modules/billing/domain/pay-routing'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { PayError } from '@/modules/billing/domain/pay'
import { checkoutGatewayRef, createGatewayInvoice, customerGatewayLabel, gatewayCallbackUrl, listCheckoutGateways } from '@/modules/billing/server/gateways'
import { createInvoiceForOrder } from '@/modules/billing/server/billing'
import { legacyNumber } from '@/shared/money'
import { payTransaction } from './context'
import { paySettings } from './settings'
import { publicPayment } from './payments'
import { requirePayPayer } from './payer'

export type PayGatewayOption = { ref: string; id: number | null; name: string; provider: string; manual: boolean; isDefault: boolean }
export type PayGatewayStart = { invoiceId: number; gatewayRef: string; provider: string; manual: boolean; paymentUrl: string; status: 'READY' | 'STARTING' | 'UNKNOWN' | 'FAILED' }

/** Active canonical gateways; incompatible precision is never silently rounded. */
export async function payGatewayOptions(row?: { totalMinor: bigint; id?: string }, reader: Prisma.TransactionClient | typeof db = db): Promise<PayGatewayOption[]> {
  const gateways = await listCheckoutGateways('IRR', reader === db ? undefined : reader as Prisma.TransactionClient)
  const delivery = row?.id ? await reader.payBotDelivery.findUnique({ where: { paymentId: row.id }, select: { routingSnapshot: true } }) : null
  const snapshot = delivery ? parseRoutingSnapshot(delivery.routingSnapshot) : null
  const grant = row?.id && gateways.some(gw => isAutomaticTransfer(gw)) ? await reader.payPayment.findUnique({ where: { id: row.id }, select: { merchant: { select: { baleAllowed: true } }, terminal: { select: { baleEnabled: true } } } }) : null
  return gateways.filter(gw => !isAutomaticTransfer(gw) || !row?.id || Boolean(grant?.merchant.baleAllowed && grant.terminal.baleEnabled)).filter(gw => !snapshot || snapshot.gateways.some(method => method.ref === checkoutGatewayRef(gw))).filter((gw) => gw.provider !== 'FRENZYEX' || !row || row.totalMinor % 10n === 0n).map((gw, index) => ({
    ref: checkoutGatewayRef(gw), id: gw.id, name: customerGatewayLabel(gw), provider: gw.provider,
    manual: !isAutomaticTransfer(gw) && (gw.provider === 'CARD_TRANSFER' || gw.provider === 'MANUAL'), isDefault: index === 0,
  }))
}

/** Never navigate to another Telegram bot, including an HTTP bot deep link. */
function safeWebPaymentUrl(raw: string, origin: string): string {
  try {
    const url = new URL(raw, origin)
    if (url.username || url.password || !['https:', ...(process.env.NODE_ENV === 'production' ? [] : ['http:'])].includes(url.protocol)) return ''
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (['t.me', 'telegram.me', 'telegram.dog', 'telegram.org'].some((v) => host === v || host.endsWith('.' + v))) return ''
    return url.href
  } catch { return '' }
}

function siteOrigin() {
  try {
    const site = new URL(process.env.NEXTAUTH_URL || '')
    if (site.username || site.password || (site.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && site.protocol === 'http:'))) throw new Error()
    return site.origin
  } catch { throw new PayError('نشانی امن سایت تنظیم نشده است', 503, 'PAY_NOT_READY') }
}

/** A STARTING claim is never automatically retried after a lost provider response. */
export async function startPayGateway(req: NextRequest, id: string, input: Record<string, unknown>): Promise<PayGatewayStart> {
  const selected = typeof input.gatewayRef === 'string' ? input.gatewayRef.trim() : ''
  const gateway = (await listCheckoutGateways('IRR')).find((gw) => checkoutGatewayRef(gw) === selected)
  if (!gateway) throw new PayError('درگاه فعال پیدا نشد', 404)
  const origin = siteOrigin(), token = randomBytes(24).toString('base64url')
  const manual = !isAutomaticTransfer(gateway) && (gateway.provider === 'CARD_TRANSFER' || gateway.provider === 'MANUAL')
  const claimed = await payTransaction(async (tx) => {
    if (!(await isModuleEnabled('mobocom-pay', tx))) throw new PayError('درگاه غیرفعال است', 404)
    const row = await publicPayment(tx, id)
    const payer = await requirePayPayer(req, id, tx)
    if (!(await payGatewayOptions(row, tx)).some(method => method.ref === selected)) throw new PayError('این روش برای این سفارش مجاز یا آماده نیست', 409)
    const settings = await paySettings.read(tx)
    if (row.status !== 'PENDING' || row.expiresAt <= new Date()) throw new PayError('مهلت یا وضعیت پرداخت تغییر کرده است', 409)
    if (!settings.incomingEnabled || row.merchant.status !== 'ACTIVE' || !row.terminal.active) throw new PayError('دریافت این پایانه متوقف شده است', 409)
    const owner = await tx.user.findUnique({ where: { id: row.merchant.userId }, select: { status: true } })
    if (owner?.status !== 'ACTIVE' || await globalAuthenticationDenied(row.merchant.userId, new Date(), tx)) throw new PayError('پذیرنده در دسترس نیست', 409)
    if (gateway.id && !await tx.gateway.count({ where: { id: gateway.id, active: true, provider: gateway.provider } })) throw new PayError('درگاه دیگر فعال نیست', 409)
    if (gateway.provider === 'CARD_TRANSFER' && !isAutomaticTransfer(gateway) && (!row.bankAccountId || !row.bankAccount?.active)) throw new PayError('حساب بانکی فعال نیست', 409)
    if (row.totalMinor > BigInt(Number.MAX_SAFE_INTEGER) || row.totalMinor <= 0n) throw new PayError('مبلغ برای این مسیر قابل پردازش نیست', 422)
    if (gateway.provider === 'FRENZYEX' && row.totalMinor % 10n !== 0n) throw new PayError('مبلغ این درگاه باید مضرب ده ریال باشد', 422)
    if (row.gatewayAttemptRef && row.gatewayAttemptRef !== selected) throw new PayError('پرداخت قبلاً به روش دیگری متصل شده است', 409)
    if (row.invoiceId) {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: row.invoiceId } })
      if (row.gatewayAttemptStatus === 'READY') return { existing: { invoiceId: invoice.id, gatewayRef: selected, provider: gateway.provider, manual, paymentUrl: manual ? '' : invoice.paymentUrl, status: 'READY' as const } }
      if (row.gatewayAttemptStatus !== 'FAILED') return { existing: { invoiceId: invoice.id, gatewayRef: selected, provider: gateway.provider, manual, paymentUrl: '', status: row.gatewayAttemptStatus === 'STARTING' ? 'STARTING' as const : 'UNKNOWN' as const } }
      // A definite failure may only retry the same invoice and same gateway.
      if (invoice.status !== 'UNPAID' || invoice.providerTxnId || invoice.paymentUrl) throw new PayError('وضعیت درگاه نیاز به بررسی دارد', 409)
    }
    const invoice = row.invoiceId ? await tx.invoice.findUniqueOrThrow({ where: { id: row.invoiceId } }) : await createInvoiceForOrder({
      userId: null, kind: 'PAY_COLLECTION', currency: 'IRR', subtotal: row.totalMinor.toString(), gatewayId: gateway.id,
      idempotencyKey: 'pay-collection:' + row.id, notes: 'پرداخت مشتری پذیرنده',
    }, tx)
    const changed = await tx.payPayment.updateMany({
      where: { id, status: 'PENDING', invoiceId: row.invoiceId, gatewayAttemptStatus: row.gatewayAttemptStatus, gatewayAttemptToken: row.gatewayAttemptToken },
      data: { invoiceId: invoice.id, gatewayAttemptRef: selected, gatewayAttemptProvider: gateway.provider, gatewayAttemptStatus: 'STARTING', gatewayAttemptToken: token, gatewayAttemptAt: new Date() },
    })
    if (changed.count !== 1) throw new PayError('پرداخت هم‌زمان تغییر کرده است', 409)
    // Frenzy callbacks require a durable expected exact provider amount before network I/O.
    if (gateway.provider === 'FRENZYEX') {
      const amount = row.totalMinor / 10n
      await tx.payment.upsert({ where: { eventKey: `pay:gateway-request:${invoice.id}` }, update: {}, create: {
        eventKey: `pay:gateway-request:${invoice.id}`, invoiceId: invoice.id, gatewayId: gateway.id,
        userId: null, provider: gateway.provider, amount: legacyNumber(amount, 'TMN'), amountMinor: amount,
        currency: 'TMN', status: 'PENDING', raw: JSON.stringify({ event: 'payment.requested', source: 'mobocom-pay' }),
      } })
    }
    return { invoice, phone: payer.phone, amount: Number(row.totalMinor) }
  })
  if (claimed.existing) return claimed.existing

  let outcome: Awaited<ReturnType<typeof createGatewayInvoice>>
  try {
    const back = `${origin}/pay/${encodeURIComponent(id)}`
    outcome = await createGatewayInvoice(gateway, { orderNumber: claimed.invoice.number, amount: claimed.amount, currency: 'IRR',
      orderName: 'پرداخت پذیرنده موبوکام', callbackUrl: gatewayCallbackUrl(gateway, origin), successUrl: back, failUrl: back,
      channel: 'web', allowBotRedirect: false, mobile: claimed.phone })
  } catch {
    outcome = { ok: false, ambiguous: true }
  }
  const paymentUrl = outcome.paymentUrl ? safeWebPaymentUrl(outcome.paymentUrl, origin) : ''
  const uncertain = Boolean(outcome.ambiguous || (outcome.ok && !manual && !paymentUrl))
  const status = uncertain ? 'UNKNOWN' : outcome.ok ? 'READY' : 'FAILED'
  const saved = await payTransaction(async (tx) => {
    const row = await tx.payPayment.findUniqueOrThrow({ where: { id } })
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: claimed.invoice.id } })
    if (row.gatewayAttemptToken !== token || row.gatewayAttemptStatus !== 'STARTING') return false
    // A verified callback can win the race; never overwrite its transaction reference.
    if (invoice.status === 'PAID') return true
    const updated = await tx.invoice.updateMany({ where: { id: invoice.id, status: 'UNPAID', providerTxnId: '', paymentUrl: '' }, data: {
      providerTxnId: outcome.txnId || '', paymentUrl: status === 'READY' && !manual ? paymentUrl : '',
    } })
    if (updated.count !== 1) throw new PayError('وضعیت فاکتور تغییر کرده است', 409)
    const changed = await tx.payPayment.updateMany({ where: { id, status: 'PENDING', gatewayAttemptStatus: 'STARTING', gatewayAttemptToken: token }, data: { gatewayAttemptStatus: status } })
    if (changed.count !== 1) throw new PayError('وضعیت پرداخت تغییر کرده است', 409)
    return true
  })
  if (!saved) throw new PayError('وضعیت درگاه نیاز به بررسی دارد', 409)
  return { invoiceId: claimed.invoice.id, gatewayRef: selected, provider: gateway.provider, manual, paymentUrl: status === 'READY' ? paymentUrl : '', status }
}
