import { offeredLocale } from '@/i18n/policy'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { getUserLocale, setUserLocale } from '@/modules/notifications/server/telegram-locale'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const u = await db.user.findUnique({ where: { id: user.id } })
  if (!u) return err('not found', 404)
  return ok({ id: u.id, email: u.email, name: u.name, phone: u.phone, phoneVerified: !!u.phoneVerifiedAt, smsAlerts: u.smsAlerts, emailAlerts: u.emailAlerts, avatarColor: u.avatarColor, subscriptionAlerts: u.subscriptionAlerts, locale: await getUserLocale(u.id) })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const locale = await getUserLocale(user.id) || offeredLocale(req.cookies.get('lang')?.value)
  const L = (en: string, fa: string) => locale === 'fa' ? fa : en
  const b = await req.json().catch(() => null)
  if (b?.locale !== undefined && b.locale !== 'en' && b.locale !== 'fa') return err('Invalid language', 400)

  const data: Record<string, unknown> = {}
  if (b?.subscriptionAlerts !== undefined) {
    if (typeof b.subscriptionAlerts !== 'boolean') return err(L('Invalid alert preference', 'وضعیت اعلان معتبر نیست'), 400)
    data.subscriptionAlerts = b.subscriptionAlerts
  }
  if (typeof b?.name === 'string') {
    const name = b.name.trim()
    if (name.length > 100) return err(L('Name must be 100 characters or fewer', 'نام حداکثر ۱۰۰ کاراکتر می‌تواند باشد'))
    data.name = name
  }
  if (typeof b?.phone === 'string') {
    const phone = b.phone.trim()
    if (phone && !/^[+\d][\d\s()-]{4,31}$/.test(phone)) return err(L('Invalid phone number', 'شماره تماس معتبر نیست'))
    const current = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } })
    // A changed number is unverified until confirmed with an SMS code (Profile → mobile verification).
    if (current?.phone !== phone) { data.phone = phone; data.phoneVerifiedAt = null }
  }
  if (b?.smsAlerts !== undefined) {
    if (typeof b.smsAlerts !== 'boolean') return err(L('Invalid alert preference', 'وضعیت اعلان معتبر نیست'), 400)
    data.smsAlerts = b.smsAlerts
  }
  if (b?.emailAlerts !== undefined) {
    if (typeof b.emailAlerts !== 'boolean') return err(L('Invalid alert preference', 'وضعیت اعلان معتبر نیست'), 400)
    data.emailAlerts = b.emailAlerts
  }
  if (typeof b?.avatarColor === 'string') {
    if (!/^#[0-9a-fA-F]{6}$/.test(b.avatarColor)) return err(L('Invalid color', 'رنگ نامعتبر است'))
    data.avatarColor = b.avatarColor
  }

  if (b?.newPassword) {
    const next = String(b.newPassword)
    if (next.length < 8 || next.length > 128) return err(L('New password must be between 8 and 128 characters', 'رمز جدید باید بین ۸ تا ۱۲۸ کاراکتر باشد'))
    // Throttle password-guessing against the current-password check.
    if (!rateLimitHit(`pwd-change:${user.id}`, 5, 10 * 60_000).ok) return err(L('Too many attempts. Please try again later.', 'تلاش بیش از حد مجاز است؛ کمی بعد دوباره امتحان کنید'), 429)
    const u = await db.user.findUnique({ where: { id: user.id } })
    if (!u) return err('not found', 404)
    const okPass = await bcrypt.compare(String(b?.currentPassword || ''), u.passwordHash)
    if (!okPass) return err(L('Current password is incorrect', 'رمز فعلی اشتباه است'), 403)
    data.passwordHash = await bcrypt.hash(next, 10)
  }

  const updated = Object.keys(data).length ? await db.user.update({ where: { id: user.id }, data }) : await db.user.findUniqueOrThrow({ where: { id: user.id } })
  if (b?.locale) await setUserLocale(user.id, b.locale)
  return ok({ id: updated.id, name: updated.name, phone: updated.phone, phoneVerified: !!updated.phoneVerifiedAt, smsAlerts: updated.smsAlerts, emailAlerts: updated.emailAlerts, avatarColor: updated.avatarColor, subscriptionAlerts: updated.subscriptionAlerts, locale: b?.locale || await getUserLocale(user.id) })
}
