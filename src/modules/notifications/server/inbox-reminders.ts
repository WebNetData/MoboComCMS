import { db } from '@/platform/database/prisma'
import { createInboxEvent } from './inbox'

const CURSOR = 'inbox.expiry.cursor'

/** Website/mini-app reminders work even when Telegram is disconnected. */
export async function runInboxExpiryNotices() {
  const row = await db.setting.findUnique({ where: { key: CURSOR } })
  const cursor = Number(row?.value || 0)
  const horizon = new Date(Date.now() + 3 * 86400_000)
  const where = { status: { in: ['ACTIVE', 'EXPIRED'] }, expiresAt: { lte: horizon }, user: { status: 'ACTIVE', subscriptionAlerts: true } }
  let subscriptions = await db.subscription.findMany({ where: { ...where, id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 100, select: { id: true, userId: true, expiresAt: true } })
  if (!subscriptions.length && cursor) subscriptions = await db.subscription.findMany({ where, orderBy: { id: 'asc' }, take: 100, select: { id: true, userId: true, expiresAt: true } })
  let created = 0
  for (const sub of subscriptions) {
    const expired = sub.expiresAt.getTime() <= Date.now()
    const days = Math.max(0, Math.ceil((sub.expiresAt.getTime() - Date.now()) / 86400_000))
    await createInboxEvent({
      userId: sub.userId, kind: expired ? 'SUBSCRIPTION_EXPIRED' : 'SUBSCRIPTION_EXPIRING',
      dedupeKey: `subscription:${sub.id}:${expired ? 'expired' : 'expiring'}:${sub.expiresAt.toISOString()}`,
      titleEn: expired ? 'Subscription expired' : 'Subscription expiring soon',
      titleFa: expired ? 'اعتبار اشتراک به پایان رسید' : 'اعتبار اشتراک رو به پایان است',
      bodyEn: expired ? 'Renew to keep your connection active.' : `${days} day(s) remain. Review your subscription.`,
      bodyFa: expired ? 'برای ادامهٔ اتصال، اشتراک را تمدید کنید.' : `${days} روز تا پایان اشتراک باقی مانده است.`,
      href: `/dashboard/subscriptions/${sub.id}`,
    })
    created++
  }
  await db.setting.upsert({ where: { key: CURSOR }, create: { key: CURSOR, value: String(subscriptions.at(-1)?.id || 0) }, update: { value: String(subscriptions.at(-1)?.id || 0) } })
  return { checked: subscriptions.length, createdOrExisting: created }
}
