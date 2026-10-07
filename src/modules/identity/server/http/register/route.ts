import { offeredLocale } from '@/i18n/policy'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { emitExtensionEvent } from '@/extensions/server/runtime'
import { claimTelegramAccount } from '@/modules/identity/telegram-account'
import { verifyTelegramWebLinkToken } from '@/modules/notifications/server/telegram'
import { verifyTurnstile } from '@/modules/identity/server/turnstile'
import { getBotLocale, setUserLocale } from '@/modules/notifications/server/telegram-locale'
import { normalizeReferralCode, referralPolicy } from '@/modules/referrals/server/referrals'

export async function POST(req: NextRequest) {
  const locale = offeredLocale(req.cookies.get('lang')?.value)
  const L = (en: string, fa: string) => locale === 'fa' ? fa : en
  // Registration is a spam/enumeration vector: keep it slow per IP.
  const limiter = await rateLimitStrict(`register:${clientIp(req.headers)}`, 5, 60 * 60_000)
  if (!limiter.ok) return err(L('Too many registration attempts. Please try again later.', 'تلاش‌های ثبت‌نام بیش از حد مجاز است؛ کمی بعد دوباره امتحان کنید'), 429)

  const body = await req.json().catch(() => null)
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  const name = String(body?.name || '').trim()
  const telegramToken = String(body?.telegramToken || '').trim()
  const referralCode = normalizeReferralCode(body?.referralCode)

  if (!await verifyTurnstile(body?.turnstileToken, req.headers, 'register')) {
    return err(L('Security verification failed. Please try again.', 'اعتبارسنجی امنیتی ناموفق بود؛ دوباره تلاش کنید'), 400, { code: 'TURNSTILE_FAILED' })
  }

  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 190) return err(L('Invalid email address', 'ایمیل معتبر نیست'))
  if (password.length < 8 || password.length > 128) return err(L('Password must be between 8 and 128 characters', 'رمز عبور باید بین ۸ تا ۱۲۸ کاراکتر باشد'))
  if (name.length > 100) return err(L('Name must be 100 characters or fewer', 'نام حداکثر ۱۰۰ کاراکتر می‌تواند باشد'))
  if (telegramToken && !/^[A-Za-z0-9_-]{32}$/.test(telegramToken)) return err(L('Invalid Telegram connection link', 'لینک اتصال تلگرام معتبر نیست'), 400)

  const exists = await db.user.findUnique({ where: { email } })
  if (exists) return err(L('This email address is already registered', 'این ایمیل قبلاً ثبت شده است'))

  let referral: { ownerId: number; code: string } | null = null
  let rewardBps = 0
  if (referralCode) {
    if (!/^[A-Z0-9_-]{3,32}$/.test(referralCode)) return err(L('Invalid referral link', 'لینک معرفی معتبر نیست'))
    const policy = await referralPolicy()
    if (!policy.enabled) return err(L('Referral programme is unavailable', 'طرح معرفی در حال حاضر فعال نیست'))
    referral = await db.referralCode.findUnique({ where: { code: referralCode }, select: { ownerId: true, code: true, active: true } }).then(row => row?.active ? row : null)
    if (!referral) return err(L('Referral code not found', 'کد معرف یافت نشد'))
    rewardBps = policy.rewardBps
  }

  const passwordHash = await bcrypt.hash(password, 10)

  if (telegramToken) {
    const ticket = await verifyTelegramWebLinkToken(telegramToken)
    if (!ticket) return err(L('The Telegram link has expired or was already used. Request a new link from the bot.', 'لینک اتصال تلگرام منقضی یا قبلاً استفاده شده است؛ از ربات یک لینک تازه بگیرید'), 410, { code: 'LINK_EXPIRED' })

    const claimed = await claimTelegramAccount({ tg: ticket.telegram, email, passwordHash, name, referral: referral ? { ...referral, rewardBps } : null })
    if (!claimed.ok) return err(locale === 'fa' ? claimed.message : 'Could not link this Telegram account. Please check its status and try again.', 409, { code: claimed.code })

    const user = await db.user.findUnique({ where: { id: claimed.userId }, select: { id: true, email: true, role: true } })
    if (!user) return err(L('Account creation could not be completed', 'ساخت حساب کامل نشد'), 500)
    await setUserLocale(user.id, await getBotLocale(String(ticket.telegram.id)) || locale)
    await emitExtensionEvent('user.created', { userId: user.id, email: user.email, role: user.role })
    return ok({ id: user.id, email: user.email, telegramLinked: true })
  }

  const user = await db.$transaction(async tx => {
    const created = await tx.user.create({ data: { email, passwordHash, name, role: 'CUSTOMER' } })
    if (referral) await tx.referralAttribution.create({ data: { referredUserId: created.id, referrerUserId: referral.ownerId, code: referral.code, rewardBps } })
    return created
  })

  await setUserLocale(user.id, locale)
  await emitExtensionEvent('user.created', { userId: user.id, email: user.email, role: user.role })
  return ok({ id: user.id, email: user.email })
}
