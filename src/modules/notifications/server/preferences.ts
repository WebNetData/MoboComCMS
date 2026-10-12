import { db } from '@/platform/database/prisma'
import { EMAIL_EVENTS } from '@/modules/mail/domain/mail'
import { SMS_EVENTS } from '@/modules/sms/domain/sms'

export type NotificationChannel = 'sms' | 'email' | 'push'
type KindLabel = { kind: string; labelEn: string; labelFa: string }

// Inbox-only kinds do not have an SMS/email template; account push is their external copy.
const INBOX_ONLY: KindLabel[] = [
  { kind: 'ORDER_STATUS', labelEn: 'Order status', labelFa: 'وضعیت سفارش' },
  { kind: 'FOLLOWED_UPDATE', labelEn: 'Followed content update', labelFa: 'محتوای دنبال‌شده' },
  { kind: 'REVIEW_APPROVED', labelEn: 'Review approved', labelFa: 'انتشار نظر' },
  { kind: 'TRASH_DECISION', labelEn: 'Decisions on my delete requests', labelFa: 'تصمیم دربارهٔ درخواست حذف من' },
  { kind: 'COMMENT_APPROVED', labelEn: 'Article comment approved', labelFa: 'انتشار دیدگاه مقاله' },
  { kind: 'COMMENT_REPLY', labelEn: 'Replies to my article comments', labelFa: 'پاسخ به دیدگاه مقاله' },
  { kind: 'FORUM_REPLY', labelEn: 'Forum replies', labelFa: 'پاسخ در تالار' },
  { kind: 'FORUM_MENTION', labelEn: 'Forum mentions', labelFa: 'نام‌بردن در تالار' },
  { kind: 'FORUM_POSTED', labelEn: 'Watched forum topics', labelFa: 'موضوع‌های دنبال‌شدهٔ تالار' },
  { kind: 'FORUM_NEW_TOPIC', labelEn: 'New forum topics', labelFa: 'موضوع تازهٔ تالار' },
  { kind: 'FORUM_MESSAGE', labelEn: 'Private forum messages', labelFa: 'پیام خصوصی تالار' },
  { kind: 'FORUM_REACTION', labelEn: 'Forum reactions', labelFa: 'واکنش‌های تالار' },
  { kind: 'FORUM_GROUP', labelEn: 'Forum group activity', labelFa: 'گروه‌های تالار' },
  { kind: 'FORUM_BADGE', labelEn: 'Forum badges', labelFa: 'نشان‌های تالار' },
  { kind: 'FORUM_TRUST', labelEn: 'Forum trust level', labelFa: 'سطح اعتماد تالار' },
  { kind: 'FORUM_APPROVED', labelEn: 'Forum post approved', labelFa: 'تأیید پیام تالار' },
  { kind: 'FORUM_REJECTED', labelEn: 'Forum post rejected', labelFa: 'رد پیام تالار' },
  { kind: 'FORUM_MOVED', labelEn: 'Forum post moved', labelFa: 'انتقال پیام تالار' },
  { kind: 'FORUM_HIDDEN', labelEn: 'Forum post hidden', labelFa: 'پنهان‌شدن پیام تالار' },
  { kind: 'FORUM_SOLVED', labelEn: 'Forum answer accepted', labelFa: 'پذیرش پاسخ تالار' },
  { kind: 'COMMUNITY_MENTION', labelEn: 'Community mentions', labelFa: 'نام‌بردن در جامعه' },
  { kind: 'COMMUNITY_LIKE', labelEn: 'Community likes', labelFa: 'پسندهای جامعه' },
  { kind: 'COMMUNITY_COMMENT', labelEn: 'Community comments', labelFa: 'دیدگاه‌های جامعه' },
]

const excluded = new Set(['FX_RATE', 'ADS', 'FORM'])
const sms = new Map(SMS_EVENTS.filter((event) => event.audience === 'user' && !excluded.has(event.id)).map((event) => [event.id, event.label]))
const email = new Map(EMAIL_EVENTS.filter((event) => !excluded.has(event.id)).map((event) => [event.id, event.label]))
const labels = new Map(INBOX_ONLY.map((event) => [event.kind, event]))
const ids = [...new Set([...sms.keys(), ...email.keys(), ...labels.keys()])]

/** Channels are derived from the providers' actual supported customer events. */
export const notificationPreferenceCatalog = ids.map((kind) => ({
  kind,
  labelFa: labels.get(kind)?.labelFa || sms.get(kind) || email.get(kind) || kind,
  labelEn: labels.get(kind)?.labelEn || kind.replace(/_/g, ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase()),
  channels: [
    ...(sms.has(kind) ? ['sms' as const] : []),
    ...(email.has(kind) ? ['email' as const] : []),
    'push' as const,
  ],
}))

export const validNotificationPreference = (kind: string, channel: string) =>
  notificationPreferenceCatalog.some((event) => event.kind === kind && event.channels.some((item) => item === channel))

/** A missing mute preserves legacy delivery. The private inbox is never checked here. */
export async function isNotificationChannelEnabled(userId: number, kind: string, channel: NotificationChannel) {
  const muted = await db.userNotificationMute.findUnique({
    where: { userId_kind_channel: { userId, kind, channel } }, select: { id: true },
  })
  return !muted
}
