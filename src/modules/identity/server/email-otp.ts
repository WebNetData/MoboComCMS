import { createHmac, randomBytes, randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { getSmtp, sendMail } from '@/modules/mail/server/mailer'
import { codeEmail, deliverableEmail, normalizeEmail, isEmail } from '@/modules/mail/domain/mail'
import { OTP_RESEND_MS, OTP_TTL_MS, otpCode, validOtpFormat } from '@/modules/sms/domain/sms'
import { latinDigits } from '@/shared/text/digits'
import { getSecurityPolicy, SecurityError } from './account-security'
import { claimOtpChallenge } from './otp-challenge'
import { globalAuthenticationDenied } from './authentication-restrictions'
import { getSettings } from '@/modules/settings/server'

const hashCode = (email: string, code: string) => createHmac('sha256', authSecret()).update(`email-otp:LOGIN:${email}:${code}`).digest('hex')
const recipient = (input: unknown) => typeof input === 'string' ? normalizeEmail(input) : ''

export async function emailOtpAvailable() {
  const [policy, smtp] = await Promise.all([getSecurityPolicy(), getSmtp()])
  return policy.emailOtp && smtp.enabled && !!smtp.host && isEmail(smtp.fromEmail)
}

export async function requestEmailCode(input: { email: unknown; ip: string }) {
  const email = recipient(input.email)
  if (email.length > 254 || !deliverableEmail(email)) throw new SecurityError('نشانی ایمیل معتبر نیست')
  if (!await emailOtpAvailable()) throw new SecurityError('ورود با کد ایمیلی فعال نیست', 403)
  const key = createHmac('sha256', authSecret()).update(email).digest('hex')
  for (const [bucket, limit, period] of [[`ip:${input.ip}`, 15, 3600000], [`hour:${key}`, 5, 3600000], [`resend:${key}`, 1, OTP_RESEND_MS]] as const) {
    if (!(await rateLimitStrict(`email-otp:send:${bucket}`, limit, period)).ok) throw new SecurityError('درخواست زیادی ثبت شده است؛ کمی بعد دوباره تلاش کنید', 429)
  }
  const now = new Date()
  const code = otpCode(randomInt)
  const row = await db.$transaction(async tx => {
    const [last, recentRecipient, recentIp, user] = await Promise.all([
      tx.otpCode.findFirst({ where: { email, purpose: 'EMAIL_LOGIN' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      tx.otpCode.count({ where: { email, purpose: 'EMAIL_LOGIN', createdAt: { gt: new Date(now.getTime() - 3600000) } } }),
      tx.otpCode.count({ where: { ip: input.ip.slice(0, 64), createdAt: { gt: new Date(now.getTime() - 3600000) } } }),
      tx.user.findUnique({ where: { email }, select: { id: true } }),
    ])
    if (last && now.getTime() - last.createdAt.getTime() < OTP_RESEND_MS) throw new SecurityError('برای ارسال دوباره یک دقیقه صبر کنید', 429)
    if (recentRecipient >= 5 || recentIp >= 15) throw new SecurityError('درخواست زیادی ثبت شده است؛ یک ساعت دیگر تلاش کنید', 429)
    await tx.otpCode.updateMany({ where: { email, purpose: 'EMAIL_LOGIN', consumedAt: null }, data: { consumedAt: now } })
    return tx.otpCode.create({ data: { phone: '', email, purpose: 'EMAIL_LOGIN', userId: user?.id, codeHash: hashCode(email, code), expiresAt: new Date(now.getTime() + OTP_TTL_MS), ip: input.ip.slice(0, 64) } })
  }, { isolationLevel: 'Serializable' })
  // Account standing/existence is not exposed by the send response. Session policy is checked at verification.
  let delivered = false
  try {
    const settings = await getSettings()
    const mail = codeEmail({ brand: settings.brandName || 'موبوکام', site: settings.siteUrl || process.env.NEXTAUTH_URL || '', title: 'کد یک‌بارمصرف ورود', code, intro: 'برای ورود به حساب، این کد را در صفحهٔ ورود وارد کنید. آن را در اختیار هیچ‌کس قرار ندهید؛ پشتیبانی هرگز کد شما را نمی‌پرسد.', validity: 'این کد دو دقیقه اعتبار دارد.', href: '/login', button: 'رفتن به صفحهٔ ورود', note: 'اگر این درخواست را نفرستاده‌اید، این ایمیل را نادیده بگیرید؛ بدون این کد کسی وارد حساب شما نمی‌شود.' })
    delivered = (await sendMail({ to: email, ...mail, source: 'login-code' })).ok
  } finally {
    if (!delivered) await db.otpCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } })
  }
  if (!delivered) throw new SecurityError('ارسال ایمیل انجام نشد؛ کمی بعد دوباره تلاش کنید', 502)
  return { display: email, expiresIn: OTP_TTL_MS / 1000, resendIn: OTP_RESEND_MS / 1000 }
}

/** Peek before TOTP, then claim the same latest code before creating/updating the canonical user. */
export async function verifyEmailCode(input: { email: unknown; code: unknown; consume?: boolean }) {
  const email = recipient(input.email), code = latinDigits(input.code).trim()
  if (!deliverableEmail(email) || !validOtpFormat(code) || !await emailOtpAvailable()) return null
  const row = await db.otpCode.findFirst({ where: { email, purpose: 'EMAIL_LOGIN' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
  if (!await claimOtpChallenge(row, hashCode(email, code), input.consume !== false)) return null
  const user = await db.user.findUnique({ where: { email }, include: { roleRef: true } })
  if ((user?.id ?? null) !== (row?.userId ?? null)) return null
  if (user && (user.status !== 'ACTIVE' || await globalAuthenticationDenied(user.id))) return null
  return { email, user }
}

export async function userForEmailCode(input: { email: unknown; code: unknown }) {
  const verified = await verifyEmailCode(input)
  if (!verified) return null
  if (verified.user) return db.user.update({ where: { id: verified.user.id }, data: { lastLoginAt: new Date() }, include: { roleRef: true } })
  // The unique email key arbitrates competing account creation; never overwrite or merge another identity.
  try {
    return await db.user.create({ data: { email: verified.email, passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'), 10), lastLoginAt: new Date() }, include: { roleRef: true } })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') return null
    throw error
  }
}
