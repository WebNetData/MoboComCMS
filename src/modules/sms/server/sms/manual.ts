import { randomUUID } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { credit } from '@/modules/sms/server/ippanel'
import { getSmsConfig, apiKeyOf } from './settings'
import { sendSmsResult } from './delivery'
import { SmsError } from './error'

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
    const result = await sendSmsResult({ phone: String(input.phone), event: 'MANUAL', text }, config)
    return { sent: result.sent ? 1 : 0, unknown: result.status === 'UNKNOWN' || result.status === 'SENDING' ? 1 : 0, total: 1 }
  }
  const now = new Date()
  const vipIds = input.to === 'vip'
    ? (await db.userMembership.findMany({ where: { revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } }, select: { userId: true }, distinct: ['userId'] })).map(row => row.userId)
    : null
  const users = await db.user.findMany({
    where: { status: 'ACTIVE', smsAlerts: true, phoneVerifiedAt: { not: null }, ...(vipIds ? { id: { in: vipIds } } : {}) },
    select: { id: true, phone: true }, orderBy: { id: 'asc' }, take: 501,
  })
  const eligible = users.map(user => ({ id: user.id, phone: normalizeMobile(user.phone) })).filter(user => !!user.phone)
  const selected = eligible.slice(0, 500)
  const truncated = users.length > 500
  const { enqueue } = await import('@/modules/operations/server/enqueue')
  const { encryptDigitalDelivery } = await import('@/modules/catalog/server/digital-delivery')
  const intent = randomUUID()
  const jobs = selected.map(user => ({ intent: `${intent}:${user.id}`, sealed: encryptDigitalDelivery(JSON.stringify({ userId: user.id, phone: user.phone, text, group: input.to })) }))
  await db.$transaction(async tx => {
    for (const job of jobs) await enqueue('sms.broadcast', job, { dedupeKey: `sms.broadcast:${job.intent}` }, tx)
  }, { timeout: 30_000 })
  return { queued: jobs.length, total: jobs.length, sent: 0, unknown: 0, truncated }

}

export async function smsCredit() {
  const config = await getSmsConfig()
  const key = apiKeyOf(config)
  if (!key) throw new SmsError('کلید API پنل پیامک وارد نشده است')
  const result = await credit(key)
  if (!result.ok) throw new SmsError(result.error || 'IPPanel پاسخ نداد', 502)
  return result.credit
}
