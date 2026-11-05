import { createHmac, randomBytes, randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { logEvent } from '@/platform/observability/logger'
import { getSettings } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import {
  DEFAULT_SMS, OTP_RESEND_MS, OTP_TTL_MS, maskMobile, normalizeMobile, normalizeSmsConfig, otpCode, phoneEmail,
  renderTemplate, smsEvent, validOtpFormat, type SmsConfig,
} from '@/modules/sms/domain/sms'
import { latinDigits } from '@/shared/text/digits'
import { credit, sendPattern, sendText } from '@/modules/sms/server/ippanel'
import { claimOtpChallenge } from '@/modules/identity/server/otp-challenge'
import { rateLimitStrict } from '@/platform/http/rate-limit'

const KEY = 'sms.config.v1'

export class SmsError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

// ------------------------------------------------------------------ settings

export async function getSmsConfig(): Promise<SmsConfig> {
  const row = await db.setting.findUnique({ where: { key: KEY } }).catch(() => {
    throw new SmsError('دریافت تنظیمات پیامک ممکن نشد؛ تنظیمات قبلی حفظ شده است', 503)
  })
  if (!row) return structuredClone(DEFAULT_SMS)
  try {
    const stored = JSON.parse(row.value)
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('invalid SMS settings')
    // The encrypted envelope is longer than the form's plaintext limit. Never trim or sanitize persisted ciphertext.
    const apiKey = typeof stored.apiKey === 'string' ? stored.apiKey : ''
    return normalizeSmsConfig({ ...stored, apiKey: '' }, { ...DEFAULT_SMS, apiKey })
  } catch {
    throw new SmsError('خواندن تنظیمات پیامک ممکن نشد؛ تنظیمات قبلی حفظ شده است', 503)
  }
}

export async function saveSmsConfig(input: Record<string, unknown>): Promise<SmsConfig> {
  const previous = await getSmsConfig()
  const next = normalizeSmsConfig(input, previous)
  if (String(input.fromNumber ?? '').trim() && !next.fromNumber) {
    throw new SmsError('شمارهٔ خط ارسال معتبر نیست؛ شماره را با ارقام، مانند 3000505 یا +983000505 وارد کنید')
  }
  if (next.enabled && !next.fromNumber) throw new SmsError('برای فعال‌کردن پیامک، شمارهٔ خط ارسال را وارد کنید')
  if (next.enabled && !next.apiKey) throw new SmsError('برای فعال‌کردن پیامک، کلید API را وارد کنید')
  // A new key is encrypted at rest (AES-256-GCM with PANEL_CREDENTIAL_KEY).
  const stored = { ...next, apiKey: next.apiKey === previous.apiKey ? next.apiKey : encryptPanelCredential(next.apiKey) }
  const value = JSON.stringify(stored)
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } })
  return stored
}

function apiKeyOf(config: SmsConfig) {
  try { return decryptPanelCredential(config.apiKey) } catch { return '' }
}

export function publicSmsConfig(config: SmsConfig) {
  const key = apiKeyOf(config)
  return { ...config, apiKey: key ? `••••${key.slice(-4)}` : '', hasKey: !!key, ready: isReady(config) }
}

const isReady = (config: SmsConfig) => config.enabled && !!apiKeyOf(config) && !!config.fromNumber

/** Whether SMS codes can be delivered (in development they go to the server log). */
export async function smsAvailable() {
  return isReady(await getSmsConfig()) || process.env.NODE_ENV !== 'production'
}

/** Phone login is offered only when SMS is fully configured (or in development, where codes go to the server log). */
export async function otpLoginAvailable() {
  const config = await getSmsConfig()
  return config.otpLogin && (isReady(config) || process.env.NODE_ENV !== 'production')
}

// ------------------------------------------------------------------ sending

/** The most automatic alerts one number receives in a day. */
export const SMS_DAILY_PER_PHONE = 12

interface SendInput { phone: string; event: string; text: string; pattern?: string; params?: Record<string, string>; userId?: number | null; kind?: 'TEXT' | 'PATTERN' | 'OTP' }

/** Sends one SMS and records it in SmsLog. Never throws; returns whether it was accepted. */
export async function sendSms(input: SendInput, config?: SmsConfig): Promise<boolean> {
  const settings = config || await getSmsConfig()
  const phone = normalizeMobile(input.phone)
  const kind = input.kind || (input.pattern ? 'PATTERN' : 'TEXT')
  const log = (status: string, providerId = '', error = '') => db.smsLog.create({
    data: { phone: phone || String(input.phone).slice(0, 20), event: input.event, kind, body: kind === 'OTP' ? '(کد یک‌بارمصرف)' : input.text.slice(0, 1000), status, providerId, error, userId: input.userId ?? null },
  }).catch(() => null)
  if (!phone) { await log('SKIPPED', '', 'شمارهٔ موبایل نامعتبر'); return false }
  if (!isReady(settings)) {
    if (kind === 'OTP' && process.env.NODE_ENV !== 'production') logEvent('warn', 'sms.dev_otp', { phone: maskMobile(phone), text: input.text })
    await log('SKIPPED', '', 'پنل پیامک فعال یا تنظیم نشده است')
    return kind === 'OTP' && process.env.NODE_ENV !== 'production'
  }
  // Automatic alerts have a ceiling: the same message is not sent twice in ten minutes, and one number gets at
  // most SMS_DAILY_PER_PHONE of them a day — a loop or a noisy event never drains the panel's credit. Codes
  // (limited where they are requested), tests and messages typed by an admin are not counted here.
  if (kind !== 'OTP' && !['MANUAL', 'TEST'].includes(input.event)) {
    const since = (ms: number) => new Date(Date.now() - ms)
    const [same, today] = await Promise.all([
      db.smsLog.count({ where: { phone, event: input.event, status: 'SENT', body: input.text.slice(0, 1000), createdAt: { gt: since(10 * 60_000) } } }),
      db.smsLog.count({ where: { phone, status: 'SENT', kind: { not: 'OTP' }, createdAt: { gt: since(86_400_000) } } }),
    ]).catch(() => [0, 0])
    if (same > 0) { await log('SKIPPED', '', 'همین پیام چند دقیقه پیش فرستاده شده است'); return false }
    if (today >= SMS_DAILY_PER_PHONE) { await log('SKIPPED', '', 'سقف روزانهٔ پیامک این شماره پر شده است'); return false }
  }
  const key = apiKeyOf(settings)
  const result = input.pattern
    ? await sendPattern(key, settings.fromNumber, phone, input.pattern, input.params || {})
    : await sendText(key, settings.fromNumber, [phone], input.text)
  await log(result.ok ? 'SENT' : 'FAILED', result.id, result.error)
  if (!result.ok) logEvent('warn', 'sms.failed', { event: input.event, phone: maskMobile(phone), error: result.error })
  return result.ok
}

async function brandVars() {
  const settings = await getSettings().catch(() => ({} as Record<string, string>))
  return { brand: settings.brandName || 'موبوکام', site: (settings.siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '') }
}

/** Customer alert for an inbox event, delivered by its queued channel job. */
export async function notifyUserEvent(event: { userId: number; kind: string; titleFa: string; bodyFa?: string; href: string }): Promise<boolean | null> {
  const def = smsEvent(event.kind)
  if (!def || def.audience !== 'user') return null
  const config = await getSmsConfig()
  const setting = config.events[event.kind]
  if (!setting?.enabled || !isReady(config)) return null
  const user = await db.user.findUnique({ where: { id: event.userId }, select: { name: true, phone: true, phoneVerifiedAt: true, smsAlerts: true, status: true } })
  // Only verified numbers receive alerts, so a mistyped number never gets someone else's messages.
  if (!user || user.status !== 'ACTIVE' || !user.smsAlerts || !user.phoneVerifiedAt || !normalizeMobile(user.phone)) return null
  if (!await (await import('@/modules/notifications/server/preferences')).isNotificationChannelEnabled(event.userId, event.kind, 'sms')) return null
  const { brand, site } = await brandVars()
  const vars = { name: user.name || 'کاربر', title: event.titleFa, body: event.bodyFa || event.titleFa, link: site ? `${site}${event.href}` : event.href, brand }
  return sendSms({ phone: user.phone, event: event.kind, userId: event.userId, text: renderTemplate(setting.text, vars), pattern: setting.pattern || undefined, params: Object.fromEntries(def.vars.map((name) => [name, vars[name as keyof typeof vars] || ''])) }, config)
}

/** Staff alert to every admin mobile in the SMS settings. */
export async function notifyAdmins(eventId: string, values: Record<string, string>) {
  const def = smsEvent(eventId)
  const config = await getSmsConfig()
  const setting = config.events[eventId]
  if (!def || def.audience !== 'admin' || !setting?.enabled || !isReady(config) || !config.adminPhones.length) return
  const { brand } = await brandVars()
  const vars: Record<string, string> = { ...values, brand }
  for (const phone of config.adminPhones) {
    await sendSms({ phone, event: eventId, text: renderTemplate(setting.text, vars), pattern: setting.pattern || undefined, params: Object.fromEntries(def.vars.map((name) => [name, vars[name] || ''])) }, config)
  }
}

/** Manual message from the admin panel: one number or a group of opted-in, verified users. */
export async function broadcast(input: { to: 'phone' | 'verified' | 'vip'; phone?: string; text: string }) {
  const config = await getSmsConfig()
  if (!config.enabled) throw new SmsError('ارسال پیامک غیرفعال است؛ تیک فعال‌بودن را بزنید و تنظیمات را ذخیره کنید')
  if (!apiKeyOf(config)) throw new SmsError('کلید API پیامک وارد نشده یا قابل خواندن نیست؛ کلید را دوباره ذخیره کنید')
  if (!config.fromNumber) throw new SmsError('شمارهٔ خط ارسال پیامک وارد نشده است؛ شماره را در تنظیمات ذخیره کنید')
  const text = String(input.text || '').trim().slice(0, 700)
  if (text.length < 2) throw new SmsError('متن پیامک خالی است')
  if (input.to === 'phone') {
    if (!normalizeMobile(input.phone)) throw new SmsError('شمارهٔ موبایل معتبر نیست')
    return { sent: await sendSms({ phone: String(input.phone), event: 'MANUAL', text }, config) ? 1 : 0, total: 1 }
  }
  const now = new Date()
  const vipIds = input.to === 'vip'
    ? (await db.userMembership.findMany({ where: { revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } }, select: { userId: true }, distinct: ['userId'] })).map((row) => row.userId)
    : null
  const users = await db.user.findMany({
    where: { status: 'ACTIVE', smsAlerts: true, phoneVerifiedAt: { not: null }, ...(vipIds ? { id: { in: vipIds } } : {}) },
    select: { phone: true }, take: 5000,
  })
  const phones = [...new Set(users.map((user) => normalizeMobile(user.phone)).filter(Boolean))]
  const key = apiKeyOf(config)
  let sent = 0
  for (let index = 0; index < phones.length; index += 100) {
    const chunk = phones.slice(index, index + 100)
    const result = await sendText(key, config.fromNumber, chunk, text)
    await db.smsLog.create({ data: { phone: `${chunk.length} گیرنده`, event: `BROADCAST_${input.to.toUpperCase()}`, kind: 'TEXT', body: text, status: result.ok ? 'SENT' : 'FAILED', providerId: result.id, error: result.error } })
    if (result.ok) sent += chunk.length
  }
  return { sent, total: phones.length }
}

export async function smsCredit() {
  const config = await getSmsConfig()
  const key = apiKeyOf(config)
  if (!key) throw new SmsError('کلید API پنل پیامک وارد نشده است')
  const result = await credit(key)
  if (!result.ok) throw new SmsError(result.error || 'IPPanel پاسخ نداد', 502)
  return result.credit
}

// ------------------------------------------------------------------ OTP

const hashCode = (phone: string, code: string) => createHmac('sha256', authSecret()).update(`otp:${phone}:${code}`).digest('hex')

/** Sends a login or verification code. Throws SmsError with a user-facing message. */
export type OtpPurpose = 'LOGIN' | 'VERIFY' | 'RESET'

export async function requestOtp(input: { phone: unknown; purpose: OtpPurpose; ip: string; userId?: number }) {
  const phone = normalizeMobile(input.phone)
  if (!phone) throw new SmsError('شمارهٔ موبایل معتبر نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷)')
  const config = await getSmsConfig()
  if (input.purpose === 'LOGIN' && !await otpLoginAvailable()) throw new SmsError('ورود با پیامک فعال نیست', 403)
  if (!(await rateLimitStrict(`sms:otp:send:phone:${phone}:${input.purpose}`, 1, OTP_RESEND_MS)).ok ||
      !(await rateLimitStrict(`sms:otp:send:ip:${input.ip}`, 15, 60 * 60_000)).ok) throw new SmsError('درخواست زیادی ثبت شده است؛ کمی بعد دوباره تلاش کنید', 429)
  const now = Date.now()
  const [last, recentPhone, recentIp] = await Promise.all([
    db.otpCode.findFirst({ where: { phone, purpose: input.purpose }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    db.otpCode.count({ where: { phone, createdAt: { gt: new Date(now - 60 * 60_000) } } }),
    input.ip ? db.otpCode.count({ where: { ip: input.ip, createdAt: { gt: new Date(now - 60 * 60_000) } } }) : Promise.resolve(0),
  ])
  if (last && now - last.createdAt.getTime() < OTP_RESEND_MS) {
    throw new SmsError(`برای ارسال دوباره ${Math.ceil((OTP_RESEND_MS - (now - last.createdAt.getTime())) / 1000).toLocaleString('fa-IR')} ثانیه صبر کنید`, 429)
  }
  if (recentPhone >= 5 || recentIp >= 15) throw new SmsError('تعداد درخواست کد زیاد است؛ یک ساعت دیگر تلاش کنید', 429)
  if (input.purpose === 'VERIFY' && input.userId) {
    const taken = await db.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null }, id: { not: input.userId } }, select: { id: true } })
    if (taken) throw new SmsError('این شماره به حساب دیگری متصل است', 409)
  }

  const code = otpCode((max) => randomInt(max))
  const row = await db.$transaction(async tx => {
    await tx.otpCode.updateMany({ where: { phone, purpose: input.purpose, consumedAt: null, ...(input.userId ? { userId: input.userId } : {}) }, data: { consumedAt: new Date() } })
    return tx.otpCode.create({ data: { phone, purpose: input.purpose, codeHash: hashCode(phone, code), userId: input.userId ?? null, expiresAt: new Date(now + OTP_TTL_MS), ip: input.ip.slice(0, 64) } })
  })
  const { brand } = await brandVars()
  const sent = await sendSms({
    phone, event: `OTP_${input.purpose}`, kind: 'OTP', userId: input.userId,
    text: renderTemplate(config.otpText, { code, brand }),
    pattern: config.otpPattern || undefined, params: { [config.otpParam || 'code']: code },
  }, config)
  if (!sent) {
    await db.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } })
    throw new SmsError('ارسال پیامک انجام نشد؛ کمی بعد دوباره تلاش کنید', 502)
  }
  return { phone, expiresIn: OTP_TTL_MS / 1000, resendIn: OTP_RESEND_MS / 1000 }
}

/**
 * Checks a code once; five wrong tries burn it. Returns the normalized phone.
 * `consume: false` checks without using the code up (sign-in asks for the 2-step code first).
 */
export async function verifyOtp(input: { phone: unknown; code: unknown; purpose: OtpPurpose; userId?: number; consume?: boolean }) {
  const phone = normalizeMobile(input.phone)
  const code = latinDigits(input.code).trim()
  if (!phone || !validOtpFormat(code)) throw new SmsError('کد وارد شده صحیح نیست')
  const row = await db.otpCode.findFirst({
    where: { phone, purpose: input.purpose, ...(input.userId ? { userId: input.userId } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  if (!await claimOtpChallenge(row, hashCode(phone, code), input.consume !== false)) throw new SmsError('کد وارد شده صحیح نیست یا منقضی شده است')
  return phone
}

/** The account for a verified phone: the one already verified with it, or a new customer account. */
export async function userForPhone(phone: string) {
  const existing = await db.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null } }, orderBy: { id: 'asc' }, include: { roleRef: true } })
  if (existing) {
    if (existing.status !== 'ACTIVE') return null
    return db.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() }, include: { roleRef: true } })
  }
  return db.user.create({
    data: {
      email: phoneEmail(phone), phone, phoneVerifiedAt: new Date(), name: '',
      passwordHash: await bcrypt.hash(randomBytes(24).toString('base64url'), 10), lastLoginAt: new Date(),
      passwordSetupRequired: true,
    },
    include: { roleRef: true },
  })
}

/** Links a verified phone to a signed-in account (profile). */
export async function attachPhone(userId: number, phone: string) {
  const taken = await db.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null }, id: { not: userId } }, select: { id: true } })
  if (taken) throw new SmsError('این شماره به حساب دیگری متصل است', 409)
  await db.user.update({ where: { id: userId }, data: { phone, phoneVerifiedAt: new Date() } })
  return phone
}
