import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { isModuleEnabled } from '@/extensions/server/modules'
import { readJsonSetting, updateJsonSetting } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { bot, telegramConfig } from '@/modules/notifications/server/telegram'
import { siteBase } from '@/modules/site/server/seo'
import { itemKey, type ItemRef } from '@/modules/content/domain/items'
import { itemCard, type ItemCard } from '@/modules/content/server/registry'
import { broadcast } from '@/modules/push/server/push'
import { hashtag } from '@/modules/social/domain/social'
import { socialFetch } from '@/modules/social/server/egress'
import { socialImage } from '@/modules/social/server/images'
import {
  DEFAULT_SOCIAL, MAX_ATTEMPTS, isAnnounceType, normalizeSocialSettings, renderPost, retryDelayMs, withUtm,
  type AnnounceType, type Channel, type SocialSettings,
} from '@/modules/social/domain/social'

const KEY = 'social.config.v1'

export async function getSocialSettings(): Promise<SocialSettings> {
  const stored = await readJsonSetting(KEY)
  return stored ? normalizeSocialSettings(stored, structuredClone(DEFAULT_SOCIAL)) : structuredClone(DEFAULT_SOCIAL)
}

export async function saveSocialSettings(input: Record<string, unknown>): Promise<SocialSettings> {
  return updateJsonSetting(KEY, async stored => {
    const previous = normalizeSocialSettings(stored, structuredClone(DEFAULT_SOCIAL))
    const next = normalizeSocialSettings(input, previous)
    if (next.instagram.accessToken !== previous.instagram.accessToken) next.instagram.accessToken = encryptPanelCredential(next.instagram.accessToken)
    for (const [key, value] of Object.entries(next)) stored[key] = value && typeof value === 'object' ? { ...(stored[key] as Record<string, unknown> || {}), ...value } : value
    return next
  })
}

export function publicSocialSettings(settings: SocialSettings) {
  return { ...settings, instagram: { ...settings.instagram, accessToken: '', hasToken: !!settings.instagram.accessToken } }
}

const absolute = (base: string, url: string) => (/^https?:\/\//.test(url) ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`)

/** Channels that should announce a type right now. */
function channelsFor(settings: SocialSettings, type: AnnounceType): Channel[] {
  if (!settings.types[type]) return []
  return [
    ...(settings.telegram.enabled && settings.telegram.channel ? ['TELEGRAM' as const] : []),
    ...(settings.instagram.enabled && settings.instagram.accountId && settings.instagram.accessToken ? ['INSTAGRAM' as const] : []),
    ...(settings.push.enabled ? ['PUSH' as const] : []),
  ]
}

/**
 * Queues announcements for newly published content (one per channel, never
 * twice — the unique key makes repeated saves harmless). `at` is the publish
 * time; scheduled content is announced when it goes live.
 */
export async function enqueueAnnouncement(ref: ItemRef, at: Date = new Date(), options: { force?: boolean; reschedulePending?: boolean; channels?: Channel[] } = {}) {
  if (!isAnnounceType(ref.type) || !await isModuleEnabled('social-publisher')) return []
  const settings = await getSocialSettings()
  const channels = options.channels || channelsFor(settings, ref.type)
  const due = new Date(Math.max(at.getTime(), Date.now()) + settings.delayMinutes * 60_000)
  const queued: Channel[] = []
  for (const channel of channels) {
    const where = { channel_itemType_itemId: { channel, itemType: ref.type, itemId: ref.id } }
    const existing = await db.socialPost.findUnique({ where })
    if (existing && !options.force && !(options.reschedulePending && ['PENDING', 'SKIPPED'].includes(existing.status))) continue
    const data = { status: 'PENDING', attempts: 0, error: '', nextAttemptAt: due, sentAt: null }
    await db.socialPost.upsert({ where, create: { channel, itemType: ref.type, itemId: ref.id, ...data }, update: data })
    queued.push(channel)
  }
  if (queued.length && due.getTime() <= Date.now() + 1000) void processSocialQueue().catch(() => undefined)
  return queued
}

/** Unpublishing a scheduled item prevents its pending external announcement. */
export async function cancelPendingAnnouncement(ref: ItemRef) {
  if (!isAnnounceType(ref.type)) return
  await db.socialPost.updateMany({ where: { itemType: ref.type, itemId: ref.id, status: 'PENDING' }, data: { status: 'SKIPPED', error: 'انتشار لغو شد' } })
}

type Sent = { externalId: string; text: string }

async function sendTelegram(settings: SocialSettings, item: ItemCard, url: string, base: string): Promise<Sent> {
  const config = await telegramConfig()
  if (!config.token) throw new Error('توکن ربات تلگرام در «ربات و مینی‌اپ» تنظیم نشده است')
  const type = item.type as AnnounceType
  const vars = { type, title: item.title, subtitle: item.subtitle, summary: item.summary, url, hashtags: [hashtag(item.subtitle.split('·')[0] || ''), '#موبوکام'].filter(Boolean).join(' ') }
  const keyboard = settings.telegram.button ? { inline_keyboard: [[{ text: settings.telegram.button, url }]] } : undefined
  const common = { chat_id: settings.telegram.channel, parse_mode: 'HTML', disable_notification: settings.telegram.silent, ...(keyboard ? { reply_markup: keyboard } : {}) }
  if (item.image && settings.telegram.includeImage) {
    const caption = renderPost(settings.telegram.template, vars, { html: true, max: 1024 })
    const photoBody = new FormData()
    for (const [key, value] of Object.entries({ ...common, caption })) photoBody.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
    photoBody.set('photo', new Blob([await socialImage(item.image, base)], { type: 'image/jpeg' }), `${item.type}-${item.id}.jpg`)
    const photo = await bot<{ message_id: number }>('sendPhoto', photoBody, config)
    if (photo.ok) return { externalId: String(photo.result?.message_id || ''), text: caption }
    throw new Error('تلگرام تصویر شاخص را نپذیرفت؛ ارسال تصویری دوباره تلاش می‌شود')
  }
  const text = renderPost(settings.telegram.template, vars, { html: true, max: 4096 })
  const message = await bot<{ message_id: number }>('sendMessage', { ...common, text, link_preview_options: { url, prefer_large_media: true } }, config)
  if (!message.ok) throw new Error(`تلگرام: ${message.description || 'ارسال ناموفق'}`)
  return { externalId: String(message.result?.message_id || ''), text }
}

async function graph(version: string, path: string, params: Record<string, string>) {
  const response = await socialFetch(`https://graph.facebook.com/${version}/${path}`, { method: 'POST', body: new URLSearchParams(params), signal: AbortSignal.timeout(20_000), cache: 'no-store' })
  const data = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null
  if (!response.ok || !data?.id) throw new Error(`اینستاگرام: ${data?.error?.message || `HTTP ${response.status}`}`)
  return data.id
}

async function sendInstagram(settings: SocialSettings, item: ItemCard, url: string, base: string): Promise<Sent> {
  if (!item.image) throw new Error('اینستاگرام فقط پست تصویری می‌پذیرد و این مورد تصویر ندارد')
  if (!/^https:\/\//.test(base)) throw new Error('برای اینستاگرام، نشانی سایت باید https باشد تا تصویر قابل دریافت باشد')
  let token = ''
  try { token = decryptPanelCredential(settings.instagram.accessToken) } catch { throw new Error('توکن اینستاگرام قابل رمزگشایی نیست؛ دوباره ذخیره کنید') }
  const { accountId, graphVersion, template, hashtags } = settings.instagram
  const caption = renderPost(template, { type: item.type as AnnounceType, title: item.title, subtitle: item.subtitle, summary: item.summary, url, hashtags }, { max: 2200 })
  // Instagram needs a public JPEG; /api/social/image converts the cover to 1080×1350.
  const image = `${base}/api/social/image/${item.type}-${item.id}.jpg`
  const container = await graph(graphVersion, `${accountId}/media`, { image_url: image, caption, access_token: token })
  // Image containers are usually ready at once; wait briefly when they are not.
  for (let i = 0; i < 5; i++) {
    const status = await socialFetch(`https://graph.facebook.com/${graphVersion}/${container}?fields=status_code&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(10_000), cache: 'no-store' }).then((r) => r.json()).catch(() => null) as { status_code?: string } | null
    if (!status?.status_code || status.status_code === 'FINISHED') break
    if (status.status_code === 'ERROR') throw new Error('اینستاگرام تصویر را نپذیرفت')
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  const media = await graph(graphVersion, `${accountId}/media_publish`, { creation_id: container, access_token: token })
  return { externalId: media, text: caption }
}

async function sendPush(settings: SocialSettings, item: ItemCard, url: string): Promise<Sent> {
  const type = item.type as AnnounceType
  const vars = { type, title: item.title, subtitle: item.subtitle, summary: item.summary, url }
  const title = renderPost(settings.push.title, vars, { max: 120 })
  const body = renderPost(settings.push.body || '{subtitle}', vars, { max: 250 })
  const path = (() => { try { const u = new URL(url); return `${u.pathname}${u.search}` } catch { return item.url } })()
  const result = await broadcast({ title, body, url: path, image: item.image || undefined, tag: `new-${itemKey(item)}` }, 'ALL')
  return { externalId: `sent:${result.sent}/failed:${result.failed}`, text: `${title}\n${body}` }
}

let running: Promise<number> | null = null

/** Sends every due announcement (single flight). Returns how many were handled. */
export function processSocialQueue(limit = 20): Promise<number> {
  running ??= (async () => {
    try {
      if (!await isModuleEnabled('social-publisher')) return 0
      const due = await db.socialPost.findMany({ where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: 'asc' }, take: limit })
      if (!due.length) return 0
      const settings = await getSocialSettings()
      const base = await siteBase()
      for (const post of due) {
        // Claim the row so a parallel worker cannot send it twice.
        const claimed = await db.socialPost.updateMany({ where: { id: post.id, status: 'PENDING' }, data: { status: 'SENDING', attempts: { increment: 1 } } })
        if (!claimed.count) continue
        const channel = post.channel as Channel
        try {
          // Reading the item is part of the attempt: a failure here is retried with backoff like a failed send.
          const item = isAnnounceType(post.itemType) ? await itemCard({ type: post.itemType, id: post.itemId }) : null
          if (!item) {
            // Unpublished or deleted meanwhile: nothing to announce.
            await db.socialPost.update({ where: { id: post.id }, data: { status: 'SKIPPED', error: 'مورد منتشر نیست یا حذف شده است' } })
            continue
          }
          const url = withUtm(absolute(base, item.url), channel, settings.utm)
          const sent = channel === 'TELEGRAM' ? await sendTelegram(settings, item, url, base) : channel === 'INSTAGRAM' ? await sendInstagram(settings, item, url, base) : await sendPush(settings, item, url)
          await db.socialPost.update({ where: { id: post.id }, data: { status: 'SENT', sentAt: new Date(), externalId: sent.externalId, text: sent.text.slice(0, 5000), error: '' } })
        } catch (error) {
          const attempts = post.attempts + 1
          const message = error instanceof Error ? error.message : 'ارسال ناموفق'
          await db.socialPost.update({ where: { id: post.id }, data: attempts >= MAX_ATTEMPTS
            ? { status: 'FAILED', error: message.slice(0, 500) }
            : { status: 'PENDING', error: message.slice(0, 500), nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)) } })
          logEvent('warn', 'social.send_failed', { id: post.id, channel, attempts, error: message })
        }
      }
      return due.length
    } finally { running = null }
  })()
  return running
}

/**
 * Rows stuck in SENDING (process died mid-send) go back to the queue after 15 minutes.
 * A row that was interrupted on its last attempt is failed instead, so it stops retrying.
 */
export async function releaseStuckSocialPosts() {
  const stuck = { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } }
  await db.socialPost.updateMany({ where: { ...stuck, attempts: { gte: MAX_ATTEMPTS } }, data: { status: 'FAILED', error: 'ارسال در همهٔ تلاش‌ها ناتمام ماند' } })
  const { count } = await db.socialPost.updateMany({ where: stuck, data: { status: 'PENDING', nextAttemptAt: new Date() } })
  return count
}

export async function socialLog(page = 1) {
  const [total, rows] = await Promise.all([db.socialPost.count(), db.socialPost.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * 30, take: 30 })])
  const cards = new Map<string, ItemCard | null>()
  for (const row of rows) {
    const key = `${row.itemType}:${row.itemId}`
    if (!cards.has(key) && isAnnounceType(row.itemType)) cards.set(key, await itemCard({ type: row.itemType, id: row.itemId }))
  }
  return {
    total, page, pages: Math.ceil(total / 30),
    posts: rows.map((row) => {
      const card = cards.get(`${row.itemType}:${row.itemId}`)
      return { ...row, item: card ? { title: card.title, url: card.url } : null }
    }),
  }
}

/** Test message to the configured Telegram channel. */
export async function testTelegram() {
  const settings = await getSocialSettings()
  if (!settings.telegram.channel) throw new Error('نشانی کانال تلگرام را وارد کنید')
  const result = await bot('sendMessage', { chat_id: settings.telegram.channel, text: '✅ اتصال موبوکام به این کانال برقرار است.' })
  if (!result.ok) throw new Error(`تلگرام: ${result.description || 'ارسال ناموفق'}. ربات باید مدیر کانال باشد.`)
  return { ok: true }
}
