// Private conversation presentation; authorization stays at the owning webhook/Identity commands.
import { db } from '@/platform/database/prisma'
import { safeHappLink } from '@/modules/subscriptions/server/happ-protocol'
import { miniAppButton, type InlineKeyboard } from '@/modules/notifications/server/telegram'
import { walletBalances } from '@/modules/wallet/server/wallet'
import { formatAmount } from '@/shared/money/format'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'
import { botText, type BotLocale } from '@/modules/notifications/server/telegram-locale'
import { planName } from '@/modules/catalog/domain/plan-locale'
import { transactionLabel } from '@/modules/wallet/domain/transaction-locale'

export const esc = (v: string) =>
  String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function money(n: number, currency = 'USD', locale: BotLocale = 'en') {
  return formatAmount(n || 0, currency, locale === 'fa' ? 'fa-IR' : 'en-US')
}

async function walletText(userId: number, locale: BotLocale) {
  const balances = await walletBalances(userId)
  return balances.length ? balances.map((b) => money(b.balance, b.currency, locale)).join(' · ') : money(0, 'USD', locale)
}

function gb(n: number, locale: BotLocale) {
  return n ? `${n} GB` : botText(locale, 'Unlimited', 'نامحدود')
}

async function subsOf(userId: number) {
  return db.subscription.findMany({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
}

export async function accountSummary(userId: number, locale: BotLocale) {
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

export async function subscriptionMessage(userId: number, locale: BotLocale) {
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

export async function plansMessage(locale: BotLocale) {
  const plans = await db.plan.findMany({ where: { active: true, panel: { is: { active: true } } }, orderBy: { sort: 'asc' }, take: 8, include: { panel: true } })
  if (!plans.length) return { text: botText(locale, 'There are no active plans available right now.', 'در حال حاضر طرح فعالی وجود ندارد.'), keyboard: [] as InlineKeyboard }
  const text = plans
    .map((p, index) => `${index + 1}. <b>${esc(planName(p, locale))}</b> — ${gb(p.trafficGB, locale)} / ${p.days} ${botText(locale, 'days', 'روز')}\n   ${money(p.price, p.currency, locale)}`)
    .join('\n\n')
  const keyboard: InlineKeyboard = plans.map((p) => [{ text: `🛒 ${planName(p, locale)} · ${money(p.price, p.currency, locale)}`, callback_data: `plan:view:${p.id}` }])
  return { text: `💠 <b>${botText(locale, 'Plans', 'طرح‌ها')}</b>\n\n${text}\n\n${botText(locale, 'Choose a plan to continue:', 'برای ادامه یک طرح انتخاب کنید:')}`, keyboard }
}

export async function planPurchaseMessage(planId: number, userId: number, locale: BotLocale) {
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

export async function walletMessage(userId: number, locale: BotLocale) {
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

export function welcomeText(linked: boolean, locale: BotLocale) {
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
