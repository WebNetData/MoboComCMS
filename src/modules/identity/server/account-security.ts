import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import QRCode from 'qrcode'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { logEvent } from '@/platform/observability/logger'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonSetting, writeJsonSetting, updateJsonSetting, getSettings } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { base32Encode, totpUri } from '@/shared/security/totp'
import { matchTotp } from '@/shared/security/totp-verify'
import {
  BACKUP_CODE_COUNT, RESET_TTL_MS, formatBackupCode, looksLikeBackupCode, maskEmail, normalizeBackupCode, normalizeSecurityPolicy,
  normalizeTotpInput, passwordProblem, type SecurityPolicy,
} from '@/modules/identity/domain/account-security'
import { actionEmail, deliverableEmail } from '@/modules/mail/domain/mail'
import { getSmtp, sendMail } from '@/modules/mail/server/mailer'
import { clearAdminPolicyCache } from '@/modules/identity/server/access'
import { SmsError, requestOtp, smsAvailable, verifyOtp } from '@/modules/sms/server/sms'
import { normalizeMobile } from '@/modules/sms/domain/sms'

export class SecurityError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

// ------------------------------------------------------------------ policy

const POLICY_KEY = 'security.policy.v1'

export async function getSecurityPolicy(): Promise<SecurityPolicy> {
  const row = await db.setting.findUnique({ where: { key: POLICY_KEY } })
  if (!row) return normalizeSecurityPolicy(undefined)
  try {
    const value = JSON.parse(row.value)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid policy')
    return normalizeSecurityPolicy(value)
  } catch { throw new SecurityError('تنظیمات امنیت ورود معتبر نیست؛ با پشتیبانی تماس بگیرید', 503) }
}

export async function saveSecurityPolicy(input: unknown) {
  const policy = await updateJsonSetting(POLICY_KEY, async value => {
    const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
    for (const key of Object.keys(normalizeSecurityPolicy(value))) if (typeof raw[key] === 'boolean') value[key] = raw[key]
    return normalizeSecurityPolicy(value)
  })
  clearAdminPolicyCache()
  return policy
}

/** Which reset methods the forgot-password page offers: switched on and actually deliverable. */
export async function resetMethods() {
  const [policy, smtp, sms] = await Promise.all([getSecurityPolicy(), getSmtp().catch(() => null), smsAvailable().catch(() => false)])
  return { email: policy.emailReset && !!smtp?.enabled, sms: policy.smsReset && sms }
}

async function siteVars() {
  const settings = await getSettings().catch(() => ({} as Record<string, string>))
  return { brand: settings.brandName || 'موبوکام', site: (settings.siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '') }
}

// ------------------------------------------------------------------ 2-step sign-in (TOTP)

const pendingKey = (userId: number) => `identity.totp-pending.${userId}`
const backupHash = (userId: number, code: string) => crypto.createHmac('sha256', authSecret()).update(`backup:${userId}:${normalizeBackupCode(code)}`).digest('hex')

function readSecret(stored: string) {
  if (!stored) return ''
  try { return decryptPanelCredential(stored) } catch { return '' }
}

function newBackupCodes(userId: number) {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => formatBackupCode(crypto.randomBytes(8).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(10, '7').slice(0, 10)))
  return { codes, stored: JSON.stringify(codes.map((code) => backupHash(userId, code))) }
}

const parseBackup = (value: string): string[] => { try { const list = JSON.parse(value); return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [] } catch { return [] } }

export async function twoFactorStatus(userId: number) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true, totpBackup: true, role: true } })
  if (!user) throw new SecurityError('حساب پیدا نشد', 404)
  const policy = await getSecurityPolicy()
  return { enabled: !!user.totpEnabledAt, enabledAt: user.totpEnabledAt, backupLeft: user.totpEnabledAt ? parseBackup(user.totpBackup).length : 0, required: user.role === 'ADMIN' && policy.requireAdmin2fa }
}

/** Starts setup: a fresh secret (kept encrypted until confirmed) and its QR code. */
export async function beginTwoFactor(userId: number) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, phone: true, totpEnabledAt: true } })
  if (!user) throw new SecurityError('حساب پیدا نشد', 404)
  if (user.totpEnabledAt) throw new SecurityError('ورود دو مرحله‌ای از قبل فعال است', 409)
  const secret = base32Encode(new Uint8Array(crypto.randomBytes(20)))
  const value = encryptPanelCredential(JSON.stringify({ secret, at: Date.now() }))
  await db.setting.upsert({ where: { key: pendingKey(userId) }, update: { value }, create: { key: pendingKey(userId), value } })
  const { brand } = await siteVars()
  const account = deliverableEmail(user.email) ? user.email : (user.phone || `user${userId}`)
  const uri = totpUri(secret, account, brand)
  return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) }
}

/** Confirms setup with the first code from the app; returns the one-time view of the backup codes. */
export async function confirmTwoFactor(userId: number, code: unknown) {
  const row = await db.setting.findUnique({ where: { key: pendingKey(userId) } })
  let pending: { secret?: string; at?: number } = {}
  try { pending = row ? JSON.parse(decryptPanelCredential(row.value)) : {} } catch { pending = {} }
  if (!pending.secret || Date.now() - Number(pending.at || 0) > 30 * 60_000) throw new SecurityError('زمان راه‌اندازی تمام شد؛ دوباره شروع کنید', 410)
  if (!(await rateLimitStrict(`2fa:setup:${userId}`, 10, 10 * 60_000)).ok) throw new SecurityError('تعداد تلاش زیاد است؛ چند دقیقه بعد', 429)
  const step = matchTotp(pending.secret, normalizeTotpInput(code))
  if (step === null) throw new SecurityError('کد وارد شده درست نیست؛ ساعت گوشی را هم بررسی کنید')
  const backup = newBackupCodes(userId)
  await db.user.update({ where: { id: userId }, data: { totpSecret: encryptPanelCredential(pending.secret), totpEnabledAt: new Date(), totpBackup: backup.stored, totpLastStep: step } })
  await db.setting.delete({ where: { key: pendingKey(userId) } }).catch(() => null)
  logEvent('info', 'identity.2fa_enabled', { userId })
  return { codes: backup.codes }
}

/**
 * Checks a second-factor code: an authenticator code (each 30-second code is
 * accepted once) or an unused backup code (burned on use).
 */
export async function checkSecondFactor(userId: number, input: unknown): Promise<boolean> {
  if (!(await rateLimitStrict(`2fa:check:${userId}`, 10, 10 * 60_000)).ok) return false
  const user = await db.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpEnabledAt: true, totpBackup: true, totpLastStep: true } })
  if (!user?.totpEnabledAt) return true
  const code = normalizeTotpInput(input)
  if (/^\d{6}$/.test(code)) {
    const secret = readSecret(user.totpSecret)
    const step = secret ? matchTotp(secret, code) : null
    if (step === null || step <= user.totpLastStep) return false
    // Compare-and-set so the same code cannot sign in twice, even concurrently.
    const claimed = await db.user.updateMany({ where: { id: userId, totpLastStep: user.totpLastStep }, data: { totpLastStep: step } })
    return claimed.count === 1
  }
  if (!looksLikeBackupCode(code)) return false
  const hash = backupHash(userId, code)
  const list = parseBackup(user.totpBackup)
  if (!list.includes(hash)) return false
  const burned = await db.user.updateMany({ where: { id: userId, totpBackup: user.totpBackup }, data: { totpBackup: JSON.stringify(list.filter((item) => item !== hash)) } })
  if (burned.count === 1) logEvent('info', 'identity.2fa_backup_used', { userId, left: list.length - 1 })
  return burned.count === 1
}

export async function hasSecondFactor(userId: number) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true } })
  return !!user?.totpEnabledAt
}

async function requireFactor(userId: number, code: unknown) {
  if (!await checkSecondFactor(userId, code)) throw new SecurityError('کد ورود دو مرحله‌ای یا کد پشتیبان درست نیست', 403)
}

export async function disableTwoFactor(userId: number, code: unknown) {
  const policy = await getSecurityPolicy()
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, totpEnabledAt: true } })
  if (!user?.totpEnabledAt) throw new SecurityError('ورود دو مرحله‌ای فعال نیست', 409)
  if (user.role === 'ADMIN' && policy.requireAdmin2fa) throw new SecurityError('برای حساب‌های مدیریتی، ورود دو مرحله‌ای الزامی است', 403)
  await requireFactor(userId, code)
  await db.user.update({ where: { id: userId }, data: { totpSecret: '', totpEnabledAt: null, totpBackup: '[]', totpLastStep: 0 } })
  logEvent('info', 'identity.2fa_disabled', { userId })
}

export async function regenerateBackupCodes(userId: number, code: unknown) {
  if (!await hasSecondFactor(userId)) throw new SecurityError('ورود دو مرحله‌ای فعال نیست', 409)
  await requireFactor(userId, code)
  const backup = newBackupCodes(userId)
  await db.user.update({ where: { id: userId }, data: { totpBackup: backup.stored } })
  return { codes: backup.codes }
}

/** Support action: an admin turns 2-step sign-in off for a member who lost their phone and codes. */
export async function resetTwoFactorByAdmin(userId: number) {
  await db.user.update({ where: { id: userId }, data: { totpSecret: '', totpEnabledAt: null, totpBackup: '[]', totpLastStep: 0 } })
}

// ------------------------------------------------------------------ password reset

const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex')
const GENERIC_EMAIL = 'اگر حسابی با این ایمیل وجود داشته باشد، پیوند بازیابی تا چند دقیقهٔ دیگر به آن ارسال می‌شود.'

/** Emails a one-time link. The answer is the same whether or not the account exists. */
export async function requestEmailReset(input: { email: unknown; ip: string }) {
  const policy = await getSecurityPolicy()
  if (!policy.emailReset) throw new SecurityError('بازیابی رمز با ایمیل غیرفعال است', 403)
  const email = String(input.email ?? '').trim().toLowerCase().slice(0, 320)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SecurityError('نشانی ایمیل معتبر نیست')
  if (!(await rateLimitStrict(`reset:ip:${input.ip}`, 10, 60 * 60_000)).ok || !(await rateLimitStrict(`reset:mail:${email}`, 3, 60 * 60_000)).ok) {
    throw new SecurityError('درخواست زیادی ثبت شده است؛ کمی بعد دوباره تلاش کنید', 429)
  }
  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, status: true, email: true } })
  if (!user || user.status !== 'ACTIVE' || !deliverableEmail(user.email)) return { message: GENERIC_EMAIL }

  const recent = await db.passwordReset.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 60_000) } } })
  if (recent >= 5) return { message: GENERIC_EMAIL }
  const token = crypto.randomBytes(32).toString('base64url')
  await db.passwordReset.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + RESET_TTL_MS), ip: input.ip.slice(0, 64) } })
  const { brand, site } = await siteVars()
  const mail = actionEmail({
    brand, site, name: user.name || 'کاربر', title: 'بازیابی رمز عبور',
    body: 'درخواست تغییر رمز عبور حساب شما ثبت شد. برای انتخاب رمز تازه روی دکمهٔ زیر بزنید. این پیوند ۳۰ دقیقه اعتبار دارد و فقط یک بار کار می‌کند.',
    href: `/reset-password?token=${token}`, button: 'انتخاب رمز تازه',
    note: 'اگر این درخواست را شما نفرستاده‌اید، این ایمیل را نادیده بگیرید؛ رمز فعلی شما تغییری نمی‌کند.',
  })
  const sent = await sendMail({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html, source: 'password-reset' })
  if (!sent.ok) logEvent('warn', 'identity.reset_mail_failed', { userId: user.id, error: sent.error })
  return { message: GENERIC_EMAIL }
}

/** Texts a reset code to a verified mobile. Unknown numbers get the same answer, without an SMS. */
export async function requestSmsReset(input: { phone: unknown; ip: string }) {
  const policy = await getSecurityPolicy()
  if (!policy.smsReset) throw new SecurityError('بازیابی رمز با پیامک غیرفعال است', 403)
  const phone = normalizeMobile(input.phone)
  if (!phone) throw new SecurityError('شمارهٔ موبایل معتبر نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷)')
  const user = await db.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null }, status: 'ACTIVE' }, orderBy: { id: 'asc' }, select: { id: true } })
  const generic = { message: 'اگر این شماره به حسابی متصل باشد، کد بازیابی برای آن پیامک می‌شود.', expiresIn: 120, resendIn: 60 }
  if (!user) {
    if (!(await rateLimitStrict(`reset:ip:${input.ip}`, 10, 60 * 60_000)).ok) throw new SecurityError('درخواست زیادی ثبت شده است؛ کمی بعد دوباره تلاش کنید', 429)
    return generic
  }
  try {
    const sent = await requestOtp({ phone, purpose: 'RESET', ip: input.ip, userId: user.id })
    return { ...generic, expiresIn: sent.expiresIn, resendIn: sent.resendIn }
  } catch (error) {
    if (error instanceof SmsError) throw new SecurityError(error.message, error.status)
    throw error
  }
}

async function setNewPassword(userId: number, password: string, via: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, status: true } })
  if (!user || user.status !== 'ACTIVE') throw new SecurityError('این حساب فعال نیست', 403)
  const problem = passwordProblem(password, { email: user.email })
  if (problem) throw new SecurityError(problem)
  // passwordChangedAt signs out every existing session of the account.
  await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 10), passwordChangedAt: new Date() } })
  await db.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } })
  logEvent('info', 'identity.password_reset', { userId, via })
  const { brand, site } = await siteVars()
  if (deliverableEmail(user.email)) {
    const mail = actionEmail({
      brand, site, name: user.name || 'کاربر', title: 'رمز عبور حساب شما تغییر کرد',
      body: 'رمز عبور حساب شما همین حالا تغییر کرد و همهٔ نشست‌های باز خارج شدند.', href: '/forgot-password', button: 'این کار من نبود',
      note: 'اگر خودتان رمز را عوض کرده‌اید، نیازی به کاری نیست.',
    })
    void sendMail({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html, source: 'password-changed' }).catch(() => null)
  }
  return { email: deliverableEmail(user.email) ? maskEmail(user.email) : '' }
}

/** Whether a reset link is still usable (the page checks before asking for a new password). */
export async function inspectResetToken(token: unknown) {
  const value = String(token ?? '')
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(value)) return { valid: false as const }
  const row = await db.passwordReset.findUnique({ where: { tokenHash: tokenHash(value) } })
  if (!row || row.usedAt || row.expiresAt < new Date()) return { valid: false as const }
  const twoFactor = await hasSecondFactor(row.userId)
  return { valid: true as const, twoFactor }
}

/** Completes an emailed reset. 2-step accounts also need their code, so a stolen mailbox alone is not enough. */
export async function resetWithToken(input: { token: unknown; password: unknown; code?: unknown; ip: string }) {
  if (!(await rateLimitStrict(`reset:use:${input.ip}`, 20, 60 * 60_000)).ok) throw new SecurityError('تلاش زیادی انجام شد؛ کمی بعد', 429)
  const token = String(input.token ?? '')
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) throw new SecurityError('پیوند بازیابی معتبر نیست', 400)
  const row = await db.passwordReset.findUnique({ where: { tokenHash: tokenHash(token) } })
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new SecurityError('پیوند بازیابی منقضی یا استفاده شده است؛ دوباره درخواست دهید', 410)
  if (await hasSecondFactor(row.userId)) await requireFactor(row.userId, input.code)
  const password = String(input.password ?? '')
  const problem = passwordProblem(password)
  if (problem) throw new SecurityError(problem)
  // Single use, even when the form is submitted twice.
  const claimed = await db.passwordReset.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } })
  if (claimed.count !== 1) throw new SecurityError('این پیوند قبلاً استفاده شده است', 410)
  return setNewPassword(row.userId, password, 'email')
}

/** Completes an SMS reset: the code, then the new password, in one step. */
export async function resetWithSms(input: { phone: unknown; code: unknown; password: unknown; totp?: unknown }) {
  const phone = normalizeMobile(input.phone)
  if (!phone) throw new SecurityError('شمارهٔ موبایل معتبر نیست')
  const user = await db.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null }, status: 'ACTIVE' }, orderBy: { id: 'asc' }, select: { id: true, email: true } })
  if (!user) throw new SecurityError('کد وارد شده صحیح نیست')
  const password = String(input.password ?? '')
  const problem = passwordProblem(password, { email: user.email })
  if (problem) throw new SecurityError(problem)
  try {
    await verifyOtp({ phone, code: input.code, purpose: 'RESET', userId: user.id, consume: false })
  } catch (error) {
    if (error instanceof SmsError) throw new SecurityError(error.message, error.status)
    throw error
  }
  if (await hasSecondFactor(user.id)) {
    if (!input.totp) throw new SecurityError('TOTP_REQUIRED', 428)
    await requireFactor(user.id, input.totp)
  }
  await verifyOtp({ phone, code: input.code, purpose: 'RESET', userId: user.id }).catch((error) => { throw new SecurityError(error instanceof Error ? error.message : 'کد نامعتبر است') })
  return setNewPassword(user.id, password, 'sms')
}
