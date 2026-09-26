// The Telegram bot. One webhook serves the whole conversation:
//   • `/start link_<ticket>` — attaches the chat to a shop account
//   • `/me`, `/sub`, `/plans`, `/wallet`, `/help` — account at a glance
//   • inline buttons — open the mini app, or act on a subscription
//
// The shop and the bot share the same database, so whatever happens in the bot
// shows up in the dashboard (and the other way round).
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/platform/database/prisma'
import { subscriptionAction } from '@/modules/subscriptions/server/submanage'
import { siteBaseUrl } from '@/modules/subscriptions/server/subs'
import { safeHappLink } from '@/modules/subscriptions/server/happ-protocol'
import { bot, miniAppButton, telegramConfig, telegramWebLinkToken, verifyLinkToken, type InlineKeyboard, type TelegramUser } from '@/modules/notifications/server/telegram'
import { attachTelegramToUser, userForTelegram } from '@/modules/identity/telegram-account'
import { walletBalances } from '@/modules/wallet/server/wallet'
import { formatAmount } from '@/shared/money/format'
import { executeCheckout } from '@/modules/checkout/server/checkout'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'
import { botText, getBotLocale, languageKeyboard, languagePrompt, setBotLocale, type BotLocale } from '@/modules/notifications/server/telegram-locale'
import { planName } from '@/modules/catalog/domain/plan-locale'
import { transactionLabel } from '@/modules/wallet/domain/transaction-locale'


const esc = (v: string) =>
  String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function money(n: number, currency = 'USD', locale: BotLocale = 'en') {
  return formatAmount(n || 0, currency, locale === 'fa' ? 'fa-IR' : 'en-US')
}

async function walletText(userId: number, locale: BotLocale) {
  const balances = await walletBalances(userId)
  return balances.length ? balances.map((b) => money(b.balance, b.currency, locale)).join(' · ') : money(0, 'USD', locale)
}


function gb(n: number, locale: BotLocale) {
  return n ? `${n} GB` : botText(locale, 'Unlimited', 'نامحدود')
}

/** The shop account behind a Telegram id (empty string when not linked). */
async function userByTelegram(telegramId: string) {
  if (!telegramId) return null
  return db.user.findFirst({ where: { telegramId, status: 'ACTIVE' }, select: { id: true, name: true, email: true, status: true } })
}

async function subsOf(userId: number) {
  return db.subscription.findMany({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
}

async function accountSummary(userId: number, locale: BotLocale) {
  const [user, subs, wallet] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    subsOf(userId),
    walletText(userId, locale),
  ])
  if (!subs.length) {
    return `<b>${esc(user?.name || botText(locale, 'Your account', 'حساب شما'))}</b>\n${botText(locale, 'You do not have an active subscription yet.', 'هنوز اشتراک فعالی ندارید.')}\n${botText(locale, 'Wallet balance', 'موجودی کیف پول')}: <b>${wallet}</b>`
  }
  const lines = subs.map((s) => {
    const days = Math.max(0, Math.ceil((s.expiresAt.getTime() - Date.now()) / 86400_000))
    const state = s.status === 'ACTIVE' ? botText(locale, '✅ Active', '✅ فعال') : s.status === 'DISABLED' ? botText(locale, '⛔️ Disabled', '⛔️ غیرفعال') : `⚠️ ${s.status}`
    return `• <b>${esc(planName(s.plan, locale))}</b> — ${state}\n  ${botText(locale, 'Used', 'مصرف')} ${gb(s.trafficUsed, locale)} ${botText(locale, 'of', 'از')} ${gb(s.trafficLimit, locale)} · ${days} ${botText(locale, 'days left', 'روز باقی‌مانده')}\n  <code>${esc(s.username)}</code>`
  })
  return `<b>${esc(user?.name || botText(locale, 'Your account', 'حساب شما'))}</b>\n${botText(locale, 'Wallet balance', 'موجودی کیف پول')}: <b>${wallet}</b>\n\n${lines.join('\n\n')}`
}

/** The subscription link(s) plus per-subscription action buttons. */
async function subscriptionMessage(userId: number, locale: BotLocale) {
  const subs = await subsOf(userId)
  if (!subs.length) return { text: botText(locale, 'You do not have an active subscription. Choose a plan below 👇', 'اشتراک فعالی ندارید. از طرح‌های زیر انتخاب کنید 👇'), keyboard: [] as InlineKeyboard }

  const text = (await Promise.all(subs
    .map(async (s) => `<b>${esc(planName(s.plan, locale))}</b>\n<code>${esc(await safeHappLink(s.subToken)) || botText(locale, 'The link is not ready yet', 'لینک هنوز آماده نیست')}</code>`)))
    .join('\n\n')

  const keyboard: InlineKeyboard = [
    await miniAppButton(botText(locale, '📱 Manage in Mini App', '📱 مدیریت در مینی‌اپ')),
    ...subs.slice(0, 3).map((s) => [
      {
        text: s.status === 'ACTIVE' ? botText(locale, `⛔️ Disable ${planName(s.plan, locale)}`, `⛔️ غیرفعال‌کردن ${planName(s.plan, locale)}`) : botText(locale, `▶️ Enable ${planName(s.plan, locale)}`, `▶️ فعال‌کردن ${planName(s.plan, locale)}`),
        callback_data: `sub:${s.status === 'ACTIVE' ? 'disable' : 'enable'}:${s.id}`,
      },
      { text: botText(locale, '🔄 Sync', '🔄 همگام‌سازی'), callback_data: `sub:sync:${s.id}` },
    ]),
  ]
  return { text, keyboard }
}

async function plansMessage(locale: BotLocale) {
  const plans = await db.plan.findMany({ where: { active: true, panel: { is: { active: true } } }, orderBy: { sort: 'asc' }, take: 8, include: { panel: true } })
  if (!plans.length) return { text: botText(locale, 'There are no active plans available right now.', 'در حال حاضر طرح فعالی وجود ندارد.'), keyboard: [] as InlineKeyboard }
  const text = plans
    .map((p, index) => `${index + 1}. <b>${esc(planName(p, locale))}</b> — ${gb(p.trafficGB, locale)} / ${p.days} ${botText(locale, 'days', 'روز')}\n   ${money(p.price, p.currency, locale)}`)
    .join('\n\n')
  const keyboard: InlineKeyboard = plans.map((p) => [{ text: `🛒 ${planName(p, locale)} · ${money(p.price, p.currency, locale)}`, callback_data: `plan:view:${p.id}` }])
  return { text: `💠 <b>${botText(locale, 'Plans', 'طرح‌ها')}</b>\n\n${text}\n\n${botText(locale, 'Choose a plan to continue:', 'برای ادامه یک طرح انتخاب کنید:')}`, keyboard }
}

async function planPurchaseMessage(planId: number, userId: number, locale: BotLocale) {
  const plan = await db.plan.findFirst({ where: { id: planId, active: true, panel: { is: { active: true } } }, include: { panel: true } })
  if (!plan) return null
  const gateways = await checkoutGatewayOptions(plan.currency)
  const balance = await walletTextForCurrency(userId, plan.currency)
  const enough = balance >= plan.price
  const text = [
    `🛒 <b>${esc(planName(plan, locale))}</b>`,
    '',
    `${botText(locale, 'Traffic', 'حجم')}: <b>${gb(plan.trafficGB, locale)}</b>`,
    `${botText(locale, 'Validity', 'اعتبار')}: <b>${plan.days} ${botText(locale, 'days', 'روز')}</b>`,
    `${botText(locale, 'Devices', 'دستگاه‌ها')}: <b>${plan.deviceLimit || botText(locale, 'Unlimited', 'نامحدود')}</b>`,
    `${botText(locale, 'Price', 'قیمت')}: <b>${money(plan.price, plan.currency, locale)}</b>`,
    `${botText(locale, 'Wallet balance', 'موجودی کیف پول')}: <b>${money(balance, plan.currency, locale)}</b>`,
    '',
    enough ? botText(locale, 'You can pay the full amount from your wallet.', 'می‌توانید کل مبلغ را از کیف پول پرداخت کنید.') : botText(locale, 'Your wallet balance is applied first and the gateway charges only the remainder.', 'ابتدا موجودی کیف پول کسر می‌شود و درگاه فقط باقی‌مانده را دریافت می‌کند.'),
  ].join('\n')
  const keyboard: InlineKeyboard = []
  if (enough) keyboard.push([{ text: botText(locale, '💳 Pay from wallet', '💳 پرداخت از کیف پول'), callback_data: `buy:wallet:${plan.id}` }])
  for (const gateway of gateways) {
    const token = gateway.id ? `db.${gateway.id}` : `env.${gateway.provider}`
    keyboard.push([{ text: `${gateway.isDefault ? '⭐️' : '🏦'} ${gateway.label}`, callback_data: `buy:gateway:${plan.id}:${token}` }])
  }
  keyboard.push([{ text: botText(locale, '↩️ Back to plans', '↩️ بازگشت به طرح‌ها'), callback_data: 'plans:list:0' }])
  return { text, keyboard }
}

async function walletTextForCurrency(userId: number, currency: string) {
  const balances = await walletBalances(userId)
  return balances.find((item) => item.currency === currency)?.balance || 0
}

function checkoutIdempotencyKey(callbackQueryId: string, planId: number, payWith: 'wallet' | 'gateway') {
  const digest = crypto.createHash('sha256').update(`${callbackQueryId}:${planId}:${payWith}`).digest('hex').slice(0, 40)
  return `tg-${digest}`
}

function telegramGatewayRef(token: string | undefined) {
  const value = String(token || '').trim()
  if (/^db\.\d+$/.test(value)) return `db:${value.slice(3)}`
  if (/^env\.[A-Z0-9_]+$/.test(value)) return `env:${value.slice(4)}`
  return undefined
}

function absolutePaymentUrl(base: string, value: unknown) {
  const raw = String(value || '')
  if (!raw) return ''
  try { return new URL(raw, `${base.replace(/\/+$/, '')}/`).toString() } catch { return '' }
}

async function walletMessage(userId: number, locale: BotLocale) {
  const [balances, txs] = await Promise.all([
    walletText(userId, locale),
    db.walletTx.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 5 }),
  ])
  const rows = txs.map((t) => `• ${t.amount > 0 ? '➕' : '➖'} ${money(Math.abs(t.amount), t.currency, locale)} — ${esc(transactionLabel(t.type, locale))}`).join('\n')
  return {
    text: `💳 <b>${botText(locale, 'Wallet', 'کیف پول')}</b>\n${botText(locale, 'Balance', 'موجودی')}: <b>${balances}</b>\n${rows ? `\n${botText(locale, 'Recent transactions', 'تراکنش‌های اخیر')}:\n${rows}` : ''}`,
    keyboard: [await miniAppButton(botText(locale, '➕ Top up wallet', '➕ افزایش موجودی'), '/miniapp/wallet')] as InlineKeyboard,
  }
}

function welcomeText(linked: boolean, locale: BotLocale) {
  return [
    botText(locale, '👋 Welcome to <b>MoboComCMS</b>.', '👋 به <b>MoboComCMS</b> خوش آمدید.'),
    '',
    linked
      ? botText(locale, 'Your website account is linked to this Telegram account. Everything is available here.', 'حساب سایت شما به این حساب تلگرام متصل است و می‌توانید همه‌چیز را از همین‌جا مدیریت کنید.')
      : botText(locale, 'Use /link to connect your website account, or sign in to the website directly with Telegram.', 'برای اتصال حساب سایت از /link استفاده کنید یا با تلگرام مستقیماً وارد سایت شوید.'),
    '',
    botText(locale, 'Commands: /me account · /sub subscription link · /plans or /buy purchase · /wallet balance · /link website connection · /language change language · /help guide', 'دستورها: /me حساب · /sub لینک اشتراک · /plans یا /buy خرید · /wallet موجودی · /link اتصال به سایت · /language تغییر زبان · /help راهنما'),
  ].join('\n')
}

export async function POST(req: NextRequest) {
  const cfg = await telegramConfig()
  if (!cfg.ready) return NextResponse.json({ ok: false, error: 'telegram bot is not configured' }, { status: 503 })

  // Telegram sends the secret we installed with the webhook — without it the
  // endpoint would accept forged updates from anyone who guesses the URL.
  if (!cfg.webhookSecret || req.headers.get('x-telegram-bot-api-secret-token') !== cfg.webhookSecret) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const update = await req.json().catch(() => null)
  if (!update) return NextResponse.json({ ok: true })

  try {
    if (update.message) {
      const msg = update.message
      const chatId = msg.chat?.id
      const from = msg.from || {}
      if (msg.chat?.type !== 'private' || msg.chat?.id !== from.id || !Number.isSafeInteger(from.id)) return NextResponse.json({ ok: true })
      const text: string = msg.text || ''
      const telegramId = String(from.id || '')
      const [command, ...rest] = text.trim().split(/\s+/)
      const payload = rest.join(' ')

      const send = (body: string, keyboard?: InlineKeyboard) =>
        bot('sendMessage', {
          chat_id: chatId,
          text: body,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(keyboard?.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
        })

      const linked = await userByTelegram(telegramId)
      const savedLocale = await getBotLocale(telegramId)
      const locale = savedLocale || 'en'
      const L = (en: string, fa: string) => botText(locale, en, fa)

      if (command === '/language' || (command !== '/start' && !savedLocale)) {
        await send(languagePrompt, languageKeyboard)
        return NextResponse.json({ ok: true })
      }

      switch (command) {
        case '/start': {
          if (payload.startsWith('link_')) {
            const ticket = await verifyLinkToken(payload.slice(5))
            if (!ticket) {
              await send(L('This connection link has expired. Generate a new one from your dashboard.', 'این لینک اتصال منقضی شده است. از پنل کاربری یک لینک تازه بسازید.'))
              if (!savedLocale) await send(languagePrompt, languageKeyboard)
              break
            }
            const attached = await attachTelegramToUser(ticket.userId, {
              id: from.id,
              first_name: from.first_name,
              last_name: from.last_name,
              username: from.username,
              language_code: from.language_code,
            })
            if (!attached.ok) {
              await send(locale === 'fa' ? 'اتصال حساب انجام نشد. لطفاً وضعیت حساب خود را در سایت بررسی کنید.' : attached.message)
              if (!savedLocale) await send(languagePrompt, languageKeyboard)
              break
            }
            const summary = await accountSummary(attached.userId, locale)
            await send(
              `${attached.merged ? L('✅ Your previous Telegram account was merged with your website account.', '✅ حساب تلگرامی قبلی شما با حساب سایت ادغام شد.') : L('✅ Telegram is now linked to your website account.', '✅ تلگرام شما به حساب سایت متصل شد.')}\n\n${summary}`,
              [await miniAppButton(L('📱 Open Mini App', '📱 بازکردن مینی‌اپ'))]
            )
            if (!savedLocale) await send(languagePrompt, languageKeyboard)
            break
          }
          const account = await userForTelegram(from as TelegramUser)
          if (!account) {
            await send(L('Your account is not active.', 'حساب شما فعال نیست.'))
            break
          }
          if (!savedLocale) {
            await send(languagePrompt, languageKeyboard)
            break
          }
          await send(welcomeText(true, locale), [await miniAppButton(L('📱 My account', '📱 حساب من'))])
          break
        }
        case '/link': {
          const webToken = await telegramWebLinkToken({
            id: from.id,
            first_name: from.first_name,
            last_name: from.last_name,
            username: from.username,
            language_code: from.language_code,
          } as TelegramUser)
          const base = (await siteBaseUrl()).replace(/\/+$/, '')
          const connectUrl = `${base}/telegram/connect?token=${encodeURIComponent(webToken)}`
          await send(
            linked
              ? L(`This Telegram account is linked to <b>${esc(linked.name)}</b>. Open the secure link below to sign in or synchronize with another website account.`, `این حساب تلگرام به <b>${esc(linked.name)}</b> متصل است. برای ورود یا همگام‌سازی با حساب دیگر از لینک امن زیر استفاده کنید.`)
              : L('Open the secure link below to connect Telegram to the website. You can sign in to an existing account or create website credentials for this Telegram account.', 'برای اتصال تلگرام به سایت لینک امن زیر را باز کنید. می‌توانید به حساب قبلی وارد شوید یا برای همین تلگرام حساب بسازید.'),
            [[{ text: L('🌐 Connect and sync with website', '🌐 اتصال و همگام‌سازی با سایت'), url: connectUrl }]]
          )
          break
        }
        case '/me': {
          if (!linked) {
            await send(L('This Telegram account is not linked yet. Use the website profile or sign in with Telegram.', 'این حساب تلگرام هنوز متصل نیست. از پروفایل سایت استفاده کنید یا با تلگرام وارد شوید.'), [
              await miniAppButton(L('📱 Open Mini App', '📱 بازکردن مینی‌اپ')),
            ])
            break
          }
          await send(await accountSummary(linked.id, locale), [await miniAppButton(L('📱 Manage subscriptions', '📱 مدیریت اشتراک‌ها'))])
          break
        }
        case '/sub': {
          if (!linked) {
            await send(L('Link Telegram to your website account first, or sign in to the website with Telegram.', 'ابتدا تلگرام را به حساب سایت وصل کنید یا با تلگرام وارد سایت شوید.'))
            break
          }
          const res = await subscriptionMessage(linked.id, locale)
          await send(res.text, res.keyboard)
          break
        }
        case '/plans':
        case '/buy': {
          const res = await plansMessage(locale)
          await send(res.text, res.keyboard)
          break
        }
        case '/wallet': {
          if (!linked) {
            await send(L('Link Telegram to your website account first.', 'ابتدا تلگرام را به حساب سایت خود وصل کنید.'))
            break
          }
          const res = await walletMessage(linked.id, locale)
          await send(res.text, res.keyboard)
          break
        }
        case '/help':
        default: {
          await send(
            [
              L('Bot guide:', 'راهنمای ربات:'),
              L('/me — account and subscription summary', '/me — خلاصهٔ حساب و اشتراک‌ها'),
              L('/sub — subscription links for your clients', '/sub — لینک‌های اشتراک'),
              L('/plans or /buy — browse plans and buy in the bot', '/plans یا /buy — مشاهده و خرید طرح‌ها'),
              L('/wallet — wallet balance', '/wallet — موجودی کیف پول'),
              L('/link — connect or synchronize website and Telegram accounts', '/link — اتصال حساب سایت و تلگرام'),
              L('/language — change language', '/language — تغییر زبان'),
              L('You can also manage everything in the Mini App.', 'همچنین می‌توانید همه‌چیز را در مینی‌اپ مدیریت کنید.'),
            ].join('\n'),
            [await miniAppButton(L('📱 Mini App', '📱 مینی‌اپ'))]
          )
        }
      }
      return NextResponse.json({ ok: true })
    }

    if (update.callback_query) {
      const cq = update.callback_query
      if (cq.message?.chat?.type !== 'private' || cq.message?.chat?.id !== cq.from?.id) return NextResponse.json({ ok: true })
      const data: string = cq.data || ''
      const telegramId = String(cq.from?.id || '')
      const savedLocale = await getBotLocale(telegramId)
      const locale = savedLocale || 'en'
      const L = (en: string, fa: string) => botText(locale, en, fa)
      const linked = await userByTelegram(telegramId)
      const answer = (text: string) => bot('answerCallbackQuery', { callback_query_id: cq.id, text })

      const [scope, action, id, gatewayToken] = data.split(':')
      const edit = (text: string, keyboard?: InlineKeyboard) => bot('editMessageText', {
        chat_id: cq.message?.chat?.id,
        message_id: cq.message?.message_id,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(keyboard?.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
      })

      if (data === 'lang:en' || data === 'lang:fa') {
        const selected = data.slice(5) as BotLocale
        await setBotLocale(telegramId, selected)
        const account = await userForTelegram(cq.from as TelegramUser)
        await answer(botText(selected, 'Language saved', 'زبان ذخیره شد'))
        await edit(welcomeText(Boolean(account), selected), [await miniAppButton(botText(selected, '📱 My account', '📱 حساب من'))])
        return NextResponse.json({ ok: true })
      }
      if (!savedLocale) {
        await answer('Choose a language / زبان را انتخاب کنید')
        await edit(languagePrompt, languageKeyboard)
        return NextResponse.json({ ok: true })
      }

      if (scope === 'plans' && action === 'list') {
        await answer(L('Plans', 'طرح‌ها'))
        const list = await plansMessage(locale)
        await edit(list.text, list.keyboard)
      } else if (scope === 'plan' && action === 'view' && Number.isSafeInteger(Number(id)) && Number(id) > 0) {
        const account = linked || await userForTelegram(cq.from as TelegramUser)
        if (!account) {
          await answer(L('Your account is not active.', 'حساب شما فعال نیست.'))
          return NextResponse.json({ ok: true })
        }
        const detail = await planPurchaseMessage(Number(id), account.id, locale)
        if (!detail) {
          await answer(L('This plan is no longer available.', 'این طرح دیگر موجود نیست.'))
          const list = await plansMessage(locale)
          await edit(list.text, list.keyboard)
          return NextResponse.json({ ok: true })
        }
        await answer(L('Plan details', 'جزئیات طرح'))
        await edit(detail.text, detail.keyboard)
      } else if (scope === 'buy' && (action === 'wallet' || action === 'gateway') && Number.isSafeInteger(Number(id)) && Number(id) > 0) {
        // Answer Telegram immediately so the button spinner does not time out while checkout/provisioning runs.
        await answer(L('Creating your order…', 'در حال ثبت سفارش…'))
        const account = linked || await userForTelegram(cq.from as TelegramUser)
        if (!account) {
          await edit(L('Your account is not active. The purchase was not completed.', 'حساب شما فعال نیست و خرید انجام نشد.'))
          return NextResponse.json({ ok: true })
        }
        const planId = Number(id)
        const base = (await siteBaseUrl()).replace(/\/+$/, '')
        const outcome = await executeCheckout({
          userId: account.id,
          email: account.email?.endsWith('@telegram.local') ? null : account.email,
          planId,
          payWith: action,
          gatewayRef: action === 'gateway' ? telegramGatewayRef(gatewayToken) : undefined,
          idempotencyKey: checkoutIdempotencyKey(String(cq.id || ''), planId, action),
          siteUrl: base,
          channel: 'telegram',
        })
        if (!outcome.ok) {
          if (outcome.code === 'GATEWAY_AMBIGUOUS') {
            const invoiceUrl = absolutePaymentUrl(base, outcome.meta?.invoiceUrl)
            await edit([
              L('⚠️ <b>The gateway request status is uncertain.</b>', '⚠️ <b>وضعیت درخواست درگاه مشخص نیست.</b>'),
              '',
              L('Do not press Buy again. Check this invoice to avoid a duplicate payment or order.', 'برای جلوگیری از پرداخت یا سفارش تکراری، دوباره خرید را نزنید و این فاکتور را بررسی کنید.'),
              outcome.meta?.invoiceNumber ? `${L('Invoice', 'فاکتور')}: <code>${esc(String(outcome.meta.invoiceNumber))}</code>` : '',
            ].filter(Boolean).join('\n'), invoiceUrl ? [[{ text: L('🧾 View invoice', '🧾 مشاهدهٔ فاکتور'), url: invoiceUrl }]] : undefined)
            return NextResponse.json({ ok: true })
          }
          const retry = await planPurchaseMessage(planId, account.id, locale)
          const extra = outcome.code === 'INSUFFICIENT_FUNDS' ? `\n\n${L('Your wallet balance is insufficient. Choose online payment.', 'موجودی کیف پول کافی نیست. پرداخت آنلاین را انتخاب کنید.')}` : ''
          await edit(`❌ ${L('The purchase was not completed.', 'خرید انجام نشد.')}\n\n${locale === 'fa' ? L('Please try again or contact support.', 'دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.') : esc(outcome.message)}${extra}`, retry?.keyboard)
          return NextResponse.json({ ok: true })
        }
        const result = outcome.data as Record<string, any>
        if (result.paid) {
          const pending = Boolean(result.fulfillmentPending)
          await edit([
            L('✅ <b>Payment completed successfully.</b>', '✅ <b>پرداخت با موفقیت انجام شد.</b>'),
            '',
            pending ? L('Your order is registered and provisioning is in progress. The encrypted Happ link will be sent here when ready.', 'سفارش ثبت شد و سرویس در حال آماده‌سازی است. لینک رمزگذاری‌شدهٔ Happ پس از آماده‌شدن همین‌جا ارسال می‌شود.') : L('Your subscription is ready. The encrypted Happ link will be sent in the confirmation message.', 'اشتراک شما آماده است. لینک رمزگذاری‌شدهٔ Happ در پیام تأیید ارسال می‌شود.'),
            result.invoiceNumber ? `${L('Invoice', 'فاکتور')}: <code>${esc(String(result.invoiceNumber))}</code>` : '',
          ].filter(Boolean).join('\n'), [[{ text: L('📡 My subscriptions', '📡 اشتراک‌های من'), callback_data: 'subs:list:0' }]])
        } else {
          const paymentUrl = absolutePaymentUrl(base, result.paymentUrl)
          const keyboard: InlineKeyboard = paymentUrl ? [[{ text: L('💳 Secure payment', '💳 پرداخت امن'), url: paymentUrl }], [{ text: L('↩️ Back to plans', '↩️ بازگشت به طرح‌ها'), callback_data: 'plans:list:0' }]] : [[{ text: L('↩️ Back to plans', '↩️ بازگشت به طرح‌ها'), callback_data: 'plans:list:0' }]]
          await edit([
            L('🧾 <b>Your order has been created.</b>', '🧾 <b>سفارش شما ثبت شد.</b>'),
            '',
            `${L('Amount due', 'مبلغ قابل پرداخت')}: <b>${money(Number(result.amountDue || 0), String(result.currency || 'USD'), locale)}</b>`,
            Number(result.walletApplied || 0) > 0 ? `${L('From wallet', 'از کیف پول')}: <b>${money(Number(result.walletApplied), String(result.currency || 'USD'), locale)}</b>` : '',
            result.gatewayLabel ? `${L('Gateway', 'درگاه')}: <b>${esc(String(result.gatewayLabel))}</b>` : '',
            result.providerCurrency === 'TMN' && Number(result.providerAmount) > 0 ? `${L('Card transfer amount', 'مبلغ کارت‌به‌کارت')}: <b>${Number(result.providerAmount).toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')} ${L('toman', 'تومان')}</b>` : '',
            result.invoiceNumber ? `${L('Invoice', 'فاکتور')}: <code>${esc(String(result.invoiceNumber))}</code>` : '',
            '',
            paymentUrl ? L('Use the payment button to complete your purchase. After confirmation, the subscription and Happ link will be sent here automatically.', 'برای تکمیل خرید دکمهٔ پرداخت را بزنید. پس از تأیید، اشتراک و لینک Happ خودکار همین‌جا ارسال می‌شود.') : L('The payment link is unavailable. Check the invoice status in your account.', 'لینک پرداخت در دسترس نیست. وضعیت فاکتور را در حساب خود بررسی کنید.'),
          ].filter(Boolean).join('\n'), keyboard)
        }
      } else if (scope === 'subs' && action === 'list') {
        if (!linked) { await answer(L('Link Telegram to your website account first.', 'ابتدا تلگرام را به حساب سایت وصل کنید.')); return NextResponse.json({ ok: true }) }
        await answer(L('Subscriptions', 'اشتراک‌ها'))
        const fresh = await subscriptionMessage(linked.id, locale)
        await edit(fresh.text, fresh.keyboard)
      } else if (scope === 'sub' && Number.isSafeInteger(Number(id)) && Number(id) > 0) {
        if (!linked) { await answer(L('Link Telegram to your website account first.', 'ابتدا تلگرام را به حساب سایت وصل کنید.')); return NextResponse.json({ ok: true }) }
        const sub = await db.subscription.findUnique({ where: { id: Number(id) } })
        if (!sub || sub.userId !== linked.id) {
          await answer(L('This subscription does not belong to your account.', 'این اشتراک متعلق به حساب شما نیست.'))
          return NextResponse.json({ ok: true })
        }
        const map: Record<string, 'enable' | 'disable' | 'sync'> = { enable: 'enable', disable: 'disable', sync: 'sync' }
        const act = map[action]
        if (!act) {
          await answer(L('Unknown command', 'دستور ناشناخته'))
          return NextResponse.json({ ok: true })
        }
        const res = await subscriptionAction(sub.id, act)
        await answer(res.ok ? (act === 'sync' ? L('Synchronized ✓', 'همگام شد ✓') : act === 'disable' ? L('Disabled ✓', 'غیرفعال شد ✓') : L('Enabled ✓', 'فعال شد ✓')) : locale === 'fa' ? 'خطا؛ دوباره تلاش کنید.' : `Error: ${res.message || ''}`)
        const fresh = await subscriptionMessage(linked.id, locale)
        await edit(fresh.text, fresh.keyboard)
      } else {
        await answer(L('Unknown command', 'دستور ناشناخته'))
      }
      return NextResponse.json({ ok: true })
    }
  } catch (e: any) {
    // never let the bot loop on a retry: answer Telegram, log the reason
    console.error('telegram webhook error', e?.message || e)
  }

  return NextResponse.json({ ok: true })
}

/** Telegram only supports POST webhooks; a GET answers "is it alive". */
export async function GET() {
  const cfg = await telegramConfig()
  return NextResponse.json({ ok: true, configured: cfg.ready, bot: cfg.username || null })
}
