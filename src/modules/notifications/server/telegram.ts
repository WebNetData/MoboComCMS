// Telegram integration — one module for the bot, the mini app and the shop.
//
//   • config        → bot token / username / api base, from admin settings or env
//   • verifyInitData→ proves that a mini-app request really came from Telegram
//   • bot()         → tiny Bot API client (sendMessage, menus, webhook install)
//   • link tokens   → signed `t.me/<bot>?start=link_<token>` deep links that
//                     attach a Telegram account to a shop account
//   • notify()      → best-effort messages to a customer (never throws)
import crypto from 'crypto'
import { botText, getBotLocale } from '@/modules/notifications/server/telegram-locale'
import { db } from '@/platform/database/prisma'
import { safeHappLink } from '@/modules/subscriptions/server/happ-protocol'
import { planName } from '@/modules/catalog/domain/plan-locale'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { socialFetch } from '@/modules/social/server/egress'

export const TG_KEYS = {
  token: 'telegramBotToken',
  username: 'telegramBotUsername',
  apiBase: 'telegramApiBase',
  webhookSecret: 'telegramWebhookSecret',
  enabled: 'telegramEnabled',
} as const

const DEFAULT_API_BASE = 'https://api.telegram.org'

export interface TelegramConfig {
  token: string
  username: string
  apiBase: string
  webhookSecret: string
  enabled: boolean
  /** a bot can only be configured when we have a token */
  ready: boolean
}

/** All Telegram settings in one read. Env vars win so deployments stay declarative. */
export async function telegramConfig(): Promise<TelegramConfig> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(TG_KEYS) } } }).catch(() => [])
  const s: Record<string, string> = {}
  for (const r of rows) s[r.key] = r.value

  const token = process.env.TELEGRAM_BOT_TOKEN || s[TG_KEYS.token] || ''
  const username = (process.env.TELEGRAM_BOT_USERNAME || s[TG_KEYS.username] || '').replace(/^@/, '')
  const apiBase = (process.env.TELEGRAM_API_BASE || s[TG_KEYS.apiBase] || DEFAULT_API_BASE).replace(/\/+$/, '')
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || s[TG_KEYS.webhookSecret] || ''
  const flag = process.env.TELEGRAM_ENABLED ?? s[TG_KEYS.enabled] ?? ''
  const enabled = flag === '' ? Boolean(token) : flag === 'true' || flag === '1'

  return { token, username, apiBase, webhookSecret, enabled, ready: Boolean(token) && enabled }
}

// ============ Bot API ============

export interface BotResult<T = any> {
  ok: boolean
  result?: T
  description?: string
  status?: number
}

/**
 * One Bot API call. `apiBase` is configurable so a shop behind a proxy (or a
 * test) can point at its own endpoint instead of api.telegram.org.
 */
export async function bot<T = any>(
  method: string,
  payload: Record<string, unknown> | FormData = {},
  cfg?: TelegramConfig
): Promise<BotResult<T>> {
  const config = cfg || (await telegramConfig())
  if (!config.token) return { ok: false, description: 'bot token is not configured' }
  try {
    // Serialize multipart once so the same byte body also crosses the existing Xray transport.
    const multipart = payload instanceof FormData ? new Request('http://localhost', { method: 'POST', body: payload }) : null
    const headers = { 'content-type': multipart?.headers.get('content-type') || 'application/json' }
    const body = multipart ? await multipart.arrayBuffer() : JSON.stringify(payload)
    // Through the social-network proxy when the owner turned it on (Server Panel); directly otherwise.
    const res = await socialFetch(`${config.apiBase}/bot${config.token}/${method}`, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(multipart ? 30_000 : 8000),
    })
    const data = await res.json().catch(() => null)
    return { ok: Boolean(data?.ok), result: data?.result, description: data?.description, status: res.status }
  } catch (e: any) {
    return { ok: false, description: e?.message || 'request failed' }
  }
}

/** Every call a shop needs to switch the bot on, in order. */
export async function installBot(baseUrl: string): Promise<{ ok: boolean; steps: { step: string; ok: boolean; detail: string }[] }> {
  const cfg = await telegramConfig()
  if (!baseUrl.startsWith('https://')) return { ok: false, steps: [{ step: 'domain', ok: false, detail: 'Configure the public HTTPS domain in site settings' }] }
  if (!cfg.webhookSecret) {
    cfg.webhookSecret = crypto.randomBytes(32).toString('hex')
    await db.setting.upsert({ where: { key: TG_KEYS.webhookSecret }, create: { key: TG_KEYS.webhookSecret, value: cfg.webhookSecret }, update: { value: cfg.webhookSecret } })
  }
  const steps: { step: string; ok: boolean; detail: string }[] = []
  if (!cfg.token) return { ok: false, steps: [{ step: 'token', ok: false, detail: 'The bot token is not configured' }] }

  const me = await bot<{ username?: string }>('getMe', {}, cfg)
  steps.push({ step: 'getMe', ok: me.ok, detail: me.ok ? `@${me.result?.username || cfg.username || '?'}` : me.description || 'failed' })

  if (!me.ok) return { ok: false, steps }
  if (me.result?.username && me.result.username !== cfg.username) {
    cfg.username = me.result.username
    await db.setting.upsert({
      where: { key: TG_KEYS.username },
      create: { key: TG_KEYS.username, value: cfg.username },
      update: { value: cfg.username },
    })
  }
  const webhookUrl = `${baseUrl.replace(/\/+$/, '')}/api/telegram/webhook`
  const set = await bot('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
    ...(cfg.webhookSecret ? { secret_token: cfg.webhookSecret } : {}),
  }, cfg)
  steps.push({ step: 'setWebhook', ok: set.ok, detail: set.ok ? webhookUrl : set.description || 'failed' })

  const menu = await setMenuButton(baseUrl, cfg)
  steps.push(menu)

  const cmds = await bot('setMyCommands', {
    commands: [
      { command: 'start', description: 'Start / My account' },
      { command: 'me', description: 'Account summary' },
      { command: 'sub', description: 'Subscription links' },
      { command: 'plans', description: 'Plans and purchase' },
      { command: 'buy', description: 'Buy a subscription' },
      { command: 'wallet', description: 'Wallet' },
      { command: 'link', description: 'Link website account' },
      { command: 'language', description: 'Change language' },
      { command: 'help', description: 'Help' },
    ],
  }, cfg)
  steps.push({ step: 'setMyCommands', ok: cmds.ok, detail: cmds.ok ? '9 commands' : cmds.description || 'failed' })

  const faCommands = await bot('setMyCommands', {
    language_code: 'fa',
    commands: [
      { command: 'start', description: 'شروع / حساب من' },
      { command: 'me', description: 'خلاصهٔ حساب' },
      { command: 'sub', description: 'لینک‌های اشتراک' },
      { command: 'plans', description: 'طرح‌ها و خرید' },
      { command: 'buy', description: 'خرید اشتراک' },
      { command: 'wallet', description: 'کیف پول' },
      { command: 'link', description: 'اتصال حساب سایت' },
      { command: 'language', description: 'تغییر زبان' },
      { command: 'help', description: 'راهنما' },
    ],
  }, cfg)
  steps.push({ step: 'setMyCommands/fa', ok: faCommands.ok, detail: faCommands.ok ? '9 commands' : faCommands.description || 'failed' })

  return { ok: steps.every((s) => s.ok), steps }
}

/** Keep Telegram's native menu; the Mini App remains available from bot messages. */
export async function setMenuButton(_baseUrl: string, cfg?: TelegramConfig): Promise<{ step: string; ok: boolean; detail: string }> {
  const config = cfg || (await telegramConfig())
  const res = await bot('setChatMenuButton', { menu_button: { type: 'default' } }, config)
  if (res.ok) return { step: 'setChatMenuButton', ok: true, detail: 'default' }
  return { step: 'setChatMenuButton', ok: false, detail: res.description || 'failed' }
}

// ============ mini-app authentication ============

export interface TelegramUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
  is_premium?: boolean
}

/**
 * Verifies a Telegram Web App `initData` string exactly the way Telegram
 * documents it: secret = HMAC_SHA256(bot_token, 'WebAppData'), then compare
 * HMAC_SHA256(data_check_string, secret) with the provided `hash`.
 *
 * Returns the Telegram user on success — that identity is what logs the
 * customer in, so a forged payload must be impossible.
 */
export function verifyInitData(initData: string, botToken: string, maxAgeSec = 600): TelegramUser | null {
  if (!initData || !botToken) return null
  const params = new URLSearchParams(initData)
  const hash = params.get('hash') || ''
  if (!/^[a-f0-9]{64}$/i.test(hash) || initData.length > 16384 || new Set(params.keys()).size !== [...params.keys()].length) return null
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')

  const a = Buffer.from(computed, 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  const authDate = Number(params.get('auth_date') || 0)
  if (!Number.isSafeInteger(authDate) || authDate <= 0 || authDate > Date.now() / 1000 + 30) return null
  if (maxAgeSec > 0 && Date.now() / 1000 - authDate > maxAgeSec) return null

  const rawUser = params.get('user')
  if (!rawUser) return null
  try {
    const user = JSON.parse(rawUser)
    return Number.isSafeInteger(user?.id) && user.id > 0 ? (user as TelegramUser) : null
  } catch {
    return null
  }
}

/** Verify the JSON payload returned by Telegram's website Login Widget. */
export function verifyLoginWidget(authData: string, botToken: string, maxAgeSec = 600): TelegramUser | null {
  if (!authData || !botToken || authData.length > 8192) return null
  let data: Record<string, unknown>
  try { data = JSON.parse(authData) } catch { return null }
  const hash = String(data.hash || '')
  if (!/^[a-f0-9]{64}$/i.test(hash)) return null
  const authDate = Number(data.auth_date || 0)
  const id = Number(data.id)
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(authDate) || authDate <= 0) return null
  const now = Date.now() / 1000
  if (authDate > now + 30 || (maxAgeSec > 0 && now - authDate > maxAgeSec)) return null
  const allowed = new Set(['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash'])
  if (Object.keys(data).some((key) => !allowed.has(key))) return null
  const check = Object.entries(data)
    .filter(([key, value]) => key !== 'hash' && value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort()
    .join('\n')
  const secret = crypto.createHash('sha256').update(botToken).digest()
  const computed = crypto.createHmac('sha256', secret).update(check).digest('hex')
  const a = Buffer.from(computed, 'hex'), b = Buffer.from(hash, 'hex')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  return {
    id,
    first_name: typeof data.first_name === 'string' ? data.first_name : undefined,
    last_name: typeof data.last_name === 'string' ? data.last_name : undefined,
    username: typeof data.username === 'string' ? data.username : undefined,
    photo_url: typeof data.photo_url === 'string' ? data.photo_url : undefined,
  }
}

// ============ deep-link tokens ============

/** `link_<payload>` — a short-lived ticket the customer carries from the shop to the bot. */
export async function linkToken(userId: number, ttlSec = 600) {
  const token = crypto.randomBytes(24).toString('base64url')
  const key = 'telegram.link.' + crypto.createHash('sha256').update(token).digest('hex')
  await db.setting.create({ data: { key, value: JSON.stringify({ userId, expires: Date.now() + ttlSec * 1000 }) } })
  return token
}

/** Consume the random ticket atomically, so even simultaneous replays fail. */
export async function verifyLinkToken(token: string): Promise<{ userId: number } | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null
  const key = 'telegram.link.' + crypto.createHash('sha256').update(token).digest('hex')
  return db.$transaction(async tx => {
    const row = await tx.setting.findUnique({ where: { key } })
    if (!row) return null
    await tx.setting.delete({ where: { key } })
    try {
      const value = JSON.parse(row.value)
      if (!Number.isSafeInteger(value.userId) || !Number.isFinite(value.expires) || value.expires < Date.now()) return null
      return { userId: value.userId }
    } catch { return null }
  })
}


export interface TelegramWebLinkTicket {
  telegram: TelegramUser
}

/** One-time ticket carried from the bot to the website account-link screen. */
export async function telegramWebLinkToken(tg: TelegramUser, ttlSec = 600) {
  const token = crypto.randomBytes(24).toString('base64url')
  const key = 'telegram.web-link.' + crypto.createHash('sha256').update(token).digest('hex')
  const telegram: TelegramUser = {
    id: tg.id,
    first_name: tg.first_name || '',
    last_name: tg.last_name || '',
    username: tg.username || '',
    language_code: tg.language_code || '',
  }
  await db.setting.create({ data: { key, value: JSON.stringify({ telegram, expires: Date.now() + ttlSec * 1000 }) } })
  return token
}

/** Consume a bot → website ticket once. */
export async function verifyTelegramWebLinkToken(token: string): Promise<TelegramWebLinkTicket | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null
  const key = 'telegram.web-link.' + crypto.createHash('sha256').update(token).digest('hex')
  return db.$transaction(async tx => {
    const row = await tx.setting.findUnique({ where: { key } })
    if (!row) return null
    await tx.setting.delete({ where: { key } })
    try {
      const value = JSON.parse(row.value)
      const tg = value?.telegram
      if (!Number.isSafeInteger(tg?.id) || tg.id <= 0 || !Number.isFinite(value?.expires) || value.expires < Date.now()) return null
      return { telegram: tg as TelegramUser }
    } catch { return null }
  })
}

/** The t.me deep link that starts the bot and hands it the ticket. */
export function botDeepLink(username: string, payload = '') {
  const handle = String(username || '').replace(/^@/, '')
  if (!handle) return ''
  return `https://t.me/${handle}${payload ? `?start=${encodeURIComponent(payload)}` : ''}`
}

// ============ outbound notifications ============

export type InlineKeyboard = { text: string; url?: string; callback_data?: string; web_app?: { url: string } }[][]

/** A plain message to a known Telegram id. Never throws, never blocks a purchase. */
export async function notifyTelegram(telegramId: string, text: string, keyboard?: InlineKeyboard): Promise<boolean> {
  if (!telegramId) return false
  const cfg = await telegramConfig()
  if (!cfg.ready) return false
  const res = await bot('sendMessage', {
    chat_id: telegramId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  }, cfg)
  return res.ok
}

/** Message the customer behind a shop account (no-op when they have not linked). */
export async function notifyUser(userId: number, text: string, keyboard?: InlineKeyboard): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { telegramId: true } })
  return notifyTelegram(user?.telegramId || '', text, keyboard)
}

/**
 * Tells the customer their subscription is ready — the moment it is created,
 * with the link in hand. Called from provisioning, so every rail (wallet,
 * gateway, admin invoice, reseller) notifies through the same path.
 */
export async function notifySubscriptionReady(subscriptionId: number, event: 'created' | 'renewed' = 'created'): Promise<boolean> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, user: { select: { telegramId: true } } },
  })
  if (!sub) return false

  await createInboxEvent({
    userId: sub.userId,
    kind: event === 'renewed' ? 'SUBSCRIPTION_RENEWED' : 'SUBSCRIPTION_READY',
    dedupeKey: `subscription:${sub.id}:${event === 'renewed' ? `renewal:${sub.expiresAt.toISOString()}` : 'ready'}`,
    titleEn: event === 'renewed' ? 'Subscription renewed' : 'Subscription ready',
    titleFa: event === 'renewed' ? 'اشتراک تمدید شد' : 'اشتراک آماده است',
    bodyEn: `${planName(sub.plan, 'en')} is ready to use.`, bodyFa: `اشتراک ${planName(sub.plan, 'fa')} آمادهٔ استفاده است.`,
    href: `/dashboard/subscriptions/${sub.id}`,
  }).catch(() => {})
  if (!sub.user.telegramId) return false

  const locale = await getBotLocale(sub.user.telegramId) || 'en'
  const url = await safeHappLink(sub.subToken)
  const days = Math.max(0, Math.ceil((sub.expiresAt.getTime() - Date.now()) / 86400_000))
  const esc = (value: string) => value.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!))
  const displayPlan = esc(planName(sub.plan, locale))
  const text = [
    event === 'renewed'
      ? botText(locale, `✅ Your <b>${displayPlan}</b> subscription was renewed. Remaining traffic and time have been preserved and extended.`, `✅ اشتراک <b>${displayPlan}</b> شما تمدید شد. حجم و زمان باقی‌مانده حفظ و به آن اضافه شد.`)
      : botText(locale, `🎉 Your <b>${displayPlan}</b> subscription is ready and active.`, `🎉 اشتراک <b>${displayPlan}</b> شما آماده و فعال شد.`),
    '',
    `${botText(locale, 'Traffic', 'حجم')}: <b>${sub.trafficLimit ? `${sub.trafficLimit} GB` : botText(locale, 'Unlimited', 'نامحدود')}</b> · ${botText(locale, 'Validity', 'اعتبار')}: <b>${days} ${botText(locale, 'days', 'روز')}</b>`,
    `${botText(locale, 'Configuration name', 'نام کانفیگ')}: <code>${esc(sub.username)}</code>`,
    '',
    botText(locale, 'Subscription link (add it to your client):', 'لینک اشتراک (در برنامهٔ خود اضافه کنید):'),
    url ? `<code>${esc(url)}</code>` : botText(locale, 'The connection link is not ready yet. Check its status in your dashboard.', 'لینک اتصال هنوز آماده نیست. وضعیت را در پنل کاربری بررسی کنید.'),
  ].join('\n')

  return notifyTelegram(sub.user.telegramId, text, [await miniAppButton(botText(locale, '📱 Manage subscription', '📱 مدیریت اشتراک'))])
}

/** The button that opens the mini app, with a normal-link fallback for http. */
export async function miniAppButton(label: string, path = '/miniapp'): Promise<InlineKeyboard[0]> {
  const cfg = await telegramConfig()
  const row = await db.setting.findUnique({ where: { key: 'siteUrl' } }).catch(() => null)
  const base = (row?.value || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const url = `${base}${path}`
  return url.startsWith('https://')
    ? [{ text: label, web_app: { url } }]
    : [{ text: label, url }]
}
