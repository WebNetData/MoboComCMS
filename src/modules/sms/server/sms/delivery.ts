import { createHmac } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { normalizeMobile, type SmsConfig } from '@/modules/sms/domain/sms'
import { sendPattern, sendText } from '@/modules/sms/server/ippanel'
import { getSmsConfig, apiKeyOf, isReady } from './settings'
import { serializable } from './transaction'
import { SmsError } from './error'

/** The most automatic alerts one number receives in a day. */
export const SMS_DAILY_PER_PHONE = 12

export interface SendInput { phone: string; event: string; text: string; pattern?: string; params?: Record<string, string>; userId?: number | null; kind?: 'TEXT' | 'PATTERN' | 'OTP'; deliveryKey?: string; legacyAttempt?: boolean }
export type SmsDeliveryStatus = 'SENT' | 'FAILED' | 'SKIPPED' | 'SENDING' | 'UNKNOWN'
export type SmsDeliveryResult = { status: SmsDeliveryStatus; logId: number | null; sent: boolean }
const deliveryResult = (status: SmsDeliveryStatus, logId: number | null): SmsDeliveryResult => ({ status, logId, sent: status === 'SENT' })

/** Reserve before calling the provider; a keyed delivery is never attempted twice. */
export async function sendSmsResult(input: SendInput, config?: SmsConfig): Promise<SmsDeliveryResult> {
  const settings = config || await getSmsConfig()
  const phone = normalizeMobile(input.phone) || String(input.phone).slice(0, 20)
  const validPhone = !!normalizeMobile(input.phone)
  const kind = input.kind || (input.pattern ? 'PATTERN' : 'TEXT')
  const params = Object.entries(input.params || {}).sort(([a], [b]) => a.localeCompare(b))
  const contentHash = createHmac('sha256', authSecret()).update(JSON.stringify([phone, input.event, kind, input.text, input.pattern || '', params])).digest('hex')
  const body = kind === 'OTP' || ['FORM_STAGE', 'STORE_PICKUP_READY'].includes(input.event) ? '(محتوای محرمانه)' : input.text.slice(0, 1000)
  const key = input.deliveryKey || null
  const existing = async (row: { id: number; phone: string; event: string; kind: string; userId: number | null; contentHash: string; status: string; createdAt: Date }) => {
    if (row.phone !== phone || row.userId !== (input.userId ?? null) || row.event !== input.event || row.kind !== kind || row.contentHash !== contentHash) throw new SmsError('کلید ارسال با پیام دیگری استفاده شده است', 409)
    let status = row.status as SmsDeliveryStatus
    if (status === 'SENDING' && Date.now() - row.createdAt.getTime() >= 30_000) {
      await db.smsLog.updateMany({ where: { id: row.id, status: 'SENDING' }, data: { status: 'UNKNOWN' } })
      status = (await db.smsLog.findUnique({ where: { id: row.id }, select: { status: true } }))?.status as SmsDeliveryStatus || 'UNKNOWN'
    }
    return deliveryResult(status, row.id)
  }
  let reservation: { id: number; status: string }
  try {
    reservation = await serializable(async tx => {
      if (key) {
        const prior = await tx.smsLog.findUnique({ where: { dedupeKey: key } })
        if (prior) return { id: prior.id, status: 'EXISTING' }
      }
      let reason = !validPhone ? 'شماره موبایل نامعتبر' : !isReady(settings) ? 'پنل پیامک تنظیم نشده است' : ''
      if (!reason && kind !== 'OTP' && !['MANUAL', 'TEST'].includes(input.event)) {
        const active = ['SENDING', 'SENT', 'UNKNOWN']
        const [same, today] = await Promise.all([
          tx.smsLog.count({ where: { phone, event: input.event, status: { in: active }, createdAt: { gt: new Date(Date.now() - 600_000) }, OR: [{ contentHash }, { contentHash: '', body: input.text.slice(0, 1000), status: 'SENT' }] } }),
          tx.smsLog.count({ where: { phone, status: { in: active }, kind: { not: 'OTP' }, createdAt: { gt: new Date(Date.now() - 86_400_000) } } }),
        ])
        if (same || today >= SMS_DAILY_PER_PHONE) reason = 'محدودیت ارسال خودکار پیامک'
      }
      return tx.smsLog.create({ data: { phone, event: input.event, kind, body, contentHash, dedupeKey: key, status: reason ? 'SKIPPED' : input.legacyAttempt ? 'UNKNOWN' : 'SENDING', error: reason, userId: input.userId ?? null }, select: { id: true, status: true } })
    })
  } catch (error) {
    if (key && (error as { code?: string }).code === 'P2002') {
      const prior = await db.smsLog.findUnique({ where: { dedupeKey: key } })
      if (prior) return existing(prior)
    }
    throw error
  }
  if (reservation.status === 'EXISTING') {
    const prior = await db.smsLog.findUniqueOrThrow({ where: { id: reservation.id } })
    return existing(prior)
  }
  if (reservation.status === 'UNKNOWN') return deliveryResult('UNKNOWN', reservation.id)
  if (reservation.status === 'SKIPPED') {
    return deliveryResult('SKIPPED', reservation.id)
  }
  const result = await (input.pattern
    ? sendPattern(apiKeyOf(settings), settings.fromNumber, phone, input.pattern, input.params || {})
    : sendText(apiKeyOf(settings), settings.fromNumber, [phone], input.text))
    .catch(() => ({ ok: false, unknown: true, id: '', error: 'IPPanel transport error' }))
  const status: SmsDeliveryStatus = result.ok ? 'SENT' : result.unknown ? 'UNKNOWN' : 'FAILED'
  try {
    const changed = await db.smsLog.updateMany({ where: { id: reservation.id, status: 'SENDING' }, data: { status, providerId: result.id, error: result.error } })
    if (changed.count !== 1) return deliveryResult('UNKNOWN', reservation.id)
  } catch { return deliveryResult('UNKNOWN', reservation.id) }
  return deliveryResult(status, reservation.id)
}

export async function sendSms(input: SendInput, config?: SmsConfig): Promise<boolean> {
  return (await sendSmsResult(input, config)).sent
}

/** Internal intent receipts survive changes to templates, user names and delivery settings. */
export async function readSmsDelivery(key: string, identity: { event: string; userId: number | null }): Promise<SmsDeliveryResult | null> {
  const row = await db.smsLog.findUnique({ where: { dedupeKey: key } })
  if (!row) return null
  if (row.event !== identity.event || row.userId !== identity.userId) throw new SmsError('هویت سابقهٔ پیامک با درخواست تطبیق ندارد', 409)
  if (row.status === 'SENDING' && Date.now() - row.createdAt.getTime() >= 30_000) {
    await db.smsLog.updateMany({ where: { id: row.id, status: 'SENDING' }, data: { status: 'UNKNOWN' } })
    const current = await db.smsLog.findUniqueOrThrow({ where: { id: row.id } })
    return deliveryResult(current.status as SmsDeliveryStatus, row.id)
  }
  return deliveryResult(row.status as SmsDeliveryStatus, row.id)
}
