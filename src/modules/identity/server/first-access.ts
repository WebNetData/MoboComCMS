import bcrypt from 'bcryptjs'
import { db } from '@/platform/database/prisma'
import { resolveCurrentUser } from '@/modules/identity/server/access'
import { passwordProblem } from '@/modules/identity/domain/account-security'
import { CompletionError, DEFAULT_FIELDS_CONFIG, type FieldsConfig } from '@/modules/identity/domain/profile-fields'
import { isPhonePlaceholderEmail } from '@/modules/sms/domain/sms'
import { logEvent } from '@/platform/observability/logger'

export const realProfileEmail = (email: string) => !!email && !isPhonePlaceholderEmail(email) && !/@(bot\.mobocom\.local|telegram\.local)$/.test(email)

/** The first mobile step has a small fixed floor; the owner's other fields follow afterward. */
export function firstAccessFields(config: FieldsConfig): FieldsConfig {
  return { ...config, enforce: true, fields: ['firstName', 'lastName', 'email'].map(key => ({
    ...(config.fields.find(field => field.builtin === key) || DEFAULT_FIELDS_CONFIG.fields.find(field => field.builtin === key)!),
    enabled: true, required: key !== 'email',
  })) }
}

const cleanName = (value: unknown) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

/** Only an unused verified-mobile setup claim may set an initial password without an old password. */
export async function completeFirstAccess(userId: number, input: Record<string, unknown>) {
  const before = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, phone: true, phoneVerifiedAt: true, profileData: true, passwordSetupRequired: true } })
  if (!before?.passwordSetupRequired) throw new CompletionError('ساخت رمز قبلاً انجام شده است؛ دوباره وارد شوید', {}, 409)
  const firstName = cleanName(input.firstName), lastName = cleanName(input.lastName)
  const email = realProfileEmail(before.email) ? before.email : String(input.email ?? '').trim().toLowerCase()
  const password = typeof input.password === 'string' ? input.password : ''
  const errors: Record<string, string> = {}
  if (firstName.length < 2) errors.firstName = 'نام را با دست‌کم دو حرف وارد کنید'
  if (lastName.length < 2) errors.lastName = 'نام خانوادگی را با دست‌کم دو حرف وارد کنید'
  if (email && (!/^[^\s@]{1,64}@[^\s@]+\.[a-z]{2,}$/i.test(email) || email.length > 190 || !realProfileEmail(email))) errors.email = 'ایمیل معتبر نیست'
  const problem = passwordProblem(password, { email: email || before.email })
  if (problem) errors.password = problem
  if (password !== input.confirmPassword) errors.confirmPassword = 'تکرار رمز عبور یکسان نیست'
  if (Object.keys(errors).length) throw new CompletionError('چند مورد نیاز به اصلاح دارد', errors)
  let stored: Record<string, unknown> = {}
  try { const raw = JSON.parse(before.profileData); if (raw && typeof raw === 'object' && !Array.isArray(raw)) stored = raw } catch { /* retain supported profile fields */ }
  const passwordHash = await bcrypt.hash(password, 10), now = new Date()
  try {
    await db.$transaction(async tx => {
      const current = await resolveCurrentUser(userId, undefined, tx)
      if (!current || current.role !== 'CUSTOMER' || !before.phoneVerifiedAt) throw new CompletionError('برای تکمیل حساب دوباره با کد موبایل وارد شوید', {}, 403)
      const claimed = await tx.user.updateMany({ where: { id: userId, role: 'CUSTOMER', status: 'ACTIVE', passwordSetupRequired: true, phone: before.phone, phoneVerifiedAt: before.phoneVerifiedAt, email: before.email, profileData: before.profileData }, data: {
        name: `${firstName} ${lastName}`, ...(email ? { email } : {}), profileData: JSON.stringify({ ...stored, firstName, lastName }),
        passwordHash, passwordSetupRequired: false, passwordChangedAt: now, profileCompletedAt: now,
      } })
      if (claimed.count !== 1) throw new CompletionError('مشخصات حساب هم‌زمان تغییر کرده است؛ دوباره وارد شوید', {}, 409)
      await tx.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } })
    })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw new CompletionError('این ایمیل برای حساب دیگری ثبت شده است', { email: 'ایمیل دیگری وارد کنید یا این فیلد را خالی بگذارید' })
    throw error
  }
  logEvent('info', 'identity.first_access_completed', { userId })
}
