import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { deliverableEmail, normalizeEmail } from '@/modules/mail/domain/mail'
import { normalizeMobile, phoneEmail } from '@/modules/sms/domain/sms'
import { LOGIN_METHODS, loginPolicy } from '../domain/login-policy'
import { passwordProblem } from '../domain/account-security'
import { waysIn } from '../domain/sign-in-methods'
import { requirePerm } from './access'
import { accountChangeRefusal } from './staff-guard'
import { emailCanSignIn } from './sign-in-methods'
import { smsAvailable } from '@/modules/sms/server/sms'

export class AdminAccountError extends Error { constructor(message: string, readonly status = 422) { super(message) } }
const fields = { id: true, name: true, email: true, phone: true, phoneVerifiedAt: true, updatedAt: true, loginPolicy: true, telegramId: true, googleId: true, passwordChangedAt: true, passwordSetupRequired: true, sessionsRevokedAt: true, erasedAt: true } as const
type Account = Prisma.UserGetPayload<{ select: typeof fields }>
function view(user: Account, refusal: string | null) {
  return { account: { id: user.id, name: user.name, email: deliverableEmail(user.email) ? user.email : '', phone: user.phone, phoneVerified: !!user.phoneVerifiedAt, loginPolicy: loginPolicy(user.loginPolicy), connected: { telegram: !!user.telegramId, google: !!user.googleId } }, revision: user.updatedAt.toISOString(), canManage: !refusal, refusal }
}
async function context(req: NextRequest, id: number, tx: Prisma.TransactionClient) {
  const actor = await requirePerm(req, 'users.manage', tx)
  if (!actor) throw new AdminAccountError('اجازهٔ مدیریت کاربران ندارید', 403)
  const user = await tx.user.findUnique({ where: { id }, select: fields })
  if (!user || user.erasedAt) throw new AdminAccountError('حساب پیدا نشد', 404)
  return { actor, user, refusal: await accountChangeRefusal(actor, id, { sensitive: true }, tx) }
}
export function adminAccountView(req: NextRequest, id: number) {
  return db.$transaction(async tx => { const { user, refusal } = await context(req, id, tx); return view(user, refusal) })
}
export async function changeAdminAccount(req: NextRequest, id: number, input: Record<string, unknown>) {
  const action = input.action, note = typeof input.note === 'string' ? input.note.trim() : ''
  if (note.length < 3 || note.length > 300 || typeof input.revision !== 'string' || !Number.isFinite(Date.parse(input.revision))) throw new AdminAccountError('دلیل تغییر و نسخهٔ معتبر حساب لازم است')
  const keys = action === 'profile' ? ['name','email','phone','phoneVerified'] : action === 'password' ? ['password','generate'] : action === 'login-policy' ? ['loginPolicy'] : action === 'revoke-sessions' ? [] : null
  if (!keys || Object.keys(input).some(k => !['action','revision','note',...keys].includes(k))) throw new AdminAccountError('عملیات یا فیلد حساب معتبر نیست')
  let generatedPassword: string | undefined, hash: string | undefined
  if (action === 'password') {
    if ((input.generate === true) === (typeof input.password === 'string') || input.generate !== undefined && input.generate !== true) throw new AdminAccountError('رمز جدید یا ساخت رمز را انتخاب کنید')
    const password = input.generate === true ? generatedPassword = randomBytes(24).toString('base64url') : String(input.password)
    const problem = password.length < 12 ? 'رمز جدید دست‌کم ۱۲ کاراکتر باشد' : passwordProblem(password)
    if (problem) throw new AdminAccountError(problem)
    hash = await bcrypt.hash(password, 10)
  }
  const [emailReady, smsReady] = await Promise.all([emailCanSignIn(), smsAvailable().catch(() => false)])
  const site = { emailCanSignIn: emailReady }
  return db.$transaction(async tx => {
    const { actor, user, refusal } = await context(req, id, tx)
    if (refusal) throw new AdminAccountError(refusal, 403)
    if (user.updatedAt.getTime() !== Date.parse(String(input.revision))) throw new AdminAccountError('حساب هم‌زمان تغییر کرده است؛ پیش‌نویس را نگه دارید و اطلاعات را بازخوانی کنید', 409)
    const now = new Date(Math.max(Date.now(), (user.sessionsRevokedAt?.getTime() || 0) + 1))
    const data: Prisma.UserUpdateManyMutationInput = { sessionsRevokedAt: now }
    if (action === 'profile') {
      if (typeof input.name !== 'string' || input.name.trim().length > 120 || typeof input.email !== 'string' || typeof input.phone !== 'string' || typeof input.phoneVerified !== 'boolean') throw new AdminAccountError('مشخصات حساب معتبر نیست')
      const phone = input.phone.trim() ? normalizeMobile(input.phone) : '', realEmail = normalizeEmail(input.email)
      if (input.phone.trim() && !phone || !phone && !realEmail || realEmail && (realEmail.length > 254 || !deliverableEmail(realEmail))) throw new AdminAccountError('شمارهٔ موبایل یا ایمیل معتبر وارد کنید')
      if (input.phoneVerified && !phone) throw new AdminAccountError('برای تأیید شماره، موبایل لازم است')
      const email = realEmail || phoneEmail(phone)
      if (phone && await tx.user.findFirst({ where: { id: { not: id }, OR: [{ phone: { in: [phone, `0${phone.slice(-10)}`, phone.slice(1)] } }, { email: phoneEmail(phone) }] }, select: { id: true } })) throw new AdminAccountError('این موبایل به حساب دیگری متصل است', 409)
      if (await tx.user.findFirst({ where: { id: { not: id }, email: { equals: email, mode: 'insensitive' } }, select: { id: true } })) throw new AdminAccountError('این ایمیل به حساب دیگری متصل است', 409)
      data.name = input.name.trim(); data.phone = phone; data.email = email
      data.phoneVerifiedAt = input.phoneVerified ? phone === user.phone && user.phoneVerifiedAt ? user.phoneVerifiedAt : now : null
    }
    if (hash) { data.passwordHash = hash; data.passwordSetupRequired = false; data.passwordChangedAt = now }
    if (action === 'login-policy') {
      const raw = input.loginPolicy
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== LOGIN_METHODS.length || LOGIN_METHODS.some(k => typeof (raw as Record<string, unknown>)[k] !== 'boolean')) throw new AdminAccountError('وضعیت هر پنج روش ورود را تعیین کنید')
      data.loginPolicy = JSON.stringify(loginPolicy(raw))
    }
    if (actor.id === id) {
      const proposed = { ...user, loginPolicy: typeof data.loginPolicy === 'string' ? data.loginPolicy : user.loginPolicy, email: typeof data.email === 'string' ? data.email : user.email, phoneVerifiedAt: data.phoneVerifiedAt instanceof Date ? data.phoneVerifiedAt : data.phoneVerifiedAt === null ? null : user.phoneVerifiedAt, passwordChangedAt: hash ? now : user.passwordChangedAt }
      if (!waysIn(proposed, site).some(way => way !== 'mobile' || smsReady)) throw new AdminAccountError('حداقل یک روش ورود قابل استفاده برای حساب خودتان نگه دارید', 409)
    }
    const claimed = await tx.user.updateMany({ where: { id, updatedAt: user.updatedAt }, data })
    if (claimed.count !== 1) throw new AdminAccountError('حساب هم‌زمان تغییر کرده است', 409)
    const phones = [...new Set([user.phone, typeof data.phone === 'string' ? data.phone : user.phone].flatMap(value => {
      const normalized = normalizeMobile(value)
      return [value, ...(normalized ? [normalized, `0${normalized.slice(-10)}`, normalized.slice(1)] : [])].filter(Boolean)
    }))]
    const emails = [...new Set([user.email, typeof data.email === 'string' ? data.email : user.email, ...phones.map(normalizeMobile).filter(Boolean).map(phoneEmail)].filter(Boolean))]
    await tx.otpCode.updateMany({ where: { consumedAt: null, OR: [{ userId: id }, { email: { in: emails, mode: 'insensitive' } }, { phone: { in: phones } }] }, data: { consumedAt: now } })
    await tx.passwordReset.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: now } })
    await auditAdminStrict({ req, actor, action: 'user.account.' + action, targetType: 'user', targetId: id, metadata: { note, fields: Object.keys(data).filter(k => k !== 'passwordHash'), passwordGenerated: !!generatedPassword } }, tx)
    const after = await tx.user.findUniqueOrThrow({ where: { id }, select: fields })
    return { ...view(after, null), ...(generatedPassword ? { generatedPassword } : {}) }
  }, { isolationLevel: 'Serializable', timeout: 15000 })
}
