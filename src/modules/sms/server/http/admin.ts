import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { SMS_EVENTS } from '@/modules/sms/domain/sms'
import { SmsError, broadcast, getSmsConfig, publicSmsConfig, saveSmsConfig, sendSms, smsCredit } from '@/modules/sms/server/sms'

const guard = (req: NextRequest) => requirePerm(req, 'settings.manage')
const fail = (error: unknown) => error instanceof SmsError ? err(error.message, error.status) : err(error instanceof Error ? error.message : 'failed', 400)

export async function GET(req: NextRequest) {
  if (!await guard(req)) return err('forbidden', 403)
  const [config, log, stats, verified] = await Promise.all([
    getSmsConfig(),
    db.smsLog.findMany({ orderBy: { id: 'desc' }, take: 60 }),
    db.smsLog.groupBy({ by: ['status'], where: { createdAt: { gt: new Date(Date.now() - 30 * 86_400_000) } }, _count: { _all: true } }),
    db.user.count({ where: { phoneVerifiedAt: { not: null }, smsAlerts: true, status: 'ACTIVE' } }),
  ])
  return ok({
    config: publicSmsConfig(config), events: SMS_EVENTS, log, verifiedUsers: verified,
    stats: Object.fromEntries(stats.map((row) => [row.status, row._count._all])),
  })
}

export async function PUT(req: NextRequest) {
  const admin = await guard(req)
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('invalid body')
  const config = await saveSmsConfig(body)
  await auditAdmin({ req, actor: admin, action: 'sms.config.update', targetType: 'setting', targetId: 'sms.config.v1', metadata: { enabled: config.enabled, fromNumber: config.fromNumber } })
  return ok({ config: publicSmsConfig(config) })
}

/** POST { action: 'credit' | 'test' | 'broadcast', ... } */
export async function POST(req: NextRequest) {
  const admin = await guard(req)
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  try {
    if (body?.action === 'credit') return ok({ credit: await smsCredit() })
    if (body?.action === 'test') {
      const sent = await sendSms({ phone: String(body.phone || ''), event: 'TEST', text: String(body.text || 'پیامک آزمایشی از پنل مدیریت') })
      if (!sent) return err('ارسال نشد؛ جزئیات در گزارش پیامک‌ها ثبت شد', 502)
      return ok({ sent: true })
    }
    if (body?.action === 'broadcast') {
      const to = body.to === 'verified' || body.to === 'vip' ? body.to : 'phone'
      const result = await broadcast({ to, phone: body.phone, text: String(body.text || '') })
      await auditAdmin({ req, actor: admin, action: 'sms.broadcast', targetType: 'sms', targetId: to, metadata: result })
      return ok(result)
    }
    return err('unknown action', 404)
  } catch (error) { return fail(error) }
}
