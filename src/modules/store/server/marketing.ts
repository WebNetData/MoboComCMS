import { createHmac, randomInt } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { logEvent } from '@/platform/observability/logger'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { cartView } from '@/modules/store/server/cart'
import { legacyNumber, minorToNumber, toMinor } from '@/shared/money'
import {
  MarketingError, dueStep, giftCardState, giftCode, giftCodeLooksValid, normalizeGift, normalizeGiftCode, normalizeLoyalty, normalizeRecovery, pointsFor, stockAlertAvailable,
  redeemValue, reversalPoints, tierFor, tomanOf, validGiftAmount, type LoyaltySettings, type RecoverySettings,
} from '@/modules/store/domain/marketing'

// Store marketing: "let me know when it's back", abandoned cart reminders,
// gift cards and the customer club. The background jobs (runStockAlerts,
// runCartRecovery, runLoyaltyAwards) run every minute from the job scheduler.

const LOYALTY_KEY = 'store.loyalty.v1'
const RECOVERY_KEY = 'store.cartRecovery.v1'
const GIFT_KEY = 'store.giftCards.v1'
const GIFT_CURRENCY = 'IRT'

export const getLoyaltySettings = async () => normalizeLoyalty(await readJsonSetting(LOYALTY_KEY))
export const getRecoverySettings = async () => normalizeRecovery(await readJsonSetting(RECOVERY_KEY))
export const getGiftSettings = async () => normalizeGift(await readJsonSetting(GIFT_KEY))

export async function saveLoyaltySettings(input: unknown) {
  const previous = await getLoyaltySettings()
  const next = normalizeLoyalty(input)
  // Earning starts when the club is first switched on: older orders never earn.
  next.since = previous.since || (next.enabled ? new Date().toISOString() : '')
  await writeJsonSetting(LOYALTY_KEY, next)
  return next
}
export async function saveRecoverySettings(input: unknown) { const next = normalizeRecovery(input); await writeJsonSetting(RECOVERY_KEY, next); return next }
export async function saveGiftSettings(input: unknown) { const next = normalizeGift(input); await writeJsonSetting(GIFT_KEY, next); return next }

const positive = (value: unknown) => { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : 0 }
const notify = (event: Parameters<typeof createInboxEvent>[0]) => createInboxEvent(event).catch((error) => logEvent('warn', 'store.marketing_notify_failed', { kind: event.kind, error: String(error) }))

// ------------------------------------------------------------------ back in stock

async function productAvailability(productId: number, variantId: number) {
  const product = await db.product.findUnique({ where: { id: productId }, include: {
    variants: { where: { active: true }, select: { id: true, name: true, stock: true } },
    _count: { select: { variants: true } },
  } })
  if (!product) return null
  const variant = variantId ? product.variants.find((row) => row.id === variantId) || null : null
  const available = stockAlertAvailable({ ...product, variantCount: product._count.variants }, variantId)
  return { product, variant, available }
}

export async function stockAlertStatus(userId: number, productIdInput: unknown, variantIdInput: unknown) {
  const row = await db.stockAlert.findUnique({ where: { userId_productId_variantId: { userId, productId: positive(productIdInput), variantId: positive(variantIdInput) } } })
  return { subscribed: !!row && !row.notifiedAt }
}

export async function subscribeStockAlert(userId: number, productIdInput: unknown, variantIdInput: unknown) {
  const productId = positive(productIdInput), variantId = positive(variantIdInput)
  const state = productId ? await productAvailability(productId, variantId) : null
  if (!state || !state.product.active || state.product.approval !== 'APPROVED') throw new MarketingError('کالا پیدا نشد', 404)
  if (variantId && !state.variant) throw new MarketingError('نوع انتخاب‌شده پیدا نشد', 404)
  if (state.available && (!variantId || state.variant!.stock !== 0)) throw new MarketingError('این کالا هم‌اکنون موجود است', 409, 'IN_STOCK')
  if (await db.stockAlert.count({ where: { userId, notifiedAt: null } }) >= 100) throw new MarketingError('بیش از ۱۰۰ درخواست فعال دارید', 429)
  await db.stockAlert.upsert({ where: { userId_productId_variantId: { userId, productId, variantId } }, create: { userId, productId, variantId }, update: { notifiedAt: null, createdAt: new Date() } })
  return { subscribed: true }
}

export async function unsubscribeStockAlert(userId: number, productIdInput: unknown, variantIdInput: unknown) {
  await db.stockAlert.deleteMany({ where: { userId, productId: positive(productIdInput), variantId: positive(variantIdInput), notifiedAt: null } })
  return { subscribed: false }
}

/** Tells everyone waiting for a product (or variant) that is back in stock. */
export async function runStockAlerts(limit = 300) {
  const pending = await db.stockAlert.findMany({ where: { notifiedAt: null }, orderBy: { id: 'asc' }, take: 2000, select: { productId: true, variantId: true } })
  const keys = [...new Map(pending.map((row) => [`${row.productId}:${row.variantId}`, row])).values()]
  let sent = 0
  for (const key of keys) {
    if (sent >= limit) break
    const state = await productAvailability(key.productId, key.variantId)
    if (!state?.available) continue
    const waiting = await db.stockAlert.findMany({ where: { productId: key.productId, variantId: key.variantId, notifiedAt: null }, orderBy: { id: 'asc' }, take: limit - sent })
    for (const alert of waiting) {
      const name = `${state.product.name}${state.variant ? ` (${state.variant.name})` : ''}`
      try {
        await createInboxEvent({
          userId: alert.userId, kind: 'STOCK_BACK', dedupeKey: `stock-back:${alert.id}:${alert.createdAt.getTime()}`,
          titleFa: `«${name}» موجود شد`, titleEn: `${name} is back in stock`,
          bodyFa: 'کالایی که منتظرش بودید دوباره موجود شد؛ موجودی ممکن است محدود باشد.', bodyEn: 'The item you were waiting for is back in stock.',
          href: `/products/${encodeURIComponent(state.product.slug)}`,
        })
        const marked = await db.stockAlert.updateMany({ where: { id: alert.id, createdAt: alert.createdAt, notifiedAt: null }, data: { notifiedAt: new Date() } })
        sent += marked.count
      } catch (error) {
        logEvent('warn', 'store.stock_alert_delivery_failed', { alertId: alert.id, error: String(error) })
      }
    }
  }
  return { sent }
}

export async function adminStockAlerts() {
  const [groups, notified30, pendingTotal] = await Promise.all([
    db.stockAlert.groupBy({ by: ['productId', 'variantId'], where: { notifiedAt: null }, _count: { _all: true }, _min: { createdAt: true }, orderBy: { _count: { productId: 'desc' } }, take: 100 }),
    db.stockAlert.count({ where: { notifiedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    db.stockAlert.count({ where: { notifiedAt: null } }),
  ])
  const products = await db.product.findMany({ where: { id: { in: groups.map((row) => row.productId) } }, select: { id: true, name: true, slug: true, image: true, stock: true, variants: { select: { id: true, name: true, stock: true } } } })
  return {
    pendingTotal, notified30,
    rows: groups.map((row) => {
      const product = products.find((item) => item.id === row.productId)
      const variant = row.variantId ? product?.variants.find((item) => item.id === row.variantId) : null
      return { productId: row.productId, variantId: row.variantId, name: product?.name || `#${row.productId}`, variantName: variant?.name || '', slug: product?.slug || '', image: product?.image || '', stock: variant ? variant.stock : product?.stock ?? 0, waiting: row._count._all, since: row._min.createdAt }
    }),
  }
}

// ------------------------------------------------------------------ abandoned carts

/**
 * Sends the due reminder of every abandoned (signed-in) cart. Each step selects
 * only the carts that are due for it, so carts waiting for a later step never
 * hold back the ones that are due, and one failing cart does not stop the rest.
 */
export async function runCartRecovery(now = new Date(), limit = 200) {
  const settings = await getRecoverySettings()
  if (!settings.enabled) return { sent: 0 }
  const oldest = new Date(now.getTime() - settings.maxAgeDays * 86_400_000)
  const handled = new Set<number>()
  let sent = 0
  for (const [step, current] of settings.steps.entries()) {
    const carts = await db.cart.findMany({
      where: { userId: { not: null }, reminderCount: step, updatedAt: { gte: oldest, lte: new Date(now.getTime() - current.afterHours * 3_600_000) }, lines: { some: {} } },
      orderBy: { updatedAt: 'asc' }, take: limit,
    })
    for (const cart of carts) {
      // At most one reminder per cart in a run, as before.
      if (handled.has(cart.id) || dueStep(settings, cart, now) !== step || !cart.userId) continue
      handled.add(cart.id)
      try {
        if (await remindCart({ ...cart, userId: cart.userId }, step, current, settings, now)) sent++
      } catch (error) {
        logEvent('warn', 'store.cart_reminder_failed', { cartId: cart.id, step, error: String(error) })
      }
    }
  }
  return { sent }
}

async function remindCart(cart: { id: number; userId: number; reminderCount: number; updatedAt: Date }, step: number, current: RecoverySettings['steps'][number], settings: RecoverySettings, now: Date) {
  const unchanged = { id: cart.id, reminderCount: step, updatedAt: cart.updatedAt }
  const stop = () => db.cart.updateMany({ where: unchanged, data: { reminderCount: settings.steps.length, updatedAt: cart.updatedAt } })
  // Bought since the cart last changed: nothing to remind about.
  if (await db.order.count({ where: { userId: cart.userId, createdAt: { gte: cart.updatedAt }, status: { notIn: ['FAILED', 'CANCELLED', 'EXPIRED'] } } })) { await stop(); return false }
  const view = await cartView({ userId: cart.userId, token: null })
  const valueMinor = toMinor(view.itemsTotal, view.currency)
  if (!view.lines.some((line) => !line.issue) || tomanOf(valueMinor, view.currency) < BigInt(settings.minValueToman)) { await stop(); return false }
  const items = view.lines.filter((line) => !line.issue)
  const names = items.slice(0, 2).map((line) => line.name).join('، ') + (items.length > 2 ? ` و ${(items.length - 2).toLocaleString('fa-IR')} کالای دیگر` : '')
  // The inbox event is deduplicated, so it is written first: a failed write leaves the step due for the next run.
  await createInboxEvent({
    userId: cart.userId, kind: 'CART_REMINDER', dedupeKey: `cart:${cart.id}:${step}:${cart.updatedAt.getTime()}`,
    titleFa: 'سبد خرید شما منتظر شماست', titleEn: 'Your cart is waiting',
    bodyFa: `${current.message} ${names}.${current.couponCode ? ` با کد تخفیف ${current.couponCode} خریدتان را کامل کنید.` : ''}`.slice(0, 300), bodyEn: 'Items are still in your cart.',
    href: '/cart',
  })
  // Claim the step (updatedAt kept, so the schedule is measured from the customer's last change).
  return db.$transaction(async (tx) => {
    const claimed = await tx.cart.updateMany({ where: unchanged, data: { reminderCount: step + 1, remindedAt: now, updatedAt: cart.updatedAt } })
    if (!claimed.count) return false
    await tx.cartReminder.create({ data: { cartId: cart.id, userId: cart.userId, step, valueMinor, currency: view.currency, couponCode: current.couponCode, sentAt: now } })
    return true
  })
}

/** Credits the latest reminder with the order placed from the cart. */
export async function markCartRecovered(userId: number, orderId: number) {
  const settings = await getRecoverySettings()
  const reminder = await db.cartReminder.findFirst({ where: { userId, recoveredOrderId: null, sentAt: { gte: new Date(Date.now() - settings.maxAgeDays * 86_400_000) } }, orderBy: { sentAt: 'desc' } })
  if (reminder) await db.cartReminder.update({ where: { id: reminder.id }, data: { recoveredOrderId: orderId, recoveredAt: new Date() } })
}

export async function adminCartRecovery() {
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [settings, reminders, recovered, open] = await Promise.all([
    getRecoverySettings(),
    db.cartReminder.count({ where: { sentAt: { gte: since } } }),
    db.cartReminder.findMany({ where: { sentAt: { gte: since }, recoveredOrderId: { not: null } }, select: { recoveredOrderId: true } }),
    db.cart.findMany({ where: { userId: { not: null }, lines: { some: {} }, updatedAt: { lte: new Date(Date.now() - 3_600_000), gte: since } }, orderBy: { updatedAt: 'desc' }, take: 60, include: { user: { select: { id: true, name: true, email: true, phone: true } }, lines: { include: { product: { select: { name: true, priceMinor: true, currency: true } } } } } }),
  ])
  const orders = await db.order.findMany({ where: { id: { in: recovered.map((row) => row.recoveredOrderId!) } }, select: { id: true, status: true, totalMinor: true, currency: true } })
  const paid = orders.filter((order) => order.status !== 'PENDING' && order.status !== 'FAILED' && order.status !== 'CANCELLED')
  const carts = open.map((cart) => ({
    id: cart.id, updatedAt: cart.updatedAt, reminders: cart.reminderCount, remindedAt: cart.remindedAt,
    user: cart.user ? { id: cart.user.id, name: cart.user.name, email: cart.user.email, phone: cart.user.phone } : null,
    items: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
    value: minorToNumber(cart.lines.reduce((sum, line) => sum + line.product.priceMinor * BigInt(line.quantity), 0n), cart.lines[0]?.product.currency || 'IRT'),
    currency: cart.lines[0]?.product.currency || 'IRT',
    names: cart.lines.slice(0, 3).map((line) => line.product.name),
  }))
  return {
    settings, reminders30: reminders, recovered30: recovered.length, recoveredPaid30: paid.length,
    recoveredValue30: paid.reduce((sum, order) => sum + Number(tomanOf(order.totalMinor, order.currency)), 0),
    carts,
  }
}

// ------------------------------------------------------------------ gift cards

const codeHash = (code: string) => createHmac('sha256', authSecret()).update(`gift-card:${code}`).digest('hex')
const newCode = () => giftCode((max) => randomInt(max))

async function createCard(data: { toman: number; source: 'ADMIN' | 'PURCHASE'; purchaserId?: number | null; recipientName?: string; recipientEmail?: string; message?: string; note?: string; expiresAt: Date | null; createdBy?: number | null }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode()
    const plain = code.replace(/-/g, '')
    try {
      const card = await db.giftCard.create({ data: {
        codeHash: codeHash(plain), last4: plain.slice(-4), codeEnc: encryptPanelCredential(code), currency: GIFT_CURRENCY, amountMinor: BigInt(data.toman), source: data.source,
        purchaserId: data.purchaserId ?? null, recipientName: data.recipientName || '', recipientEmail: data.recipientEmail || '', message: data.message || '', note: data.note || '', expiresAt: data.expiresAt, createdBy: data.createdBy ?? null,
      } })
      return { card, code }
    } catch (error) { if (attempt === 4) throw error }
  }
  throw new MarketingError('ساخت کد انجام نشد', 500)
}

const expiry = (days: number) => (days > 0 ? new Date(Date.now() + days * 86_400_000) : null)
const cleanText = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max)
const cleanEmail = (value: unknown) => { const email = String(value ?? '').trim().toLowerCase(); return /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/.test(email) ? email : '' }

/** Staff issue one or many cards; the codes are returned (and kept encrypted). */
export async function issueGiftCards(input: { count?: unknown; toman?: unknown; days?: unknown; note?: unknown; recipientName?: unknown; recipientEmail?: unknown; message?: unknown }, adminId: number) {
  const settings = await getGiftSettings()
  const toman = validGiftAmount({ ...settings, minToman: 1000, maxToman: 1_000_000_000 }, input.toman)
  const count = Math.max(1, Math.min(500, Math.round(Number(input.count) || 1)))
  const days = Number.isFinite(Number(input.days)) ? Math.max(0, Math.min(3650, Math.round(Number(input.days)))) : settings.validityDays
  const cards: { id: number; code: string }[] = []
  for (let i = 0; i < count; i++) {
    const { card, code } = await createCard({ toman, source: 'ADMIN', note: cleanText(input.note, 120), recipientName: cleanText(input.recipientName, 80), recipientEmail: cleanEmail(input.recipientEmail), message: cleanText(input.message, 300), expiresAt: expiry(days), createdBy: adminId })
    cards.push({ id: card.id, code })
  }
  if (count === 1 && cleanEmail(input.recipientEmail)) await emailGiftCard(cards[0].code, toman, cleanText(input.recipientName, 80), cleanEmail(input.recipientEmail), cleanText(input.message, 300), '').catch(() => undefined)
  return { cards, toman }
}

async function emailGiftCard(code: string, toman: number, name: string, email: string, message: string, from: string) {
  const [{ sendMail, getSmtp }, settings] = await Promise.all([import('@/modules/mail/server/mailer'), import('@/modules/settings/server').then((m) => m.getSettings())])
  if (!(await getSmtp()).enabled) return false
  const brand = settings.brandName || 'موبوکام'
  const site = (settings.siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
  const esc = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
  const amount = `${toman.toLocaleString('fa-IR')} تومان`
  const text = `${name ? `${name} عزیز،` : 'سلام،'}\n${from ? `${from} برای شما یک کارت هدیهٔ ${brand} فرستاده است.` : `یک کارت هدیهٔ ${brand} برای شما صادر شد.`}\nمبلغ: ${amount}\nکد: ${code}\n${message ? `پیام: ${message}\n` : ''}برای استفاده وارد حساب خود شوید و در «کارت هدیه» کد را وارد کنید: ${site}/dashboard/gift-cards`
  const html = `<div dir="rtl" style="font-family:Tahoma,sans-serif;max-width:520px;margin:auto;padding:24px"><div style="border-radius:18px;padding:28px;background:linear-gradient(135deg,#6d4aff,#a855f7);color:#fff"><div style="font-size:14px;opacity:.85">${esc(brand)} · کارت هدیه</div><div style="font-size:30px;font-weight:800;margin:14px 0">${esc(amount)}</div><div style="font-family:monospace;font-size:20px;letter-spacing:2px;background:rgba(255,255,255,.16);padding:10px 14px;border-radius:10px;display:inline-block" dir="ltr">${esc(code)}</div></div><p style="line-height:2">${esc(name ? `${name} عزیز،` : 'سلام،')} ${esc(from ? `${from} برای شما یک کارت هدیه فرستاده است.` : 'یک کارت هدیه برای شما صادر شد.')}</p>${message ? `<blockquote style="border-right:3px solid #a855f7;margin:0;padding:6px 12px;color:#444">${esc(message)}</blockquote>` : ''}<p><a href="${esc(site)}/dashboard/gift-cards" style="display:inline-block;background:#6d4aff;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">استفاده از کارت هدیه</a></p></div>`
  const result = await sendMail({ to: email, subject: `کارت هدیهٔ ${amount} از ${brand}`, text, html, source: 'gift-card' })
  return result.ok
}

/** A customer buys a card with wallet balance (retry-safe through the idempotency key). */
export async function purchaseGiftCard(userId: number, input: { toman?: unknown; recipientName?: unknown; recipientEmail?: unknown; message?: unknown; idempotencyKey?: unknown }) {
  const settings = await getGiftSettings()
  if (!settings.purchaseEnabled) throw new MarketingError('خرید کارت هدیه در حال حاضر فعال نیست', 403)
  const key = String(input.idempotencyKey ?? '')
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(key)) throw new MarketingError('درخواست نامعتبر است')
  const marker = `buy:${userId}:${key}`
  const existing = await db.giftCard.findFirst({ where: { note: marker } })
  if (existing) return { id: existing.id, code: decryptPanelCredential(existing.codeEnc), toman: Number(existing.amountMinor), replayed: true }
  const toman = validGiftAmount(settings, input.toman)
  const recipientEmail = cleanEmail(input.recipientEmail)
  if (String(input.recipientEmail ?? '').trim() && !recipientEmail) throw new MarketingError('ایمیل گیرنده معتبر نیست')
  const debit = await moveWallet({ userId, amount: -toman, currency: GIFT_CURRENCY, type: 'GIFT_CARD', description: `خرید کارت هدیه ${toman.toLocaleString('fa-IR')} تومانی`, idempotencyKey: `gift-card:buy:${userId}:${key}` })
  if (!debit.ok) throw new MarketingError(/insufficient|کافی/i.test(debit.message || '') ? 'موجودی کیف پول کافی نیست؛ ابتدا کیف پول را شارژ کنید' : debit.message || 'برداشت از کیف پول انجام نشد', 402, 'INSUFFICIENT_FUNDS')
  const buyer = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  const { card, code } = await createCard({ toman, source: 'PURCHASE', purchaserId: userId, recipientName: cleanText(input.recipientName, 80), recipientEmail, message: cleanText(input.message, 300), note: marker, expiresAt: expiry(settings.validityDays) })
  const emailed = recipientEmail ? await emailGiftCard(code, toman, cleanText(input.recipientName, 80), recipientEmail, cleanText(input.message, 300), buyer?.name || '').catch(() => false) : false
  await notify({ userId, kind: 'GIFT_CARD', dedupeKey: `gift-card:bought:${card.id}`, titleFa: `کارت هدیهٔ ${toman.toLocaleString('fa-IR')} تومانی خریداری شد`, titleEn: 'Gift card purchased', bodyFa: emailed ? `کد برای ${recipientEmail} ایمیل شد و در «کارت‌های هدیهٔ من» هم هست.` : 'کد کارت در «کارت‌های هدیهٔ من» در دسترس است.', bodyEn: '', href: '/dashboard/gift-cards' })
  return { id: card.id, code, toman, emailed }
}

/** Redeems a card into the customer's wallet (whole amount, once). */
export async function redeemGiftCard(userId: number, codeInput: unknown) {
  const code = normalizeGiftCode(codeInput)
  if (!giftCodeLooksValid(code)) throw new MarketingError('کد کارت هدیه معتبر نیست؛ ۱۶ نویسه است، مثل K7QM-2XRD-9PLA-W4ZN', 400, 'INVALID_CODE')
  const card = await db.giftCard.findUnique({ where: { codeHash: codeHash(code) } })
  if (!card) throw new MarketingError('کارت هدیه‌ای با این کد پیدا نشد', 404, 'NOT_FOUND')
  const state = giftCardState(card)
  if (state === 'REDEEMED') throw new MarketingError(card.redeemedBy === userId ? 'این کارت را قبلاً استفاده کرده‌اید' : 'این کارت هدیه قبلاً استفاده شده است', 409, 'USED')
  if (state === 'DISABLED') throw new MarketingError('این کارت هدیه غیرفعال شده است', 409, 'DISABLED')
  if (state === 'EXPIRED') throw new MarketingError('مهلت استفاده از این کارت هدیه تمام شده است', 409, 'EXPIRED')
  const claimed = await db.giftCard.updateMany({ where: { id: card.id, status: 'ACTIVE' }, data: { status: 'REDEEMED', redeemedBy: userId, redeemedAt: new Date() } })
  if (!claimed.count) throw new MarketingError('این کارت هدیه قبلاً استفاده شده است', 409, 'USED')
  const credit = await moveWallet({ userId, amount: legacyNumber(card.amountMinor, card.currency), currency: card.currency, type: 'GIFT_CARD', description: `کارت هدیه ••••${card.last4}`, idempotencyKey: `gift-card:redeem:${card.id}` })
  if (!credit.ok) {
    await db.giftCard.update({ where: { id: card.id }, data: { status: 'ACTIVE', redeemedBy: null, redeemedAt: null } })
    throw new MarketingError('شارژ کیف پول انجام نشد؛ دوباره تلاش کنید', 500)
  }
  return { amount: minorToNumber(card.amountMinor, card.currency), currency: card.currency, balance: credit.balance }
}

export async function myGiftCards(userId: number) {
  const [bought, redeemed] = await Promise.all([
    db.giftCard.findMany({ where: { purchaserId: userId }, orderBy: { id: 'desc' }, take: 50 }),
    db.giftCard.findMany({ where: { redeemedBy: userId }, orderBy: { redeemedAt: 'desc' }, take: 50 }),
  ])
  const view = (card: (typeof bought)[number], withCode: boolean) => ({ id: card.id, amount: Number(card.amountMinor), last4: card.last4, code: withCode && card.codeEnc ? (() => { try { return decryptPanelCredential(card.codeEnc) } catch { return '' } })() : '', state: giftCardState(card), recipientName: card.recipientName, recipientEmail: card.recipientEmail, createdAt: card.createdAt, expiresAt: card.expiresAt, redeemedAt: card.redeemedAt })
  return { settings: await getGiftSettings(), bought: bought.map((card) => view(card, true)), redeemed: redeemed.map((card) => view(card, false)) }
}

export async function adminGiftCards(input: { status?: unknown; page?: unknown }) {
  const page = Math.max(1, Math.round(Number(input.page) || 1))
  const status = String(input.status || '')
  const now = new Date()
  const where = status === 'ACTIVE' ? { status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } : status === 'EXPIRED' ? { status: 'ACTIVE', expiresAt: { lte: now } } : ['REDEEMED', 'DISABLED'].includes(status) ? { status } : {}
  const [rows, total, outstanding, redeemed] = await Promise.all([
    db.giftCard.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * 30, take: 30 }),
    db.giftCard.count({ where }),
    db.giftCard.aggregate({ where: { status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, _sum: { amountMinor: true }, _count: { _all: true } }),
    db.giftCard.aggregate({ where: { status: 'REDEEMED' }, _sum: { amountMinor: true }, _count: { _all: true } }),
  ])
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((row) => [row.purchaserId, row.redeemedBy]).filter((id): id is number => !!id))] } }, select: { id: true, name: true, email: true } })
  const who = (id: number | null) => (id ? users.find((user) => user.id === id) || { id, name: '', email: '' } : null)
  return {
    settings: await getGiftSettings(), page, pages: Math.max(1, Math.ceil(total / 30)), total,
    outstanding: { count: outstanding._count._all, amount: Number(outstanding._sum.amountMinor || 0n) },
    redeemed: { count: redeemed._count._all, amount: Number(redeemed._sum.amountMinor || 0n) },
    rows: rows.map((row) => ({ id: row.id, last4: row.last4, amount: Number(row.amountMinor), state: giftCardState(row, now), source: row.source, note: row.note.startsWith('buy:') ? '' : row.note, recipientName: row.recipientName, recipientEmail: row.recipientEmail, purchaser: who(row.purchaserId), redeemer: who(row.redeemedBy), createdAt: row.createdAt, expiresAt: row.expiresAt, redeemedAt: row.redeemedAt })),
  }
}

export async function setGiftCardStatus(id: unknown, disabled: boolean) {
  const card = await db.giftCard.findUnique({ where: { id: positive(id) } })
  if (!card) throw new MarketingError('کارت پیدا نشد', 404)
  if (card.status === 'REDEEMED') throw new MarketingError('کارت استفاده‌شده قابل تغییر نیست', 409)
  await db.giftCard.update({ where: { id: card.id }, data: { status: disabled ? 'DISABLED' : 'ACTIVE' } })
}

export async function revealGiftCard(id: unknown) {
  const card = await db.giftCard.findUnique({ where: { id: positive(id) } })
  if (!card?.codeEnc) throw new MarketingError('کد این کارت در دسترس نیست', 404)
  return { code: decryptPanelCredential(card.codeEnc) }
}

// ------------------------------------------------------------------ customer club

/** Adds a ledger entry once per key and keeps the account totals in step. */
async function addPoints(userId: number, points: number, kind: string, key: string, note: string, orderId: number | null = null) {
  if (!points) return null
  try {
    return await db.$transaction(async (tx) => {
      const entry = await tx.loyaltyEntry.create({ data: { userId, points, kind, note: note.slice(0, 200), orderId, idempotencyKey: key } })
      const earned = points > 0 && (kind === 'EARN_ORDER' || kind === 'BONUS')
      await tx.loyaltyAccount.upsert({ where: { userId }, create: { userId, balance: points, lifetime: earned ? points : 0 }, update: { balance: { increment: points }, ...(earned ? { lifetime: { increment: points } } : kind === 'REVERSE_ORDER' ? { lifetime: { increment: points } } : {}) } })
      return entry
    })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return null // already recorded
    throw error
  }
}

async function tierOf(settings: LoyaltySettings, userId: number) {
  const account = await db.loyaltyAccount.findUnique({ where: { userId } })
  return { account, ...tierFor(settings, account?.lifetime || 0) }
}

async function signupBonus(settings: LoyaltySettings, userId: number) {
  if (!settings.enabled || !settings.signupBonus || !settings.since) return
  const user = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true } })
  if (user && user.createdAt >= new Date(settings.since)) await addPoints(userId, settings.signupBonus, 'BONUS', `signup:${userId}`, 'هدیهٔ عضویت در باشگاه')
}

/**
 * Points for every paid order since the club started (idempotent per order).
 * The recent orders are read in id pages, so orders that already have their
 * points never hide the ones that do not; one failing order does not stop the rest.
 */
export async function runLoyaltyAwards(now = new Date(), limit = 500) {
  const settings = await getLoyaltySettings()
  if (!settings.enabled || !settings.since) return { awarded: 0 }
  const where = { status: { in: ['PAID', 'COMPLETED'] }, createdAt: { gte: new Date(settings.since) }, updatedAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } }
  let awarded = 0
  for (let after = 0, handled = 0; handled < limit;) {
    const orders = await db.order.findMany({ where: { ...where, id: { gt: after } }, select: { id: true, userId: true, totalMinor: true, currency: true, meta: true }, orderBy: { id: 'asc' }, take: 500 })
    if (!orders.length) break
    after = orders[orders.length - 1].id
    const done = new Set((await db.loyaltyEntry.findMany({ where: { orderId: { in: orders.map((order) => order.id) }, kind: 'EARN_ORDER' }, select: { orderId: true } })).map((row) => row.orderId))
    for (const order of orders) {
      if (done.has(order.id)) continue
      if (handled++ >= limit) break
      try {
        if (await awardOrder(settings, order)) awarded++
      } catch (error) {
        logEvent('warn', 'store.loyalty_award_failed', { orderId: order.id, error: String(error) })
      }
    }
  }
  return { awarded }
}

async function awardOrder(settings: LoyaltySettings, order: { id: number; userId: number; totalMinor: bigint; currency: string; meta: string | null }) {
  let shipping = 0n
  try { shipping = BigInt(JSON.parse(order.meta || '{}').shippingMinor || 0) } catch { shipping = 0n }
  const before = await tierOf(settings, order.userId)
  const points = pointsFor(settings, tomanOf(order.totalMinor - shipping, order.currency), before.tier.multiplier)
  // Zero-point orders still get a row, so they are not looked at again.
  const entry = points > 0
    ? await addPoints(order.userId, points, 'EARN_ORDER', `order:${order.id}`, `خرید سفارش #${order.id}`, order.id)
    : await db.loyaltyEntry.create({ data: { userId: order.userId, points: 0, kind: 'EARN_ORDER', note: `سفارش #${order.id}`, orderId: order.id, idempotencyKey: `order:${order.id}` } }).catch(() => null)
  if (!entry || points <= 0) return false
  await signupBonus(settings, order.userId)
  const after = await tierOf(settings, order.userId)
  const upgraded = after.tier.id !== before.tier.id
  await notify({
    userId: order.userId, kind: 'LOYALTY', dedupeKey: `loyalty:order:${order.id}`,
    titleFa: upgraded ? `تبریک! به سطح ${after.tier.name} باشگاه مشتریان رسیدید` : `${points.toLocaleString('fa-IR')} امتیاز باشگاه مشتریان گرفتید`,
    titleEn: upgraded ? `You reached ${after.tier.name}` : `You earned ${points} points`,
    bodyFa: `بابت سفارش #${order.id}. موجودی امتیاز: ${(after.account?.balance || 0).toLocaleString('fa-IR')}`, bodyEn: '', href: '/dashboard/club',
  })
  return true
}

/** Takes back the points of a refunded part of an order (cancellation or return). */
export async function reverseOrderPoints(orderId: number, refundedMinor: bigint, key: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { userId: true, totalMinor: true } })
  if (!order) return
  const entries = await db.loyaltyEntry.findMany({ where: { orderId }, select: { points: true, kind: true } })
  const earned = entries.filter((row) => row.kind === 'EARN_ORDER').reduce((sum, row) => sum + row.points, 0)
  const reversed = -entries.filter((row) => row.kind === 'REVERSE_ORDER').reduce((sum, row) => sum + row.points, 0)
  const points = Math.min(earned - reversed, reversalPoints(earned, refundedMinor, order.totalMinor))
  if (points > 0) await addPoints(order.userId, -points, 'REVERSE_ORDER', `order:${orderId}:reverse:${key}`, `برگشت امتیاز سفارش #${orderId}`, orderId)
}

export async function awardReviewBonus(userId: number, reviewId: number) {
  const settings = await getLoyaltySettings()
  if (settings.enabled && settings.reviewBonus) await addPoints(userId, settings.reviewBonus, 'BONUS', `review:${reviewId}`, 'امتیاز ثبت نظر')
}

export async function loyaltyOverview(userId: number) {
  const settings = await getLoyaltySettings()
  if (settings.enabled) await signupBonus(settings, userId)
  const { account, tier, next, toNext } = await tierOf(settings, userId)
  const history = await db.loyaltyEntry.findMany({ where: { userId, points: { not: 0 } }, orderBy: { id: 'desc' }, take: 40 })
  const balance = account?.balance || 0
  return {
    enabled: settings.enabled, balance, lifetime: account?.lifetime || 0, tier, next, toNext, tiers: settings.tiers,
    rules: { earnPoints: settings.earnPoints, earnStepToman: settings.earnStepToman, pointValueToman: settings.pointValueToman, minRedeem: settings.minRedeem, signupBonus: settings.signupBonus, reviewBonus: settings.reviewBonus },
    balanceValue: Number(redeemValue(settings, balance)),
    history: history.map((row) => ({ id: row.id, points: row.points, kind: row.kind, note: row.note, createdAt: row.createdAt })),
  }
}

/** Turns points into wallet credit. */
export async function redeemPoints(userId: number, pointsInput: unknown) {
  const settings = await getLoyaltySettings()
  if (!settings.enabled || !settings.pointValueToman) throw new MarketingError('تبدیل امتیاز در حال حاضر فعال نیست', 403)
  const points = Math.floor(Number(pointsInput))
  if (!Number.isSafeInteger(points) || points < settings.minRedeem) throw new MarketingError(`حداقل ${settings.minRedeem.toLocaleString('fa-IR')} امتیاز قابل تبدیل است`)
  const entry = await db.$transaction(async (tx) => {
    const taken = await tx.loyaltyAccount.updateMany({ where: { userId, balance: { gte: points } }, data: { balance: { decrement: points } } })
    if (!taken.count) throw new MarketingError('امتیاز کافی ندارید', 409)
    return tx.loyaltyEntry.create({ data: { userId, points: -points, kind: 'REDEEM', note: 'تبدیل به اعتبار کیف پول', idempotencyKey: `redeem:${userId}:${Date.now()}:${randomInt(1_000_000)}` } })
  })
  const toman = Number(redeemValue(settings, points))
  const credit = await moveWallet({ userId, amount: toman, currency: 'IRT', type: 'LOYALTY', description: `تبدیل ${points.toLocaleString('fa-IR')} امتیاز باشگاه`, idempotencyKey: `loyalty:redeem:${entry.id}` })
  if (!credit.ok) {
    await addPoints(userId, points, 'ADMIN', `redeem-undo:${entry.id}`, 'برگشت تبدیل ناموفق')
    throw new MarketingError('شارژ کیف پول انجام نشد؛ امتیاز برگشت داده شد', 500)
  }
  return { points, toman, balance: credit.balance }
}

export async function adjustPoints(userIdInput: unknown, pointsInput: unknown, noteInput: unknown, adminId: number) {
  const userId = positive(userIdInput)
  const points = Math.round(Number(pointsInput))
  if (!userId || !Number.isSafeInteger(points) || !points || Math.abs(points) > 10_000_000) throw new MarketingError('کاربر یا مقدار امتیاز معتبر نیست')
  if (!await db.user.count({ where: { id: userId } })) throw new MarketingError('کاربر پیدا نشد', 404)
  await addPoints(userId, points, 'ADMIN', `admin:${adminId}:${Date.now()}:${randomInt(1_000_000)}`, cleanText(noteInput, 160) || 'تنظیم دستی مدیر')
  return (await db.loyaltyAccount.findUnique({ where: { userId } }))?.balance || 0
}

export async function adminLoyalty() {
  const settings = await getLoyaltySettings()
  const [members, totals, top, recent] = await Promise.all([
    db.loyaltyAccount.count(),
    db.loyaltyAccount.aggregate({ _sum: { balance: true, lifetime: true } }),
    db.loyaltyAccount.findMany({ orderBy: { lifetime: 'desc' }, take: 20 }),
    db.loyaltyEntry.findMany({ where: { points: { not: 0 } }, orderBy: { id: 'desc' }, take: 30 }),
  ])
  const users = await db.user.findMany({ where: { id: { in: [...new Set([...top.map((row) => row.userId), ...recent.map((row) => row.userId)])] } }, select: { id: true, name: true, email: true } })
  const name = (id: number) => { const user = users.find((row) => row.id === id); return user ? user.name || user.email : `#${id}` }
  const tierCounts = settings.tiers.map((tier, index) => ({ ...tier, count: 0, next: settings.tiers[index + 1]?.minLifetime ?? null }))
  for (const tier of tierCounts) tier.count = await db.loyaltyAccount.count({ where: { lifetime: { gte: tier.minLifetime, ...(tier.next !== null ? { lt: tier.next } : {}) } } })
  return {
    settings, members, outstanding: totals._sum.balance || 0, lifetime: totals._sum.lifetime || 0, outstandingValue: Number(redeemValue(settings, totals._sum.balance || 0)),
    tiers: tierCounts,
    top: top.map((row) => ({ userId: row.userId, name: name(row.userId), balance: row.balance, lifetime: row.lifetime, tier: tierFor(settings, row.lifetime).tier.name })),
    recent: recent.map((row) => ({ id: row.id, userId: row.userId, name: name(row.userId), points: row.points, kind: row.kind, note: row.note, createdAt: row.createdAt })),
  }
}

/** Every minute from the job scheduler. */
export async function runMarketingJobs() {
  const results = await Promise.allSettled([runStockAlerts(), runCartRecovery(), runLoyaltyAwards()])
  for (const result of results) if (result.status === 'rejected') logEvent('error', 'store.marketing_job_failed', { error: String(result.reason) })
  return results.map((result) => (result.status === 'fulfilled' ? result.value : null))
}
