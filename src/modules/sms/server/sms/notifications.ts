import { db } from '@/platform/database/prisma'
import { normalizeMobile, renderTemplate, smsEvent } from '@/modules/sms/domain/sms'
import { notificationModule } from '@/modules/notifications/domain/event-modules'
import { isModuleEnabled } from '@/extensions/server/modules'
import { sendSms, sendSmsResult, readSmsDelivery, type SmsDeliveryResult } from './delivery'
import { getSmsConfig, isReady } from './settings'
import { brandVars } from './variables'

/** Customer alert for an inbox event, delivered by its queued channel job. */
export async function notifyUserEventResult(event: { id?: number; userId: number; kind: string; titleFa: string; bodyFa?: string; href: string }, options?: { deliveryKey?: string; legacyAttempt?: boolean }): Promise<SmsDeliveryResult | null> {
  const key = options?.deliveryKey || (event.id ? `notification:${event.id}:sms` : undefined)
  const prior = key ? await readSmsDelivery(key, { event: event.kind, userId: event.userId }) : null
  if (prior) return prior
  const owner = notificationModule(event.kind)
  if (owner && !await isModuleEnabled(owner)) return null
  if (['STORE_RECEIPT', 'STORE_PICKUP_READY'].includes(event.kind) && !await isModuleEnabled('instore')) return null
  const def = smsEvent(event.kind)
  if (!def || def.audience !== 'user') return null
  const config = await getSmsConfig()
  const setting = config.events[event.kind]
  if (!setting?.enabled || !isReady(config)) return null
  const user = await db.user.findUnique({ where: { id: event.userId }, select: { name: true, phone: true, phoneVerifiedAt: true, smsAlerts: true, status: true } })
  // Ordinary alerts require a verified phone; Store transaction messages additionally bind the saved order and phone.
  const counterTarget = ['STORE_RECEIPT','STORE_PICKUP_READY'].includes(event.kind) ? await (await import('@/modules/store/server/sale-receipts')).storeMessageTarget(event) : null
  if(['STORE_RECEIPT','STORE_PICKUP_READY'].includes(event.kind)&&!counterTarget)return null
  if (!user || user.status !== 'ACTIVE' || !user.smsAlerts || (!user.phoneVerifiedAt && !counterTarget) || !normalizeMobile(user.phone)) return null
  if(counterTarget && normalizeMobile(counterTarget.phone)!==normalizeMobile(user.phone))return null
  if (!await (await import('@/modules/notifications/server/preferences')).isNotificationChannelEnabled(event.userId, event.kind, 'sms')) return null
  const { brand, site } = await brandVars()
  const pickupCode=counterTarget?.codeSecret?(await import('@/modules/catalog/server/digital-delivery')).decryptDigitalDelivery(counterTarget.codeSecret):''
  const vars = { name: user.name || 'کاربر', title: event.titleFa, body: pickupCode?`سفارش شما آمادهٔ تحویل از فروشگاه است. کد تحویل: ${pickupCode}`:event.bodyFa || event.titleFa, link: site ? `${site}${event.href}` : event.href, brand }
  return sendSmsResult({ deliveryKey: options?.deliveryKey || (event.id ? `notification:${event.id}:sms` : undefined), legacyAttempt: options?.legacyAttempt, phone: user.phone, event: event.kind, userId: event.userId, text: renderTemplate(setting.text, vars), pattern: setting.pattern || undefined, params: Object.fromEntries([...new Set([...def.vars, 'brand'])].map((name) => [name, vars[name as keyof typeof vars] || ''])) }, config)
}

export async function notifyUserEvent(event: { id?: number; userId: number; kind: string; titleFa: string; bodyFa?: string; href: string }): Promise<boolean | null> {
  const result = await notifyUserEventResult(event)
  return result ? result.sent : null
}

/** An address on this site as a full link, for a message read outside it. */
export async function siteLink(path: string) { const { site } = await brandVars(); return site ? `${site}${path}` : path }

/**
 * A customer alert to a number typed into a form (a customer in the shop may have no account), when the event is on.
 * The same daily ceiling and repeat guard apply as for every automatic message (sendSms).
 */
export async function notifyPhoneResult(eventId: string, phone: string, values: Record<string, string>, userId: number | null = null, deliveryKey?: string): Promise<SmsDeliveryResult | null> {
  const prior = deliveryKey ? await readSmsDelivery(deliveryKey, { event: eventId, userId }) : null
  if (prior) return prior
  const owner = notificationModule(eventId)
  if (owner && !await isModuleEnabled(owner)) return null
  const def = smsEvent(eventId)
  const config = await getSmsConfig()
  const setting = config.events[eventId]
  if (!def || def.audience !== 'user' || !setting?.enabled || !isReady(config) || !normalizeMobile(phone)) return null
  const { brand } = await brandVars()
  const vars: Record<string, string> = { ...values, brand }
  return sendSmsResult({ deliveryKey, phone, event: eventId, userId, text: renderTemplate(setting.text, vars), pattern: setting.pattern || undefined, params: Object.fromEntries([...new Set([...def.vars, 'brand'])].map((name) => [name, vars[name] || ''])) }, config)
}

export async function notifyPhone(eventId: string, phone: string, values: Record<string, string>, userId: number | null = null) {
  return (await notifyPhoneResult(eventId, phone, values, userId))?.sent ?? false
}

/** Staff alert to every admin mobile in the SMS settings. */
export async function notifyAdmins(eventId: string, values: Record<string, string>) {
  const def = smsEvent(eventId)
  const config = await getSmsConfig()
  const setting = config.events[eventId]
  if (!def || def.audience !== 'admin' || !setting?.enabled || !isReady(config) || !config.adminPhones.length) return
  const { brand } = await brandVars()
  const vars: Record<string, string> = { ...values, brand }
  for (const phone of config.adminPhones) {
    await sendSms({ phone, event: eventId, text: renderTemplate(setting.text, vars), pattern: setting.pattern || undefined, params: Object.fromEntries([...new Set([...def.vars, 'brand'])].map((name) => [name, vars[name] || ''])) }, config)
  }
}
