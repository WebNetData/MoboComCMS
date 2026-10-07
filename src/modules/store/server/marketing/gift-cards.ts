import { createHmac, randomInt } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { legacyNumber, minorToNumber } from '@/shared/money'
import { MarketingError, giftCardState, giftCode, giftCodeLooksValid, normalizeGiftCode, validGiftAmount } from '@/modules/store/domain/marketing'
import { GIFT_CURRENCY, getGiftSettings, notify, positive } from '@/modules/store/server/marketing/core'

const codeHash = (code: string) => createHmac('sha256', authSecret()).update(`gift-card:${code}`).digest('hex')

const newCode = () => giftCode((max) => randomInt(max))

async function createCard(data: { toman: number; source: 'ADMIN' | 'PURCHASE'; purchaserId?: number | null; recipientName?: string; recipientEmail?: string; message?: string; note?: string; purchaseKey?: string; expiresAt: Date | null; createdBy?: number | null }): Promise<{ card: Awaited<ReturnType<typeof db.giftCard.create>>; code: string; existed?: boolean }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode()
    const plain = code.replace(/-/g, '')
    try {
      const card = await db.giftCard.create({ data: {
        codeHash: codeHash(plain), last4: plain.slice(-4), codeEnc: encryptPanelCredential(code), currency: GIFT_CURRENCY, amountMinor: BigInt(data.toman), source: data.source,
        purchaserId: data.purchaserId ?? null, recipientName: data.recipientName || '', recipientEmail: data.recipientEmail || '', message: data.message || '', note: data.note || '', purchaseKey: data.purchaseKey ?? null, expiresAt: data.expiresAt, createdBy: data.createdBy ?? null,
      } })
      return { card, code }
    } catch (error) {
      // Another request of the same purchase got there first: its card is the purchase's only card.
      const first = data.purchaseKey ? await db.giftCard.findUnique({ where: { purchaseKey: data.purchaseKey } }) : null
      if (first) return { card: first, code: decryptPanelCredential(first.codeEnc), existed: true }
      if (attempt === 4) throw error
    }
  }
  throw new MarketingError('ساخت کد انجام نشد', 500)
}

const expiry = (days: number) => (days > 0 ? new Date(Date.now() + days * 86_400_000) : null)

export const cleanText = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max)

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
  // Cards bought before the key existed are found by their note.
  const existing = await db.giftCard.findFirst({ where: { OR: [{ purchaseKey: marker }, { note: marker }] }, orderBy: { id: 'asc' } })
  if (existing) return { id: existing.id, code: decryptPanelCredential(existing.codeEnc), toman: Number(existing.amountMinor), replayed: true }
  const toman = validGiftAmount(settings, input.toman)
  const recipientEmail = cleanEmail(input.recipientEmail)
  if (String(input.recipientEmail ?? '').trim() && !recipientEmail) throw new MarketingError('ایمیل گیرنده معتبر نیست')
  const debit = await moveWallet({ userId, amount: -toman, currency: GIFT_CURRENCY, type: 'GIFT_CARD', description: `خرید کارت هدیه ${toman.toLocaleString('fa-IR')} تومانی`, idempotencyKey: `gift-card:buy:${userId}:${key}` })
  if (!debit.ok) throw new MarketingError(/insufficient|کافی/i.test(debit.message || '') ? 'موجودی کیف پول کافی نیست؛ ابتدا کیف پول را شارژ کنید' : debit.message || 'برداشت از کیف پول انجام نشد', 402, 'INSUFFICIENT_FUNDS')
  const buyer = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  const { card, code, existed } = await createCard({ toman, source: 'PURCHASE', purchaserId: userId, recipientName: cleanText(input.recipientName, 80), recipientEmail, message: cleanText(input.message, 300), note: marker, purchaseKey: marker, expiresAt: expiry(settings.validityDays) })
  // The request that created the card emails and notifies; a concurrent duplicate only reports it.
  if (existed) return { id: card.id, code, toman: Number(card.amountMinor), replayed: true }
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
  if (state === 'REDEEMED' && card.redeemedBy === userId) {
    // The card was claimed for this member; if that attempt stopped before the wallet credit, finish it now.
    // The credit's key is the card's, so it can only ever be paid once.
    const credit = await moveWallet({ userId, amount: legacyNumber(card.amountMinor, card.currency), currency: card.currency, type: 'GIFT_CARD', description: `کارت هدیه ••••${card.last4}`, idempotencyKey: `gift-card:redeem:${card.id}` })
    if (credit.ok && !credit.idempotent) return { amount: minorToNumber(card.amountMinor, card.currency), currency: card.currency, balance: credit.balance }
    throw new MarketingError('این کارت را قبلاً استفاده کرده‌اید', 409, 'USED')
  }
  if (state === 'REDEEMED') throw new MarketingError('این کارت هدیه قبلاً استفاده شده است', 409, 'USED')
  if (state === 'DISABLED') throw new MarketingError('این کارت هدیه غیرفعال شده است', 409, 'DISABLED')
  if (state === 'EXPIRED') throw new MarketingError('مهلت استفاده از این کارت هدیه تمام شده است', 409, 'EXPIRED')
  const claimed = await db.giftCard.updateMany({ where: { id: card.id, status: 'ACTIVE' }, data: { status: 'REDEEMED', redeemedBy: userId, redeemedAt: new Date() } })
  if (!claimed.count) throw new MarketingError('این کارت هدیه قبلاً استفاده شده است', 409, 'USED')
  const credit = await moveWallet({ userId, amount: legacyNumber(card.amountMinor, card.currency), currency: card.currency, type: 'GIFT_CARD', description: `کارت هدیه ••••${card.last4}`, idempotencyKey: `gift-card:redeem:${card.id}` })
  if (!credit.ok) {
    await db.giftCard.updateMany({ where: { id: card.id, status: 'REDEEMED', redeemedBy: userId }, data: { status: 'ACTIVE', redeemedBy: null, redeemedAt: null } })
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
  // Conditional: a card redeemed since the read must not be made active again.
  const changed = await db.giftCard.updateMany({ where: { id: card.id, status: { not: 'REDEEMED' } }, data: { status: disabled ? 'DISABLED' : 'ACTIVE' } })
  if (!changed.count) throw new MarketingError('کارت استفاده‌شده قابل تغییر نیست', 409)
}

export async function revealGiftCard(id: unknown) {
  const card = await db.giftCard.findUnique({ where: { id: positive(id) } })
  if (!card?.codeEnc) throw new MarketingError('کد این کارت در دسترس نیست', 404)
  return { code: decryptPanelCredential(card.codeEnc) }
}
