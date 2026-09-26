import { offeredLocale } from '@/i18n/policy'
// Telegram linking, from the customer's side (requires a session):
//   GET    → link status + a fresh deep link to open in Telegram
//   DELETE → detach the Telegram account
//   POST   → complete a bot→website ticket, or send the linked confirmation
import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { attachTelegramToUser } from '@/modules/identity/telegram-account'
import {
  botDeepLink,
  linkToken,
  miniAppButton,
  notifyTelegram,
  telegramConfig,
  verifyTelegramWebLinkToken,
} from '@/modules/notifications/server/telegram'
import { botText, getBotLocale, getUserLocale } from '@/modules/notifications/server/telegram-locale'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth) return err('unauthorized', 401)

  const [user, cfg] = await Promise.all([
    db.user.findUnique({
      where: { id: auth.id },
      select: { telegramId: true, telegramUsername: true, telegramName: true, telegramLinkedAt: true },
    }),
    telegramConfig(),
  ])

  const linked = Boolean(user?.telegramId)
  return ok({
    enabled: cfg.ready,
    botUsername: cfg.username,
    linked,
    telegramId: linked ? user?.telegramId : '',
    username: user?.telegramUsername || '',
    displayName: user?.telegramName || '',
    linkedAt: user?.telegramLinkedAt || null,
    // the customer carries this ticket into the bot; it is single-purpose and
    // expires quickly so a leaked URL cannot be reused later
    deepLink: cfg.username ? botDeepLink(cfg.username, `link_${await linkToken(auth.id)}`) : '',
  })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth) return err('unauthorized', 401)
  await db.user.update({
    where: { id: auth.id },
    data: { telegramId: null, telegramUsername: '', telegramName: '', telegramPhoto: '', telegramLinkedAt: null },
  })
  return ok({ unlinked: true })
}

/** Complete a bot→website link, or re-send the success message for an existing link. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth) return err('unauthorized', 401)
  const locale = await getUserLocale(auth.id) || offeredLocale(req.cookies.get('lang')?.value)
  const L = (en: string, fa: string) => botText(locale, en, fa)

  const body = await req.json().catch(() => null)
  const token = String(body?.token || '').trim()

  if (token) {
    const ticket = await verifyTelegramWebLinkToken(token)
    if (!ticket) return err(L('The connection link is invalid or expired. Request a new one from the bot.', 'لینک اتصال نامعتبر یا منقضی شده است؛ از ربات یک لینک تازه بگیرید'), 410, { code: 'LINK_EXPIRED' })

    const linked = await attachTelegramToUser(auth.id, ticket.telegram)
    if (!linked.ok) return err(locale === 'fa' ? linked.message : 'Could not link this Telegram account. Please check its status and try again.', 409, { code: linked.code })

    const user = await db.user.findUnique({ where: { id: auth.id }, select: { telegramId: true } })
    if (user?.telegramId) {
      const locale = await getBotLocale(user.telegramId) || 'en'
      const button = await miniAppButton(botText(locale, '📱 My account', '📱 حساب من'))
      await notifyTelegram(user.telegramId, botText(locale, '✅ Telegram and website accounts are synced. Purchases, wallet and subscriptions now belong to this account.', '✅ حساب تلگرام و سایت با موفقیت همگام شد. خریدها، کیف پول و اشتراک‌ها از این به بعد روی همین حساب هستند.'), [button])
    }
    return ok({ linked: true, merged: linked.merged })
  }

  const user = await db.user.findUnique({ where: { id: auth.id }, select: { telegramId: true } })
  if (!user?.telegramId) return err(L('No Telegram account is linked yet', 'هنوز تلگرامی وصل نشده است'), 409, { code: 'NOT_LINKED' })

  const botLocale = await getBotLocale(user.telegramId) || 'en'
  const button = await miniAppButton(botText(botLocale, '📱 My account', '📱 حساب من'))
  await notifyTelegram(user.telegramId, botText(botLocale, '✅ Connected. You can now check your subscriptions here.', '✅ اتصال انجام شد. از این به بعد وضعیت اشتراک‌تان را همین‌جا می‌بینید.'), [button])
  return ok({ notified: true, deepLink: '' })
}
