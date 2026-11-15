import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { SMS_EVENTS, smsEventGroup, normalizeMobile } from '@/modules/sms/domain/sms'
import { latinDigits } from '@/shared/text/digits'
import { notificationOffered } from '@/modules/notifications/domain/event-modules'
import { getModuleStates } from '@/extensions/server/modules'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { SmsError, broadcast, getSmsConfig, publicSmsConfig, saveSmsConfig, sendSms, smsCredit } from '@/modules/sms/server/sms'

const guard = (req: NextRequest) => requirePerm(req, 'settings.manage')
const response = (value: unknown) => { const out = ok(value); out.headers.set('Cache-Control', 'private, no-store'); return out }
const originAllowed = (req: NextRequest) => mutationOrigin({ origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'), hasCookies: true, hosts: [req.headers.get('host'), req.nextUrl.host] }) === 'allow'
const fail = (error: unknown) => error instanceof SmsError || error instanceof JsonBodyError ? err(error.message, error.status) : err('انجام درخواست پیامک ممکن نشد؛ اطلاعات ثبت‌شده را بررسی کنید', 503)
const statuses = ['SENT', 'FAILED', 'SKIPPED', 'SENDING', 'UNKNOWN']

export async function GET(req: NextRequest) {
  if (!await guard(req)) return err('forbidden', 403)
  try {
    const query = req.nextUrl.searchParams, status = query.get('status') || '', event = query.get('event') || '', digits = latinDigits(query.get('phone') || '').replace(/[^\d]/g, '')
    const page = Number(query.get('page') || 1), pageSize = Number(query.get('pageSize') || 30), days = Number(query.get('days') || 30)
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || ![10, 30, 60].includes(pageSize) || ![7, 30, 90].includes(days) || status && !statuses.includes(status) || event.length > 80 || !/^[A-Z_]*$/.test(event) || digits.length > 15 || query.get('phone') && digits.length < 4) return err('فیلتر گزارش معتبر نیست', 400)
    const phone = normalizeMobile(query.get('phone'))
    const stale = new Date(Date.now() - 30_000)
    const statusFilter = status === 'UNKNOWN' ? { OR: [{ status: 'UNKNOWN' }, { status: 'SENDING', createdAt: { lt: stale } }] } : status === 'SENDING' ? { status, createdAt: { gte: stale } } : status ? { status } : {}
    const where = { AND: [{ createdAt: { gte: new Date(Date.now() - days * 86_400_000) } }, statusFilter], ...(event ? { event } : {}), ...(digits ? { phone: { contains: phone ? phone.slice(-10) : digits } } : {}) }
    const states = await getModuleStates()
    const [config, log, total, stats, verified] = await Promise.all([
      getSmsConfig(),
      db.smsLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      db.smsLog.count({ where }),
      db.smsLog.groupBy({ by: ['status'], where: { createdAt: { gt: new Date(Date.now() - 30 * 86_400_000) } }, _count: { _all: true } }),
      db.user.count({ where: { phoneVerifiedAt: { not: null }, smsAlerts: true, status: 'ACTIVE' } }),
    ])
    return response({
      config: publicSmsConfig(config), events: SMS_EVENTS.filter(event => notificationOffered(event.id, states)).map(event => ({ ...event, group: smsEventGroup(event.id) })),
      log: log.map(row => ({ ...row, status: row.status === 'SENDING' && row.createdAt.getTime() < Date.now() - 30_000 ? 'UNKNOWN' : row.status, body: row.kind === 'OTP' || ['STORE_PICKUP_READY', 'FORM_STAGE'].includes(row.event) ? '(محتوای محرمانهٔ تراکنش)' : row.body, error: row.kind === 'OTP' || ['STORE_PICKUP_READY', 'FORM_STAGE'].includes(row.event) ? '' : row.error })),
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) }, verifiedUsers: verified,
      stats: Object.fromEntries(stats.map(row => [row.status, row._count._all])),
    })
  } catch (error) { return fail(error) }
}

export async function PUT(req: NextRequest) {
  if (!originAllowed(req)) return err('مبدأ درخواست معتبر نیست', 403)
  const admin = await guard(req)
  if (!admin) return err('forbidden', 403)
  if (!(await rateLimitStrict(`sms:config:${admin.id}`, 20, 60_000)).ok) return err('تعداد درخواست‌ها زیاد است؛ کمی بعد تلاش کنید', 429)
  try {
    const body = await readJsonObject(req, 80_000)
    if (typeof body.revision !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision)) return err('ابتدا تنظیمات فعلی را دریافت کنید و سپس ذخیره کنید', 409)
    const config = await saveSmsConfig(body, { req, actor: admin })
    return response({ config: publicSmsConfig(config) })
  } catch (error) { return fail(error) }
}

/** Explicit administrator actions only; credit never implies a successful message delivery. */
export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return err('مبدأ درخواست معتبر نیست', 403)
  const admin = await guard(req)
  if (!admin) return err('forbidden', 403)
  if (!(await rateLimitStrict(`sms:actions:${admin.id}`, 10, 60_000)).ok) return err('تعداد درخواست‌ها زیاد است؛ کمی بعد تلاش کنید', 429)
  try {
    const body = await readJsonObject(req, 4000)
    if (body.action === 'credit') return response({ credit: await smsCredit() })
    if (body.action === 'test') {
      const sent = await sendSms({ phone: String(body.phone || ''), event: 'TEST', text: String(body.text || 'پیامک آزمایشی از پنل مدیریت') })
      if (!sent) return err('ارسال تأیید نشد؛ گزارش را بررسی کنید. نتیجهٔ نامشخص را خودکار تکرار نکنید.', 502)
      return response({ sent: true })
    }
    if (body.action === 'broadcast') {
      if (!['phone', 'verified', 'vip'].includes(String(body.to))) return err('گروه گیرنده معتبر نیست', 400)
      if (body.to !== 'phone' && body.confirm !== true) return err('ارسال برای گروه گیرندگان را تأیید کنید', 400)
      const to = body.to as 'phone' | 'verified' | 'vip'
      const result = await broadcast({ to, phone: typeof body.phone === 'string' ? body.phone : '', text: String(body.text || '') })
      await auditAdmin({ req, actor: admin, action: 'sms.broadcast', targetType: 'sms', targetId: to, metadata: result })
      return response(result)
    }
    return err('عملیات پیامک شناخته نشد', 404)
  } catch (error) { return fail(error) }
}
