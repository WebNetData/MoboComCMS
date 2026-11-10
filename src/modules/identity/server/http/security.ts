import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { clientIp } from '@/platform/http/rate-limit'
import { db } from '@/platform/database/prisma'
import { requirePerm, requireUser } from '@/modules/identity/server/access'
import { sectionSettingsAnswer, sectionSettingsSaveWith } from '@/modules/settings/server/http/section-history'
import { sectionSettingsRevision } from '@/modules/settings/server/section-history'
import { getGoogleLogin, googleLoginStatus, publicGoogleSettings, saveGoogleLogin } from '@/modules/identity/server/google-login'
import { getHumanCheck, humanCheckStatus, saveHumanCheck, verifyHuman } from '@/modules/identity/server/human-check'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import {
  SecurityError, beginTwoFactor, confirmTwoFactor, disableTwoFactor, getSecurityPolicy, inspectResetToken, regenerateBackupCodes,
  requestEmailReset, requestSmsReset, resetTwoFactorByAdmin, resetWithSms, resetWithToken, saveSecurityPolicy, twoFactorStatus,
} from '@/modules/identity/server/account-security'

const fail = (error: unknown) => {
  if (error instanceof SecurityError) return err(error.message, error.status)
  throw error
}

// ------------------------------------------------------------------ password reset (public)

/** POST /api/password/forgot { method: 'email' | 'sms', email?, phone?, turnstileToken? } */
export async function POST_forgot(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!await verifyHuman(body?.turnstileToken, req.headers, 'recovery')) return err('اعتبارسنجی امنیتی را کامل کنید', 400, { code: 'HUMAN_CHECK' })
  const ip = clientIp(req.headers)
  try {
    return ok(body?.method === 'sms' ? await requestSmsReset({ phone: body?.phone, ip }) : await requestEmailReset({ email: body?.email, ip }))
  } catch (error) { return fail(error) }
}

/** GET /api/password/reset?token= — whether a link still works (and needs a 2-step code). */
export async function GET_reset(req: NextRequest) {
  return ok(await inspectResetToken(req.nextUrl.searchParams.get('token')))
}

/** POST /api/password/reset { token, password, code? } or { phone, code, password, totp? } */
export async function POST_reset(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('اطلاعات ارسال نشد')
  try {
    const done = body.token
      ? await resetWithToken({ token: body.token, password: body.password, code: body.totp, ip: clientIp(req.headers) })
      : await resetWithSms({ phone: body.phone, code: body.code, password: body.password, totp: body.totp })
    return ok({ ok: true, ...done })
  } catch (error) { return fail(error) }
}

// ------------------------------------------------------------------ 2-step sign-in (member)

/** GET /api/account/two-factor */
export async function GET_two_factor(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  return ok(await twoFactorStatus(user.id))
}

/** POST /api/account/two-factor { action: 'begin' | 'confirm' | 'disable' | 'backup', code? } */
export async function POST_two_factor(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const body = await req.json().catch(() => null)
  try {
    switch (body?.action) {
      case 'begin': return ok(await beginTwoFactor(user.id))
      case 'confirm': return ok(await confirmTwoFactor(user.id, body.code))
      case 'disable': await disableTwoFactor(user.id, body.code); return ok({ ok: true })
      case 'backup': return ok(await regenerateBackupCodes(user.id, body.code))
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) { return fail(error) }
}

// ------------------------------------------------------------------ admin policy

/** GET/PUT /api/admin/security — sign-in security policy; POST { action: 'reset-2fa', user: id | email | mobile } for support. */
export async function GET_policy(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  if (req.nextUrl.searchParams.get('view') === 'human-check') return sectionSettingsAnswer(await getHumanCheck(), humanCheckStatus())
  if (req.nextUrl.searchParams.get('view') === 'google') {
    // The revision covers the stored (encrypted) secret; the page sees only whether one is saved.
    const settings = await getGoogleLogin()
    const response = ok({ ...await googleLoginStatus(), settings: publicGoogleSettings(settings), settingsRevision: sectionSettingsRevision(settings) })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
  const [policy, enabled, admins, adminsWith] = await Promise.all([
    getSecurityPolicy(),
    db.user.count({ where: { totpEnabledAt: { not: null } } }),
    db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } }),
    db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', totpEnabledAt: { not: null } } }),
  ])
  return ok({ policy, stats: { enabled, admins, adminsWith } })
}

export async function PUT_policy(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  if (req.nextUrl.searchParams.get('view') === 'human-check') return sectionSettingsSaveWith(req, admin, context => saveHumanCheck(body, context), settings => ({ settings, ...humanCheckStatus() }))
  if (req.nextUrl.searchParams.get('view') === 'google') return sectionSettingsSaveWith(req, admin, context => saveGoogleLogin(body, context), async settings => ({ settings: publicGoogleSettings(settings), ...await googleLoginStatus() }))
  // Turning the staff rule on without 2-step sign-in of your own would lock you out.
  if (body?.policy?.requireAdmin2fa === true && !admin.twoFactor) return err('اول ورود دو مرحله‌ای حساب خودتان را در «تنظیمات حساب» فعال کنید، سپس این گزینه را روشن کنید.', 409)
  const policy = await saveSecurityPolicy(body?.policy)
  await auditAdmin({ req, actor: admin, action: 'security_policy.update', targetType: 'setting', targetId: 'security.policy.v1', metadata: policy })
  return ok({ policy })
}

export async function POST_policy(req: NextRequest) {
  const admin = await requirePerm(req, 'users.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const who = String(body?.user ?? '').trim().toLowerCase()
  if (body?.action !== 'reset-2fa' || !who) return err('شناسه، ایمیل یا موبایل کاربر را وارد کنید')
  const target = /^\d{1,9}$/.test(who)
    ? await db.user.findUnique({ where: { id: Number(who) }, select: { id: true, totpEnabledAt: true } })
    : await db.user.findFirst({ where: who.includes('@') ? { email: who } : { phone: normalizeMobile(who) || who }, select: { id: true, totpEnabledAt: true } })
  if (!target) return err('کاربر پیدا نشد', 404)
  const userId = target.id
  if (userId === admin.id) return err('ورود دو مرحله‌ای خودتان را از تنظیمات حساب خاموش کنید', 400)
  if (!target.totpEnabledAt) return err('ورود دو مرحله‌ای این کاربر فعال نیست', 409)
  await resetTwoFactorByAdmin(userId)
  await auditAdmin({ req, actor: admin, action: 'user.2fa_reset', targetType: 'user', targetId: userId })
  return ok({ ok: true })
}
