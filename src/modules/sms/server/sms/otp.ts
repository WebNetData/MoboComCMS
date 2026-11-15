import { createHmac, randomInt } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { OTP_RESEND_MS, OTP_TTL_MS, normalizeMobile, otpCode, renderTemplate, validOtpFormat } from '@/modules/sms/domain/sms'
import { otpGroup } from '@/modules/sms/domain/templates'
import { latinDigits } from '@/shared/text/digits'
import { claimOtpChallenge } from '@/modules/identity/server/otp-challenge'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { serializable } from './transaction'
import { getSmsConfig, isReady } from './settings'
import { sendSmsResult } from './delivery'
import { brandVars } from './variables'
import { SmsError } from './error'

const hashCode = (phone: string, code: string) => createHmac('sha256', authSecret()).update(`otp:${phone}:${code}`).digest('hex')

/** Sends a login or verification code. Throws SmsError with a user-facing message. */
export type OtpPurpose = 'LOGIN' | 'VERIFY' | 'RESET' | `COUNTER:${number}:${number}` | `REPAIR:${number}`

export async function requestOtp(input: { phone: unknown; purpose: OtpPurpose; ip: string; userId?: number; context?: { service?: string } }) {
  const phone = normalizeMobile(input.phone)
  if (!phone) throw new SmsError('شمارهٔ موبایل معتبر نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷)')
  const config = await getSmsConfig()
  if (input.purpose === 'LOGIN' && !config.otpLogin) throw new SmsError('ورود با پیامک فعال نیست', 403)
  if (!isReady(config)) throw new SmsError('ارسال پیامک انجام نشد؛ تنظیمات پیامک آماده نیست', 502)
  if (!(await rateLimitStrict(`sms:otp:send:phone:${phone}:${input.purpose}`, 1, OTP_RESEND_MS)).ok ||
      !(await rateLimitStrict(`sms:otp:send:ip:${input.ip}`, 15, 60 * 60_000)).ok) throw new SmsError('درخواست زیادی ثبت شده است؛ کمی بعد دوباره تلاش کنید', 429)
  const now = Date.now()
  const code = otpCode((max) => randomInt(max))
  const row = await serializable(async tx => {
    const [last, recentPhone, recentIp] = await Promise.all([
      tx.otpCode.findFirst({ where: { phone, purpose: input.purpose }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      tx.otpCode.count({ where: { phone, createdAt: { gt: new Date(now - 3_600_000) } } }),
      input.ip ? tx.otpCode.count({ where: { ip: input.ip.slice(0, 64), createdAt: { gt: new Date(now - 3_600_000) } } }) : Promise.resolve(0),
    ])
    if (last && now - last.createdAt.getTime() < OTP_RESEND_MS) throw new SmsError('برای ارسال دوباره کمی صبر کنید', 429)
    if (recentPhone >= 5 || recentIp >= 15) throw new SmsError('تعداد درخواست کد زیاد است؛ یک ساعت دیگر تلاش کنید', 429)
    if (input.purpose === 'VERIFY' && input.userId) {
      const taken = await tx.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null }, id: { not: input.userId } }, select: { id: true } })
      if (taken) throw new SmsError('این شماره به حساب دیگری متصل است', 409)
    }
    await tx.otpCode.updateMany({ where: { phone, purpose: input.purpose, consumedAt: null, ...(input.userId ? { userId: input.userId } : {}) }, data: { consumedAt: new Date() } })
    return tx.otpCode.create({ data: { phone, purpose: input.purpose, codeHash: hashCode(phone, code), userId: input.userId ?? null, expiresAt: new Date(now + OTP_TTL_MS), ip: input.ip.slice(0, 64) } })
  })
  const { brand } = await brandVars()
  const template = config.otpTemplates?.[otpGroup(input.purpose)] || { text: config.otpText, pattern: config.otpPattern, param: config.otpParam }
  const service = String(input.context?.service ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 80)
  const delivery = await sendSmsResult({
    deliveryKey: `otp:${row.id}`, phone, event: `OTP_${input.purpose}`, kind: 'OTP', userId: input.userId,
    text: renderTemplate(template.text, { code, brand, service }),
    pattern: template.pattern || undefined, params: { [template.param || 'code']: code },
  }, config)
  if (delivery.status === 'UNKNOWN' || delivery.status === 'SENDING') return { phone, expiresIn: OTP_TTL_MS / 1000, resendIn: OTP_RESEND_MS / 1000, delivery: 'UNKNOWN' as const, notice: 'وضعیت ارسال نامشخص است؛ پیش از درخواست دوباره پیامک خود را بررسی کنید.' }
  if (!delivery.sent) {
    await db.otpCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } })
    throw new SmsError('ارسال پیامک انجام نشد؛ کمی بعد دوباره تلاش کنید', 502)
  }
  return { phone, expiresIn: OTP_TTL_MS / 1000, resendIn: OTP_RESEND_MS / 1000 }
}

/**
 * Checks a code once; five wrong tries burn it. Returns the normalized phone.
 * `consume: false` checks without using the code up (sign-in asks for the 2-step code first).
 */
export async function verifyOtp(input: { phone: unknown; code: unknown; purpose: OtpPurpose; userId?: number; consume?: boolean }, client: Pick<typeof db, 'otpCode'> = db) {
  const phone = normalizeMobile(input.phone)
  const code = latinDigits(input.code).trim()
  if (!phone || !validOtpFormat(code)) throw new SmsError('کد وارد شده صحیح نیست')
  const row = await client.otpCode.findFirst({
    where: { phone, purpose: input.purpose, ...(input.userId ? { userId: input.userId } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  if (!await claimOtpChallenge(row, hashCode(phone, code), input.consume !== false, client)) throw new SmsError('کد وارد شده صحیح نیست یا منقضی شده است')
  return phone
}

/** The account for a verified phone: the one already verified with it, or a new customer account. */
export async function userForPhone(phone: string) {
  return (await import('@/modules/identity/server/phone-customer')).claimPhoneLogin(phone)
}


/** Links a verified phone to a signed-in account (profile). */
export async function attachPhone(userId: number, phone: string) {
  const taken = await db.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null }, id: { not: userId } }, select: { id: true } })
  if (taken) throw new SmsError('این شماره به حساب دیگری متصل است', 409)
  await db.user.update({ where: { id: userId }, data: { phone, phoneVerifiedAt: new Date() } })
  return phone
}
