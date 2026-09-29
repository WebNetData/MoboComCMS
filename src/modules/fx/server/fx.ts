import dns from 'node:dns/promises'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { readJsonSetting, setSetting, writeJsonSetting } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { isPrivateAddress } from '@/modules/server-panel/domain/downloads'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { legacyNumber, minorToDecimal, normalizeCurrency, toMinor } from '@/shared/money'
import {
  DEFAULT_FX, FX_CODES, FX_CURRENCIES, FxError, fillCrossRates, fxBreakdown, fxName, fxPrice, isLocalCurrency, jumpPercent,
  normalizeFxConfig, parseProviderRates, percentToBps, bpsToPercent, scaleAlong, screenRates, type FxConfig, type Rates,
} from '@/modules/fx/domain/fx'

/**
 * Exchange rates and foreign-currency pricing: the live rate of each currency
 * (fetched from an Iranian market API on a schedule, or set by hand), the
 * guard against a bad feed (a big jump waits for approval), and repricing of
 * every product whose cost is in dollars, euros, …
 */

const CONFIG_KEY = 'fx.config.v1'
const LAST_RUN_KEY = 'fx.lastRun'
const TIMEOUT_MS = 10_000

// ------------------------------------------------------------------ config

export async function getFxConfig(): Promise<FxConfig> {
  const stored = await readJsonSetting(CONFIG_KEY)
  try { return normalizeFxConfig(stored, DEFAULT_FX) } catch { return { ...DEFAULT_FX } }
}

export async function saveFxConfig(input: Record<string, unknown>): Promise<FxConfig> {
  const previous = await getFxConfig()
  // The form shows a mask; an untouched mask keeps the stored (encrypted) key.
  const apiKey = typeof input.apiKey === 'string' && !input.apiKey.startsWith('••••') ? input.apiKey.trim() : undefined
  const next = normalizeFxConfig({ ...input, apiKey: apiKey === undefined ? previous.apiKey : apiKey ? encryptPanelCredential(apiKey) : '' }, previous)
  if (next.provider === 'custom' && !next.customUrl) throw new FxError('نشانی API سفارشی را وارد کنید')
  if (next.provider === 'custom' && !Object.keys(next.customMap).length) throw new FxError('حداقل برای یک ارز مسیر مقدار در پاسخ JSON را مشخص کنید')
  if ((next.provider === 'navasan' || next.provider === 'brsapi') && !next.apiKey) throw new FxError('کلید API این سرویس را وارد کنید')
  await writeJsonSetting(CONFIG_KEY, next)
  return next
}

function plainKey(config: FxConfig) {
  if (!config.apiKey) return ''
  try { return decryptPanelCredential(config.apiKey) } catch { throw new FxError('کلید API قابل خواندن نیست؛ دوباره آن را ذخیره کنید') }
}

export function publicFxConfig(config: FxConfig) {
  let hint = ''
  try { const plain = config.apiKey ? decryptPanelCredential(config.apiKey) : ''; hint = plain ? `••••${plain.slice(-4)}` : '' } catch { hint = '••••' }
  return { ...config, apiKey: hint, hasKey: !!config.apiKey }
}

// ------------------------------------------------------------------ rates

export async function loadRates(): Promise<Rates> {
  const rows = await db.currencyRate.findMany().catch(() => [])
  return Object.fromEntries(rows.map((row) => [row.code, row.rate]))
}

async function assertPublicUrl(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' && process.env.FX_ALLOW_HTTP !== '1') throw new FxError('نشانی API باید https باشد')
  if (process.env.FX_ALLOW_PRIVATE === '1') return url
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = /^[\d.]+$|:/.test(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => { throw new FxError(`نام ${host} پیدا نشد`) })).map((row) => row.address)
  if (addresses.some(isPrivateAddress)) throw new FxError('نشانی‌های داخلی شبکه مجاز نیستند')
  return url
}

async function getJson(url: string): Promise<unknown> {
  const target = await assertPublicUrl(url)
  const response = await fetch(target, { headers: { Accept: 'application/json', 'User-Agent': 'MoboComCMS/1.0 (+rates)' }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) })
    .catch((error) => { throw new FxError(`ارتباط با ${target.hostname} برقرار نشد: ${error instanceof Error ? error.message : ''}`) })
  if (!response.ok) throw new FxError(`پاسخ ${target.hostname}: خطای ${response.status}`)
  const text = await response.text()
  if (text.length > 2_000_000) throw new FxError('پاسخ سرویس نرخ بیش از حد بزرگ است')
  try { return JSON.parse(text) } catch { throw new FxError('پاسخ سرویس نرخ JSON معتبر نیست') }
}

/** Raw rates from the configured source, plus world cross rates for the rest. */
export async function fetchRates(config: FxConfig): Promise<{ rates: Rates; source: string; crossed: string[] }> {
  let rates: Rates = {}
  const key = plainKey(config)
  if (config.provider === 'navasan') rates = parseProviderRates('navasan', await getJson(`https://api.navasan.tech/latest/?api_key=${encodeURIComponent(key)}`), config)
  else if (config.provider === 'brsapi') rates = parseProviderRates('brsapi', await getJson(`https://BrsApi.ir/Api/Market/Gold_Currency.php?key=${encodeURIComponent(key)}`), config)
  else if (config.provider === 'custom') rates = parseProviderRates('custom', await getJson(config.customUrl.replace('{key}', encodeURIComponent(key))), config)
  const wanted = config.currencies
  const direct = Object.keys(rates)
  if (config.crossRates && wanted.some((code) => !rates[code])) {
    // Manual mode crosses from the dollar rate the admin set.
    const base = rates.USD ? rates : { ...rates, USD: (await db.currencyRate.findUnique({ where: { code: 'USD' } }))?.rate || 0 }
    if (base.USD) {
      try {
        const world = await getJson(process.env.FX_CROSS_URL || 'https://open.er-api.com/v6/latest/USD') as { rates?: Record<string, unknown> }
        rates = fillCrossRates(base, world?.rates || {}, wanted)
      } catch (error) {
        logEvent('warn', 'fx.cross_failed', { error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  const picked = Object.fromEntries(Object.entries(rates).filter(([code]) => wanted.includes(code) && (config.provider !== 'manual' || code !== 'USD')))
  return { rates: picked, source: config.provider, crossed: Object.keys(picked).filter((code) => !direct.includes(code)) }
}

async function notifyAdmins(title: string, body: string) {
  const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true }, take: 20 })
  await Promise.all(admins.map((admin) => createInboxEvent({
    userId: admin.id, kind: 'FX_RATE', dedupeKey: `fx:${title}:${new Date().toISOString().slice(0, 13)}:${admin.id}`,
    titleFa: title, titleEn: 'Exchange rate needs review', bodyFa: body, bodyEn: body, href: '/admin/store/currency',
  }).catch(() => undefined)))
}

/** Writes new rates, logs them and reprices the products that follow them. */
async function applyRates(values: Rates, source: (code: string) => string) {
  const codes = Object.keys(values)
  if (!codes.length) return 0
  const now = new Date()
  for (const code of codes) {
    await db.currencyRate.upsert({
      where: { code }, create: { code, rate: values[code], source: source(code), fetchedAt: now },
      update: { rate: values[code], source: source(code), fetchedAt: now, pendingRate: null, pendingAt: null },
    })
  }
  const repriced = await repriceProducts({ currencies: codes })
  await db.currencyRateLog.createMany({ data: codes.map((code) => ({ code, rate: values[code], source: source(code), products: repriced.byCurrency[code] || 0 })) })
  const config = await getFxConfig()
  if (config.syncGatewayRate && values.USD) await setSetting('usdRateToman', String(Math.round(values.USD)))
  return repriced.count
}

export type RefreshResult = { applied: Rates; held: Rates; repriced: number; source: string; error?: string }

/** Fetches, screens and applies rates. `force` also runs in manual mode (cross rates only). */
export async function refreshRates(): Promise<RefreshResult> {
  const config = await getFxConfig()
  await setSetting(LAST_RUN_KEY, new Date().toISOString())
  const { rates, source, crossed } = await fetchRates(config)
  if (!Object.keys(rates).length) {
    if (config.provider === 'manual') return { applied: {}, held: {}, repriced: 0, source }
    throw new FxError('سرویس نرخ هیچ نرخ معتبری برنگرداند؛ کلید API و تنظیمات را بررسی کنید')
  }
  const rows = await db.currencyRate.findMany()
  const current = Object.fromEntries(rows.map((row) => [row.code, row.rate]))
  const locked = rows.filter((row) => row.locked).map((row) => row.code)
  const { apply, hold } = screenRates(current, rates, config.maxJumpPercent, locked)
  const repriced = await applyRates(apply, (code) => (crossed.includes(code) ? 'cross' : source))
  // Mark fetched-but-unchanged rates as fresh.
  const fresh = Object.keys(rates).filter((code) => !(code in apply) && !(code in hold) && !locked.includes(code))
  if (fresh.length) await db.currencyRate.updateMany({ where: { code: { in: fresh } }, data: { fetchedAt: new Date() } })
  for (const [code, rate] of Object.entries(hold)) {
    const row = rows.find((item) => item.code === code)
    if (row?.pendingRate === rate) continue
    await db.currencyRate.update({ where: { code }, data: { pendingRate: rate, pendingAt: new Date() } })
    await notifyAdmins(`نرخ ${fxName(code)} ${jumpPercent(current[code], rate).toFixed(1)}٪ جابه‌جا شد`, `نرخ تازه ${Math.round(rate).toLocaleString('fa-IR')} تومان منتظر تأیید شماست؛ تا تأیید، قیمت‌ها با نرخ قبلی می‌مانند.`)
  }
  logEvent('info', 'fx.refreshed', { source, applied: Object.keys(apply), held: Object.keys(hold), repriced })
  return { applied: apply, held: hold, repriced, source }
}

/** Scheduler entry: refreshes when the configured interval has passed. */
export async function runFxJob() {
  const config = await getFxConfig()
  if (config.provider === 'manual' && !config.crossRates) return
  const last = (await db.setting.findUnique({ where: { key: LAST_RUN_KEY } }).catch(() => null))?.value
  if (last && Date.now() - new Date(last).getTime() < config.intervalMinutes * 60_000 - 30_000) return
  try { await refreshRates() } catch (error) {
    logEvent('warn', 'fx.refresh_failed', { error: error instanceof Error ? error.message : String(error) })
  }
}

/** The admin sets a rate by hand; `lock` keeps automatic updates off it. */
export async function setManualRate(code: string, rate: number, lock: boolean) {
  if (!FX_CODES.includes(code)) throw new FxError('ارز پشتیبانی نمی‌شود')
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1e9) throw new FxError('نرخ معتبر نیست')
  const clean = rate >= 100 ? Math.round(rate) : Math.round(rate * 100) / 100
  const repriced = await applyRates({ [code]: clean }, () => 'MANUAL')
  await db.currencyRate.update({ where: { code }, data: { locked: lock } })
  return repriced
}

export async function setRateLock(code: string, locked: boolean) {
  await db.currencyRate.update({ where: { code }, data: { locked } })
}

export async function approvePending(code: string) {
  const row = await db.currencyRate.findUnique({ where: { code } })
  if (!row?.pendingRate) throw new FxError('نرخی در انتظار تأیید نیست')
  return applyRates({ [code]: row.pendingRate }, () => row.source === 'MANUAL' ? 'MANUAL' : `${row.source}`)
}

export async function rejectPending(code: string) {
  await db.currencyRate.update({ where: { code }, data: { pendingRate: null, pendingAt: null } })
}

// ------------------------------------------------------------------ products

type FxFields = { pricingMode: string; fxCurrency: string; fxAmountMinor: bigint; fxCompareAtMinor: bigint; fxMemberMinor: bigint; markupBps: number; markupFixedMinor: bigint; currency: string }

const roundFor = (currency: string, roundToman: number) => (currency === 'IRT' || currency === 'TMN' ? roundToman : currency === 'IRR' ? roundToman * 10 : 1)

function priceOf(row: FxFields, amount: bigint, rates: Rates, roundToman: number) {
  return fxPrice({ baseMinor: amount, baseCurrency: row.fxCurrency, sellCurrency: row.currency, markupBps: row.markupBps, fixedMinor: row.markupFixedMinor, roundTo: roundFor(row.currency, roundToman) }, rates)
}

/** Selling prices of an FX product (and of its variants' own costs). */
export function fxProductPrices(row: FxFields, rates: Rates, roundToman: number) {
  const priceMinor = priceOf(row, row.fxAmountMinor, rates, roundToman)
  const compareAtMinor = row.fxCompareAtMinor > row.fxAmountMinor ? priceOf(row, row.fxCompareAtMinor, rates, roundToman) : 0n
  const memberPriceMinor = row.fxMemberMinor > 0n && row.fxMemberMinor < row.fxAmountMinor ? priceOf(row, row.fxMemberMinor, rates, roundToman) : 0n
  return {
    priceMinor,
    compareAtMinor: compareAtMinor > priceMinor ? compareAtMinor : 0n,
    memberPriceMinor: memberPriceMinor > 0n && memberPriceMinor < priceMinor ? memberPriceMinor : 0n,
    variant: (amount: bigint) => (amount > 0n ? priceOf(row, amount, rates, roundToman) : priceMinor),
  }
}

const decimalInput = (value: unknown, currency: string, label: string) => {
  const text = String(value ?? '').trim().replace(/[,،٬\s]/g, '')
  if (!text) return 0n
  try {
    const minor = toMinor(text, currency)
    if (minor < 0n) throw new Error()
    return minor
  } catch { throw new FxError(`${label} معتبر نیست`) }
}

/**
 * Product form → FX fields and the computed prices. Returns null for a fixed
 * price product. The rest of the product input then validates the computed
 * prices exactly like typed ones.
 */
export async function fxProductInput(b: Record<string, any>, existing: Partial<FxFields> | undefined, sellCurrency: string) {
  const mode = String(b?.pricingMode ?? existing?.pricingMode ?? 'FIXED')
  if (mode !== 'FX') return b?.pricingMode === 'FIXED' ? { fields: { pricingMode: 'FIXED' }, prices: null } : null
  const fxCurrency = normalizeCurrency(b?.fxCurrency ?? existing?.fxCurrency ?? 'USD')
  if (!FX_CODES.includes(fxCurrency)) throw new FxError('ارز قیمت پایه پشتیبانی نمی‌شود')
  if (!isLocalCurrency(sellCurrency) && sellCurrency === fxCurrency) throw new FxError('ارز پایه و واحد فروش یکی است؛ قیمت ثابت بگذارید')
  const amount = (key: string, stored: bigint | undefined, label: string) => (b?.[key] !== undefined ? decimalInput(b[key], fxCurrency, label) : stored ?? 0n)
  const fields = {
    pricingMode: 'FX', fxCurrency,
    fxAmountMinor: amount('fxAmount', existing?.fxAmountMinor, 'قیمت ارزی'),
    fxCompareAtMinor: amount('fxCompareAt', existing?.fxCompareAtMinor, 'قیمت ارزی قبل از تخفیف'),
    fxMemberMinor: amount('fxMemberPrice', existing?.fxMemberMinor, 'قیمت ارزی اعضای VIP'),
    markupBps: b?.markupPercent !== undefined ? percentToBps(b.markupPercent) : existing?.markupBps ?? 0,
    markupFixedMinor: b?.markupFixed !== undefined ? decimalInput(b.markupFixed, sellCurrency, 'سود ثابت') : existing?.markupFixedMinor ?? 0n,
  }
  if (fields.fxAmountMinor <= 0n) throw new FxError('قیمت ارزی محصول را وارد کنید')
  if (fields.fxCompareAtMinor > 0n && fields.fxCompareAtMinor <= fields.fxAmountMinor) throw new FxError('قیمت ارزی قبل از تخفیف باید بیشتر از قیمت ارزی باشد')
  if (fields.fxMemberMinor > 0n && fields.fxMemberMinor >= fields.fxAmountMinor) throw new FxError('قیمت ارزی VIP باید کمتر از قیمت ارزی باشد')
  const [rates, config] = await Promise.all([loadRates(), getFxConfig()])
  const prices = fxProductPrices({ ...fields, currency: sellCurrency }, rates, config.roundToman)
  return { fields: { ...fields, repricedAt: new Date() }, prices, fxCurrency }
}

/** A variant's foreign cost from its old price relative to the product's (0 = same as the product). */
export function proportionalCost(productCost: bigint, variantPrice: number, productPrice: number): bigint {
  if (!(productCost > 0n) || !Number.isFinite(variantPrice) || !Number.isFinite(productPrice) || variantPrice <= 0 || productPrice <= 0) return 0n
  const ratio = variantPrice / productPrice
  if (Math.abs(ratio - 1) < 0.0005) return 0n
  const minor = BigInt(Math.max(1, Math.round(Number(productCost) * ratio)))
  return minor
}

/** Rewrites the price fields of a product body with the FX-computed ones (variants included). */
export async function applyFxToBody(b: Record<string, any>, existing: Partial<FxFields> | undefined, sellCurrency: string): Promise<{ body: Record<string, any>; fields: Record<string, unknown> }> {
  const fx = await fxProductInput(b, existing, sellCurrency)
  if (!fx?.prices) return { body: b, fields: fx?.fields || {} }
  const { prices } = fx
  const decimal = (minor: bigint) => (minor > 0n ? minorToDecimal(minor, sellCurrency) : '')
  const body: Record<string, any> = { ...b, price: decimal(prices.priceMinor), compareAtPrice: decimal(prices.compareAtMinor), memberPrice: decimal(prices.memberPriceMinor) }
  if (Array.isArray(b.variants)) {
    // Switching a fixed-price product to FX: a variant without its own foreign cost keeps its price
    // difference (a white shirt dearer than a black one) by getting a cost in the same proportion.
    const switching = existing?.pricingMode !== 'FX'
    const oldProduct = Number(String(b.price ?? '').replace(/[,،٬\s]/g, ''))
    body.variants = b.variants.map((variant: Record<string, unknown>) => {
      let own = decimalInput(variant.fxAmount, fx.fxCurrency, 'قیمت ارزی تنوع')
      if (!own && switching) own = proportionalCost(fx.fields.fxAmountMinor, Number(variant.price), oldProduct)
      return { ...variant, fxAmountMinor: own, price: decimal(prices.variant(own)), compareAtPrice: '', memberPrice: '' }
    })
  }
  return { body, fields: fx.fields }
}

/**
 * Recomputes FX-priced products (all, or those in `currencies`). Unchanged
 * prices are skipped; list and VIP prices of variants follow proportionally.
 */
export async function repriceProducts(filter: { currencies?: string[]; ids?: number[] } = {}) {
  const [rates, config] = await Promise.all([loadRates(), getFxConfig()])
  const products = await db.product.findMany({
    where: { pricingMode: 'FX', ...(filter.currencies ? { fxCurrency: { in: filter.currencies } } : {}), ...(filter.ids ? { id: { in: filter.ids } } : {}) },
    select: { id: true, currency: true, priceMinor: true, compareAtMinor: true, memberPriceMinor: true, pricingMode: true, fxCurrency: true, fxAmountMinor: true, fxCompareAtMinor: true, fxMemberMinor: true, markupBps: true, markupFixedMinor: true, variants: { select: { id: true, priceMinor: true, compareAtMinor: true, memberPriceMinor: true, fxAmountMinor: true } } },
  })
  let count = 0
  const byCurrency: Record<string, number> = {}
  for (const product of products) {
    let prices: ReturnType<typeof fxProductPrices>
    try { prices = fxProductPrices(product, rates, config.roundToman) } catch { continue }
    if (prices.priceMinor <= 0n) continue
    const variantUpdates = product.variants.flatMap((variant) => {
      const priceMinor = prices.variant(variant.fxAmountMinor)
      if (priceMinor === variant.priceMinor) return []
      return [{ id: variant.id, data: { priceMinor, price: legacyNumber(priceMinor, product.currency), compareAtMinor: scaleAlong(variant.compareAtMinor, variant.priceMinor, priceMinor), memberPriceMinor: scaleAlong(variant.memberPriceMinor, variant.priceMinor, priceMinor) } }]
    })
    const changed = prices.priceMinor !== product.priceMinor || prices.compareAtMinor !== product.compareAtMinor || prices.memberPriceMinor !== product.memberPriceMinor
    if (!changed && !variantUpdates.length) continue
    await db.$transaction([
      db.product.update({ where: { id: product.id }, data: { priceMinor: prices.priceMinor, price: legacyNumber(prices.priceMinor, product.currency), compareAtMinor: prices.compareAtMinor, memberPriceMinor: prices.memberPriceMinor, repricedAt: new Date() } }),
      ...variantUpdates.map((row) => db.productVariant.update({ where: { id: row.id }, data: row.data })),
    ])
    count++
    byCurrency[product.fxCurrency] = (byCurrency[product.fxCurrency] || 0) + 1
  }
  return { count, byCurrency }
}

/** Live price preview for the product editor. */
export async function previewFx(input: Record<string, unknown>) {
  const sellCurrency = normalizeCurrency(input.currency || 'IRT')
  const fxCurrency = normalizeCurrency(input.fxCurrency || 'USD')
  const [rates, config] = await Promise.all([loadRates(), getFxConfig()])
  const baseMinor = decimalInput(input.fxAmount, fxCurrency, 'قیمت ارزی')
  const parts = fxBreakdown({ baseMinor, baseCurrency: fxCurrency, sellCurrency, markupBps: percentToBps(input.markupPercent), fixedMinor: decimalInput(input.markupFixed, sellCurrency, 'سود ثابت'), roundTo: roundFor(sellCurrency, config.roundToman) }, rates)
  const row = await db.currencyRate.findUnique({ where: { code: fxCurrency } })
  const text = (minor: bigint) => minorToDecimal(minor, sellCurrency)
  return { rate: parts.rate, rateAt: row?.fetchedAt?.toISOString() || row?.updatedAt.toISOString() || null, conversion: text(parts.conversion), markup: text(parts.markup), fixed: text(parts.fixed), rounding: text(parts.rounding), total: text(parts.total), currency: sellCurrency }
}

/** FX fields of a product for the editor form. */
export function fxFormFields(row: { pricingMode?: string; fxCurrency?: string; fxAmountMinor?: bigint; fxCompareAtMinor?: bigint; fxMemberMinor?: bigint; markupBps?: number; markupFixedMinor?: bigint; currency: string; repricedAt?: Date | null }) {
  const code = row.fxCurrency || 'USD'
  const dec = (minor: bigint | undefined, currency: string) => (minor && minor > 0n ? minorToDecimal(minor, currency) : '')
  return {
    pricingMode: row.pricingMode || 'FIXED', fxCurrency: code, fxAmount: dec(row.fxAmountMinor, code), fxCompareAt: dec(row.fxCompareAtMinor, code), fxMemberPrice: dec(row.fxMemberMinor, code),
    markupPercent: row.markupBps ? bpsToPercent(row.markupBps) : '', markupFixed: dec(row.markupFixedMinor, row.currency), repricedAt: row.repricedAt ? row.repricedAt.toISOString() : null,
  }
}

// ------------------------------------------------------------------ admin page

export async function fxOverview() {
  const config = await getFxConfig()
  const since = new Date(Date.now() - 86_400_000)
  const [rows, logs, counts, lastRun, products] = await Promise.all([
    db.currencyRate.findMany(),
    db.currencyRateLog.findMany({ orderBy: { createdAt: 'desc' }, take: 400 }),
    db.product.groupBy({ by: ['fxCurrency'], where: { pricingMode: 'FX' }, _count: { _all: true } }).catch(() => []),
    db.setting.findUnique({ where: { key: LAST_RUN_KEY } }).catch(() => null),
    db.product.findMany({ where: { pricingMode: 'FX' }, orderBy: { repricedAt: 'desc' }, take: 30, select: { id: true, name: true, slug: true, image: true, currency: true, priceMinor: true, fxCurrency: true, fxAmountMinor: true, markupBps: true, markupFixedMinor: true, repricedAt: true, active: true } }),
  ])
  const staleMs = Math.max(config.intervalMinutes * 3, 180) * 60_000
  const history = (code: string) => logs.filter((row) => row.code === code).slice(0, 30).reverse().map((row) => ({ rate: row.rate, at: row.createdAt.toISOString() }))
  const currencies = [...new Set([...config.currencies, ...rows.map((row) => row.code)])].filter((code) => FX_CODES.includes(code))
  return {
    config: publicFxConfig(config),
    catalog: FX_CURRENCIES,
    lastRun: lastRun?.value || null,
    rates: currencies.map((code) => {
      const row = rows.find((item) => item.code === code)
      const dayAgo = logs.find((log) => log.code === code && log.createdAt <= since)?.rate
      const at = row?.fetchedAt || row?.updatedAt || null
      return {
        code, name: fxName(code), rate: row?.rate ?? null, source: row?.source || '', locked: !!row?.locked, pendingRate: row?.pendingRate ?? null, pendingAt: row?.pendingAt?.toISOString() || null,
        updatedAt: at?.toISOString() || null, stale: !at || (!row?.locked && Date.now() - at.getTime() > staleMs && config.provider !== 'manual'),
        change24h: row && dayAgo ? Math.round(((row.rate - dayAgo) / dayAgo) * 1000) / 10 : null,
        products: counts.find((item) => item.fxCurrency === code)?._count._all || 0,
        history: history(code),
      }
    }),
    log: logs.slice(0, 40).map((row) => ({ id: row.id, code: row.code, name: fxName(row.code), rate: row.rate, source: row.source, products: row.products, at: row.createdAt.toISOString() })),
    products: products.map((row) => ({
      id: row.id, name: row.name, slug: row.slug, image: row.image, active: row.active, price: minorToDecimal(row.priceMinor, row.currency), currency: row.currency,
      fxCurrency: row.fxCurrency, fxAmount: minorToDecimal(row.fxAmountMinor, row.fxCurrency || 'USD'), markupPercent: bpsToPercent(row.markupBps), markupFixed: minorToDecimal(row.markupFixedMinor, row.currency),
      repricedAt: row.repricedAt?.toISOString() || null,
    })),
    fxProducts: counts.reduce((sum, row) => sum + row._count._all, 0),
  }
}

/** Test a configuration without saving it: what the source returns right now. */
export async function testFxSource(input: Record<string, unknown>) {
  const previous = await getFxConfig()
  const apiKey = typeof input.apiKey === 'string' && !input.apiKey.startsWith('••••') ? input.apiKey.trim() : undefined
  const config = normalizeFxConfig({ ...input, apiKey: apiKey === undefined ? previous.apiKey : apiKey ? encryptPanelCredential(apiKey) : '' }, previous)
  const result = await fetchRates(config)
  return { rates: result.rates, crossed: result.crossed }
}

/**
 * Products still priced in a foreign currency (legacy USD-priced products) become Toman products whose price comes from
 * that same foreign amount and the live rate: the dollar price is kept as the FX cost, variants and list/VIP prices too.
 */
export async function convertForeignProducts(options: { dryRun?: boolean; sell?: 'IRT' | 'IRR' } = {}) {
  const sell = options.sell === 'IRR' ? 'IRR' : 'IRT'
  const rates = await loadRates()
  const rows = await db.product.findMany({
    where: { pricingMode: { not: 'FX' }, currency: { notIn: ['IRT', 'IRR', 'TMN'] } },
    select: { id: true, name: true, currency: true, priceMinor: true, compareAtMinor: true, memberPriceMinor: true, variants: { select: { id: true, priceMinor: true } } },
  })
  const convertible = rows.filter((row) => FX_CODES.includes(normalizeCurrency(row.currency)) && rates[normalizeCurrency(row.currency)] > 0)
  const missing = [...new Set(rows.filter((row) => !convertible.includes(row)).map((row) => row.currency))]
  if (options.dryRun) return { products: convertible.map((row) => ({ id: row.id, name: row.name, currency: row.currency, price: minorToDecimal(row.priceMinor, row.currency) })), missingRates: missing, converted: 0 }
  for (const row of convertible) {
    const code = normalizeCurrency(row.currency)
    await db.$transaction([
      db.product.update({ where: { id: row.id }, data: {
        pricingMode: 'FX', fxCurrency: code, fxAmountMinor: row.priceMinor,
        fxCompareAtMinor: row.compareAtMinor > row.priceMinor ? row.compareAtMinor : 0n,
        fxMemberMinor: row.memberPriceMinor > 0n && row.memberPriceMinor < row.priceMinor ? row.memberPriceMinor : 0n,
        markupBps: 0, markupFixedMinor: 0n, currency: sell,
      } }),
      // A variant with the product's own price follows the product (0); others keep their own foreign cost.
      ...row.variants.map((variant) => db.productVariant.update({ where: { id: variant.id }, data: { fxAmountMinor: variant.priceMinor === row.priceMinor ? 0n : variant.priceMinor, compareAtMinor: 0n, memberPriceMinor: 0n } })),
    ])
  }
  // Every converted price is recomputed, even when the rounded Toman amount happens to equal the old minor amount.
  if (convertible.length) await forceReprice(convertible.map((row) => row.id))
  return { products: [], missingRates: missing, converted: convertible.length }
}

async function forceReprice(ids: number[]) {
  const [rates, config] = await Promise.all([loadRates(), getFxConfig()])
  const products = await db.product.findMany({ where: { id: { in: ids }, pricingMode: 'FX' }, select: { id: true, currency: true, pricingMode: true, fxCurrency: true, fxAmountMinor: true, fxCompareAtMinor: true, fxMemberMinor: true, markupBps: true, markupFixedMinor: true, variants: { select: { id: true, fxAmountMinor: true } } } })
  for (const product of products) {
    const prices = fxProductPrices(product, rates, config.roundToman)
    await db.$transaction([
      db.product.update({ where: { id: product.id }, data: { priceMinor: prices.priceMinor, price: legacyNumber(prices.priceMinor, product.currency), compareAtMinor: prices.compareAtMinor, memberPriceMinor: prices.memberPriceMinor, repricedAt: new Date() } }),
      ...product.variants.map((variant) => { const priceMinor = prices.variant(variant.fxAmountMinor); return db.productVariant.update({ where: { id: variant.id }, data: { priceMinor, price: legacyNumber(priceMinor, product.currency) } }) }),
    ])
  }
}
