import webpush from 'web-push'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { isModuleEnabled } from '@/extensions/server/modules'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'

/**
 * Web Push (VAPID). Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when
 * set, otherwise a pair is generated once and stored with the private key
 * encrypted. Dead subscriptions (404/410, repeated failures) are pruned.
 */

const KEY = 'push.vapid.v1'
const CONFIG_KEY = 'push.config.v1'

export type PushPayload = { title: string; body?: string; url?: string; image?: string; tag?: string }
export type PushAudience = 'ALL' | 'USERS' | 'VIP' | 'GUESTS'
export type PushConfig = { accountEvents: boolean }

type Vapid = { publicKey: string; privateKey: string; subject: string }
let cachedVapid: Vapid | null = null

async function vapid(): Promise<Vapid> {
  if (cachedVapid) return cachedVapid
  const subject = process.env.VAPID_SUBJECT || `mailto:${process.env.SUPPORT_EMAIL || 'admin@example.com'}`
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cachedVapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject }
    return cachedVapid
  }
  const stored = await readJsonSetting(KEY)
  if (stored?.publicKey && stored?.privateKey) {
    cachedVapid = { publicKey: String(stored.publicKey), privateKey: decryptPanelCredential(String(stored.privateKey)), subject }
    return cachedVapid
  }
  const keys = webpush.generateVAPIDKeys()
  await writeJsonSetting(KEY, { publicKey: keys.publicKey, privateKey: encryptPanelCredential(keys.privateKey), createdAt: new Date().toISOString() })
  cachedVapid = { ...keys, subject }
  return cachedVapid
}

export async function publicVapidKey(): Promise<string> {
  return (await vapid()).publicKey
}

export async function getPushConfig(): Promise<PushConfig> {
  const stored = await readJsonSetting(CONFIG_KEY)
  return { accountEvents: stored?.accountEvents !== false }
}

export async function savePushConfig(input: Record<string, unknown>): Promise<PushConfig> {
  const next = { accountEvents: input.accountEvents !== false }
  await writeJsonSetting(CONFIG_KEY, next)
  return next
}

const ENDPOINT = /^https:\/\/[^\s]{10,2000}$/
const B64URL = /^[A-Za-z0-9_-]{10,200}={0,2}$/

/** Stores (or re-links) a browser subscription. */
export async function subscribe(input: { endpoint: unknown; keys?: { p256dh?: unknown; auth?: unknown }; userId: number | null; userAgent: string }) {
  const endpoint = String(input.endpoint || '')
  const p256dh = String(input.keys?.p256dh || '')
  const auth = String(input.keys?.auth || '')
  if (!ENDPOINT.test(endpoint) || !B64URL.test(p256dh) || !B64URL.test(auth)) throw new Error('invalid subscription')
  const data = { p256dh, auth, userId: input.userId, userAgent: input.userAgent.slice(0, 200), failures: 0 }
  await db.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, ...data }, update: data })
  return { subscribed: true }
}

export async function unsubscribe(endpoint: unknown) {
  await db.pushSubscription.deleteMany({ where: { endpoint: String(endpoint || '') } })
  return { subscribed: false }
}

type Target = { id: number; endpoint: string; p256dh: string; auth: string }

/** Sends to many subscriptions with bounded concurrency; only transient failures need a retry. */
async function deliver(targets: Target[], payload: PushPayload): Promise<{ sent: number; failed: number; retryable: number }> {
  if (!targets.length) return { sent: 0, failed: 0, retryable: 0 }
  const keys = await vapid()
  const body = JSON.stringify({ title: payload.title.slice(0, 120), body: (payload.body || '').slice(0, 300), url: payload.url || '/', image: payload.image || undefined, tag: payload.tag })
  let sent = 0
  let failed = 0
  const gone: number[] = []
  const flaky: number[] = []
  const ok: number[] = []
  for (let i = 0; i < targets.length; i += 25) {
    await Promise.all(targets.slice(i, i + 25).map(async (target) => {
      try {
        await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, body, {
          vapidDetails: keys, TTL: 60 * 60 * 24, urgency: 'normal', timeout: 10_000,
        })
        sent++; ok.push(target.id)
      } catch (error) {
        failed++
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) gone.push(target.id)
        else flaky.push(target.id)
      }
    }))
  }
  await Promise.all([
    gone.length ? db.pushSubscription.deleteMany({ where: { id: { in: gone } } }) : null,
    flaky.length ? db.pushSubscription.updateMany({ where: { id: { in: flaky } }, data: { failures: { increment: 1 } } }) : null,
    ok.length ? db.pushSubscription.updateMany({ where: { id: { in: ok } }, data: { failures: 0, lastSuccessAt: new Date() } }) : null,
  ])
  // A subscription that failed 5 times in a row is abandoned.
  await db.pushSubscription.deleteMany({ where: { failures: { gte: 5 } } })
  return { sent, failed, retryable: flaky.length }
}

const select = { id: true, endpoint: true, p256dh: true, auth: true } as const

/** Account notification to one member's browsers (used by its queued channel job). */
export async function pushToUser(userId: number, payload: PushPayload) {
  if (!await isModuleEnabled('web-push')) return { sent: 0, failed: 0, retryable: 0 }
  if (!(await getPushConfig()).accountEvents) return { sent: 0, failed: 0, retryable: 0 }
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, pushAlerts: true } })
  if (!user || user.status !== 'ACTIVE' || !user.pushAlerts) return { sent: 0, failed: 0, retryable: 0 }
  if (!await (await import('@/modules/notifications/server/preferences')).isNotificationChannelEnabled(userId, payload.tag || '', 'push')) return { sent: 0, failed: 0, retryable: 0 }
  const targets = await db.pushSubscription.findMany({ where: { userId }, select, take: 20 })
  return deliver(targets, payload).catch((error) => { logEvent('error', 'push.user_failed', { userId, error }); return { sent: 0, failed: targets.length, retryable: targets.length } })
}

async function audienceWhere(audience: PushAudience) {
  if (audience === 'USERS') return { userId: { not: null } }
  if (audience === 'GUESTS') return { userId: null }
  if (audience === 'VIP') {
    const members = await db.userMembership.findMany({ where: { revokedAt: null, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } }, select: { userId: true } })
    return { userId: { in: [...new Set(members.map((row) => row.userId))] } }
  }
  return {}
}

/** Sends to an audience in pages of 500 subscriptions. */
export async function broadcast(payload: PushPayload, audience: PushAudience = 'ALL') {
  const where = await audienceWhere(audience)
  let cursor = 0
  const total = { sent: 0, failed: 0 }
  for (;;) {
    const page = await db.pushSubscription.findMany({ where: { ...where, id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 500, select })
    if (!page.length) break
    const result = await deliver(page, payload)
    total.sent += result.sent
    total.failed += result.failed
    cursor = page[page.length - 1].id
  }
  return total
}

export async function pushStats() {
  const [total, users, recent] = await Promise.all([
    db.pushSubscription.count(),
    db.pushSubscription.count({ where: { userId: { not: null } } }),
    db.pushCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
  ])
  return { total, users, guests: total - users, campaigns: recent }
}

/** Admin broadcast, logged as a campaign. */
export async function sendCampaign(input: { title: unknown; body: unknown; url: unknown; audience: unknown; createdBy: number }) {
  const title = String(input.title || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120)
  const body = String(input.body || '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, 300)
  const rawUrl = String(input.url || '/').trim()
  const url = /^\/(?!\/)[^\s]*$/.test(rawUrl) ? rawUrl.slice(0, 500) : '/'
  const audience = (['ALL', 'USERS', 'VIP', 'GUESTS'] as const).find((value) => value === input.audience) || 'ALL'
  if (title.length < 3) throw new Error('عنوان اعلان دست‌کم ۳ حرف باشد')
  const result = await broadcast({ title, body, url, tag: `campaign-${Date.now()}` }, audience)
  await db.pushCampaign.create({ data: { title, body, url, audience, sent: result.sent, failed: result.failed, createdBy: input.createdBy } })
  return result
}
