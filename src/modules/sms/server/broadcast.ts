import { db } from '@/platform/database/prisma'
import { decryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { sendSmsResult } from '@/modules/sms/server/sms'

/** One durable, consent-checked recipient; retry never repeats an uncertain provider call. */
export async function deliverBroadcast(payload: Record<string, unknown>, attempts: number) {
  const intent = typeof payload.intent === 'string' ? payload.intent : ''
  const sealed = typeof payload.sealed === 'string' ? payload.sealed : ''
  let item: { userId?: unknown; phone?: unknown; text?: unknown; group?: unknown }
  try { item = JSON.parse(decryptDigitalDelivery(sealed)) } catch { throw new Error('Invalid encrypted SMS broadcast intent') }
  const userId = Number(item.userId)
  if (!Number.isSafeInteger(userId) || userId <= 0 || !new RegExp(`^[0-9a-f-]{36}:${userId}$`, 'i').test(intent) || typeof item.phone !== 'string' || !normalizeMobile(item.phone) || typeof item.text !== 'string' || item.text.length < 2 || item.text.length > 700 || !['verified', 'vip'].includes(String(item.group))) throw new Error('Invalid SMS broadcast intent')
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, smsAlerts: true, phone: true, phoneVerifiedAt: true } })
  if (!user || user.status !== 'ACTIVE' || !user.smsAlerts || !user.phoneVerifiedAt || normalizeMobile(user.phone) !== item.phone) return { status: 'SKIPPED' }
  if (item.group === 'vip') {
    const now = new Date()
    const member = await db.userMembership.findFirst({ where: { userId, revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } }, select: { userId: true } })
    if (!member) return { status: 'SKIPPED' }
  }
  const result = await sendSmsResult({ phone: item.phone, text: item.text, event: 'MANUAL', userId, deliveryKey: `broadcast:${intent}`, legacyAttempt: attempts > 1 })
  return { status: result.status, logId: result.logId }
}
