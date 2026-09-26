// Payment gateway registry — every provider implements this contract so new
// providers plug in without duplicating checkout, billing or admin logic.
import { db } from '@/platform/database/prisma'
import { getSettings } from '@/modules/settings/server'
import { createInvoice, plisioCurrencies } from '@/modules/billing/infrastructure/plisio'
import { createFrenzyPayment, testFrenzyCredentials } from '@/modules/billing/infrastructure/frenzyex'
import { resolveUsdTomanRate } from '@/modules/billing/domain/rates'
import { currencyScale, legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'

export type ProviderKey = 'PLISIO' | 'FRENZYEX' | 'MANUAL'

export interface ProviderMeta {
  key: ProviderKey
  label: string
  labelFa: string
  needsApiKey: boolean
  needsSecret: boolean
  supportsHostedCheckout: boolean
  hint: string
  hintFa: string
}

export const PROVIDERS: ProviderMeta[] = [
  {
    key: 'FRENZYEX',
    label: 'Currency / Rial Payment Gateway',
    labelFa: 'درگاه پرداخت ارزی ریالی',
    needsApiKey: true,
    needsSecret: true,
    supportsHostedCheckout: true,
    hint: 'Iranian card-to-card checkout via FrenzyEx. Set the callback in FrenzyEx to /api/payment/frenzyex/webhook. USD-priced items use the configured USD/Toman rate.',
    hintFa: 'کارت‌به‌کارت ایرانی از طریق FrenzyEx. آدرس Callback را در FrenzyEx روی /api/payment/frenzyex/webhook تنظیم کنید. برای پلن‌های دلاری، نرخ دلار/تومان تنظیمات سایت استفاده می‌شود.',
  },
  {
    key: 'PLISIO',
    label: 'Plisio (crypto)',
    labelFa: 'Plisio (کریپتو)',
    needsApiKey: true,
    needsSecret: true,
    supportsHostedCheckout: true,
    hint: 'Hosted crypto checkout. Requires the API key + IPN secret from your Plisio account.',
    hintFa: 'درگاه کریپتوی میزبانی‌شده. به API Key و کلید IPN از پنل Plisio نیاز دارد.',
  },
  {
    key: 'MANUAL',
    label: 'Manual transfer (card / wallet)',
    labelFa: 'پرداخت دستی (کارت / کیف پول)',
    needsApiKey: false,
    needsSecret: false,
    supportsHostedCheckout: false,
    hint: 'Shows your wallet/card instructions on the invoice; you confirm the payment in the panel.',
    hintFa: 'دستور پرداخت (شماره کارت / آدرس کیف پول) روی فاکتور نمایش داده می‌شود و شما پرداخت را تایید می‌کنید.',
  },
]

export function providerMeta(key: string): ProviderMeta {
  return PROVIDERS.find((p) => p.key === key) || PROVIDERS[1]
}

export function customerGatewayLabel(gateway: { provider: string; name?: string } | null | undefined, locale: 'fa' | 'en' = 'fa') {
  if (!gateway) return locale === 'fa' ? 'درگاه پرداخت' : 'Payment gateway'
  if (gateway.provider === 'FRENZYEX') return locale === 'fa' ? 'درگاه پرداخت ارزی ریالی' : 'Currency / Rial Payment Gateway'
  return gateway.name?.trim() || (locale === 'fa' ? providerMeta(gateway.provider).labelFa : providerMeta(gateway.provider).label)
}

export interface GatewayRuntime {
  id: number | null
  name: string
  provider: string
  apiKey: string
  secretKey: string
  fiat: string
  currencies: string
  feePercent: number
  feeBps: number
  minAmount: number
  minAmountMinor: bigint
  instructions: string
  isDefault?: boolean
  sortOrder?: number
}

export interface CheckoutGatewayOption {
  ref: string
  id: number | null
  name: string
  label: string
  provider: string
  fiat: string
  acceptedCurrencies: string[]
  feePercent: number
  minAmount: number
  isDefault: boolean
}

/** A gateway is usable only when the fields required for safe settlement exist. */
export function isGatewayUsable(gw: { provider: string; apiKey: string; secretKey?: string; instructions: string }) {
  if (gw.provider === 'MANUAL') return Boolean(gw.instructions.trim())
  if (gw.provider === 'FRENZYEX') return Boolean(gw.apiKey.trim() && String(gw.secretKey || '').trim())
  if (gw.provider === 'PLISIO') return Boolean(gw.apiKey.trim() && String(gw.secretKey || '').trim())
  return Boolean(gw.apiKey.trim())
}

function runtimeGateway(gw: any): GatewayRuntime {
  const fiat = gw.provider === 'FRENZYEX' ? 'TMN' : (gw.fiat || 'USD')
  return {
    id: gw.id,
    name: gw.name,
    provider: gw.provider,
    apiKey: gw.apiKey,
    secretKey: gw.secretKey,
    fiat,
    currencies: gw.currencies,
    feePercent: gw.feePercent,
    feeBps: gw.feeBps || Math.round((gw.feePercent || 0) * 100),
    minAmount: gw.minAmount,
    minAmountMinor: gw.minAmountMinor || toMinor(gw.minAmount || 0, fiat),
    instructions: gw.instructions,
    isDefault: Boolean(gw.isDefault),
    sortOrder: Number(gw.sortOrder) || 0,
  }
}

function envCheckoutGateways(): GatewayRuntime[] {
  const out: GatewayRuntime[] = []
  if (process.env.PLISIO_API_KEY && process.env.PLISIO_SECRET_KEY) {
    out.push({
      id: null,
      name: 'Plisio',
      provider: 'PLISIO',
      apiKey: process.env.PLISIO_API_KEY,
      secretKey: process.env.PLISIO_SECRET_KEY || '',
      fiat: process.env.PLISIO_FIAT_CURRENCY || 'USD',
      currencies: process.env.PLISIO_CURRENCIES || '',
      feePercent: 0,
      feeBps: 0,
      minAmount: 0,
      minAmountMinor: 0n,
      instructions: '',
      isDefault: false,
      sortOrder: 0,
    })
  }
  if (process.env.FRENZYEX_API_KEY && process.env.FRENZYEX_CALLBACK_SECRET) {
    out.push({
      id: null,
      name: 'درگاه پرداخت ارزی ریالی',
      provider: 'FRENZYEX',
      apiKey: process.env.FRENZYEX_API_KEY,
      secretKey: process.env.FRENZYEX_CALLBACK_SECRET,
      fiat: 'TMN',
      currencies: '',
      feePercent: 0,
      feeBps: 0,
      minAmount: 0,
      minAmountMinor: 0n,
      instructions: '',
      isDefault: false,
      sortOrder: 0,
    })
  }
  return out
}

export function checkoutGatewayRef(gateway: Pick<GatewayRuntime, 'id' | 'provider'>) {
  return gateway.id ? `db:${gateway.id}` : `env:${gateway.provider.toUpperCase()}`
}

export function gatewayAcceptedCurrencies(gateway: Pick<GatewayRuntime, 'provider' | 'fiat'>) {
  if (gateway.provider === 'FRENZYEX') return ['USD', 'TMN', 'IRT']
  return [normalizeCurrency(gateway.fiat || 'USD')]
}

/**
 * All active, usable customer-facing gateways.
 *
 * DB rows are preferred, while env fallbacks remain selectable when they are a
 * genuinely different credential set. Exact DB/env duplicates are collapsed.
 * This allows a safe migration from env-only deployments and also permits
 * several active gateway accounts at the same time.
 */
export async function listCheckoutGateways(currencyInput?: string): Promise<GatewayRuntime[]> {
  const rows = await db.gateway.findMany({
    where: { active: true },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  })
  const dbGateways = rows.filter(isGatewayUsable).map(runtimeGateway)
  const envGateways = envCheckoutGateways().filter((envGateway) => !dbGateways.some((dbGateway) =>
    dbGateway.provider === envGateway.provider
    && dbGateway.apiKey === envGateway.apiKey
    && dbGateway.secretKey === envGateway.secretKey
  ))
  const all = [...dbGateways, ...envGateways]
  if (!currencyInput) return all
  return all.filter((gateway) => gatewayAcceptsCheckoutCurrency(gateway, currencyInput))
}

export async function checkoutGatewayOptions(currencyInput?: string): Promise<CheckoutGatewayOption[]> {
  const gateways = await listCheckoutGateways(currencyInput)
  const seenLabels = new Map<string, number>()
  return gateways.map((gateway, index) => {
    const baseLabel = gateway.name?.trim() || customerGatewayLabel(gateway)
    const occurrence = (seenLabels.get(baseLabel) || 0) + 1
    seenLabels.set(baseLabel, occurrence)
    return {
      ref: checkoutGatewayRef(gateway),
      id: gateway.id,
      name: gateway.name,
      label: occurrence === 1 ? baseLabel : `${baseLabel} (${occurrence})`,
      provider: gateway.provider,
      fiat: gateway.fiat,
      acceptedCurrencies: gatewayAcceptedCurrencies(gateway),
      feePercent: gateway.feePercent,
      minAmount: gateway.minAmount,
      // The first compatible gateway is the effective fallback even when the DB
      // default does not support this checkout currency.
      isDefault: index === 0,
    }
  })
}

/** The gateway used for a checkout: explicit customer choice → effective default. */
export async function resolveCheckoutGateway(preferredRef?: string | null, currencyInput?: string): Promise<GatewayRuntime | null> {
  const candidates = await listCheckoutGateways(currencyInput)
  const requested = String(preferredRef || '').trim()
  if (!requested) return candidates[0] || null

  const normalized = /^\d+$/.test(requested) ? `db:${requested}` : requested.toLowerCase().startsWith('db:')
    ? `db:${requested.slice(3)}`
    : requested.toLowerCase().startsWith('env:')
      ? `env:${requested.slice(4).toUpperCase()}`
      : requested
  return candidates.find((gateway) => checkoutGatewayRef(gateway) === normalized) || null
}

/** Secret used to verify provider callbacks (provider row → env fallback). */
export async function resolveWebhookSecret(source = 'plisio'): Promise<string> {
  const provider = source.toUpperCase() === 'FRENZYEX' ? 'FRENZYEX' : 'PLISIO'
  const gw = await db.gateway.findFirst({
    where: { active: true, provider, secretKey: { not: '' } },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
  })
  if (gw?.secretKey) return gw.secretKey
  if (provider === 'PLISIO') return process.env.PLISIO_SECRET_KEY || ''
  return process.env.FRENZYEX_CALLBACK_SECRET || ''
}

export async function gatewayById(id: number | null | undefined) {
  if (!id) return null
  return db.gateway.findUnique({ where: { id } })
}

export function gatewayAcceptsCheckoutCurrency(gateway: GatewayRuntime, currencyInput: string) {
  const currency = normalizeCurrency(currencyInput)
  if (gateway.provider === 'FRENZYEX') return currency === 'USD' || currency === 'TMN' || currency === 'IRT'
  return normalizeCurrency(gateway.fiat || 'USD') === currency
}

export function gatewayCallbackUrl(gateway: GatewayRuntime, siteUrl: string) {
  const base = siteUrl.replace(/\/+$/, '')
  if (gateway.provider === 'FRENZYEX') return `${base}/api/payment/frenzyex/webhook`
  return `${base}/api/payment/plisio/webhook`
}

export interface GatewayInvoiceInput {
  orderNumber: string
  amount: number
  currency: string
  email?: string
  orderName: string
  callbackUrl: string
  successUrl: string
  failUrl: string
  channel?: 'web' | 'telegram'
}

export interface GatewayInvoiceResult {
  ok: boolean
  message?: string
  txnId?: string
  paymentUrl?: string
  fallbackPaymentUrl?: string
  providerAmount?: number
  providerCurrency?: string
  expiresAt?: string
  ambiguous?: boolean
  /** manual gateways: the customer pays on the invoice page instead */
  manual?: boolean
}

async function frenzyAmountToman(amount: number, currencyInput: string): Promise<bigint> {
  const currency = normalizeCurrency(currencyInput)
  if (currency === 'TMN' || currency === 'IRT') return toMinor(amount, 'TMN')
  if (currency !== 'USD') throw new Error(`FrenzyEx cannot convert ${currency} to Toman`)

  const settings = await getSettings()
  // A seeded DB value of "0" must not mask a valid production env fallback.
  const rate = resolveUsdTomanRate(settings.usdRateToman, process.env.FRENZYEX_USD_RATE_TOMAN)
  if (!rate) throw new Error('نرخ دلار به تومان تنظیم نشده است یا معتبر نیست (usdRateToman / FRENZYEX_USD_RATE_TOMAN)')

  const sourceMinor = toMinor(amount, 'USD')
  const scale = currencyScale('USD')
  // Nearest whole Toman. FrenzyEx TMN invoices are integer Toman amounts.
  return (sourceMinor * rate + scale / 2n) / scale
}

export async function createGatewayInvoice(
  gateway: GatewayRuntime,
  input: GatewayInvoiceInput
): Promise<GatewayInvoiceResult> {
  const currency = normalizeCurrency(input.currency)
  const amountMinor = toMinor(input.amount, currency)
  if (amountMinor <= 0n) return { ok: false, message: 'amount must be greater than zero' }

  if (gateway.provider === 'FRENZYEX') {
    let amountToman: bigint
    try { amountToman = await frenzyAmountToman(input.amount, currency) }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'invalid Toman conversion' } }
    if (amountToman <= 0n) return { ok: false, message: 'Toman payment amount must be greater than zero' }

    const minimumMinor = gateway.minAmountMinor || toMinor(gateway.minAmount || 0, 'TMN')
    if (minimumMinor > 0n && amountToman < minimumMinor) {
      return { ok: false, message: `amount is below the gateway minimum (${legacyNumber(minimumMinor, 'TMN')} TMN)` }
    }

    const res = await createFrenzyPayment(gateway.apiKey, {
      amountToman,
      orderRef: input.orderNumber,
      description: input.orderName,
    })
    if (!res.ok) return {
      ok: false,
      message: res.message,
      txnId: res.requestId,
      ambiguous: res.ambiguous,
      providerAmount: Number(amountToman),
      providerCurrency: 'TMN',
    }
    const paymentUrl = input.channel === 'telegram'
      ? (res.botPayUrl || res.checkoutUrl || res.payUrl)
      : (res.checkoutUrl || res.payUrl || res.botPayUrl)
    return {
      ok: true,
      txnId: res.requestId,
      paymentUrl,
      fallbackPaymentUrl: input.channel === 'telegram' ? (res.checkoutUrl || res.payUrl) : (res.botPayUrl || res.payUrl),
      providerAmount: Number(amountToman),
      providerCurrency: 'TMN',
      expiresAt: res.expiresAt,
    }
  }

  const gatewayCurrency = normalizeCurrency(gateway.fiat || 'USD')
  if (currency !== gatewayCurrency) {
    return { ok: false, message: `gateway currency mismatch (${gatewayCurrency} required, got ${currency})` }
  }
  const minimumMinor = gateway.minAmountMinor || toMinor(gateway.minAmount || 0, currency)
  if (minimumMinor > 0n && amountMinor < minimumMinor) {
    return { ok: false, message: `amount is below the gateway minimum (${legacyNumber(minimumMinor, currency)} ${currency})` }
  }

  if (gateway.provider === 'MANUAL') {
    if (!gateway.instructions.trim()) return { ok: false, message: 'manual gateway has no payment instructions configured' }
    return { ok: true, manual: true, txnId: '' }
  }

  const res = await createInvoice(
    {
      orderNumber: input.orderNumber,
      sourceAmount: input.amount,
      sourceCurrency: currency,
      email: input.email,
      orderName: input.orderName,
      callbackUrl: input.callbackUrl,
      successUrl: input.successUrl,
      failUrl: input.failUrl,
    },
    {
      apiKey: gateway.apiKey,
      fiat: gateway.fiat,
      currencies: gateway.currencies,
    }
  )
  if (!res.ok) return { ok: false, message: res.message }
  return { ok: true, txnId: res.txnId, paymentUrl: res.invoiceUrl }
}

export interface GatewayTestResult {
  ok: boolean
  message?: string
  detail?: string
}

export async function testGateway(gateway: GatewayRuntime): Promise<GatewayTestResult> {
  if (gateway.provider === 'MANUAL') {
    if (!gateway.instructions.trim()) return { ok: false, message: 'no payment instructions set', detail: 'instructions are empty' }
    return { ok: true, detail: 'manual gateway ready' }
  }
  if (!gateway.apiKey) return { ok: false, message: 'API key is missing' }
  if (gateway.provider === 'FRENZYEX') {
    if (!gateway.secretKey) return { ok: false, message: 'Callback secret is missing' }
    return testFrenzyCredentials(gateway.apiKey)
  }
  const res = await plisioCurrencies(gateway.apiKey, gateway.fiat)
  return res.ok ? { ok: true, detail: res.detail } : { ok: false, message: res.message, detail: res.detail }
}

export function maskSecret(value: string, keep = 4) {
  if (!value) return ''
  if (value.length <= keep) return '••••'
  return '••••' + value.slice(-keep)
}
