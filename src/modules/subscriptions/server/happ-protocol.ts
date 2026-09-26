import { createHash } from 'crypto'
import { db } from '@/platform/database/prisma'
import { upstreamUrl } from '@/modules/subscriptions/domain/subscription-content'
import { siteBaseUrl } from '@/modules/site/server/site-url'

export const HAPP_ENCRYPTION_API = 'https://crypto.happ.su/api-v2.php'
export const HAPP_SETUP_MESSAGE = 'VPN Panel باید برای کاربر یک لینک اشتراک عمومی HTTPS برگرداند.'
const pending = new Map<string, Promise<string>>()

export function isEncryptedHappLink(value: unknown): value is string {
  return typeof value === 'string' && /^happ:\/\/crypt5\/[A-Za-z0-9+/_=-]+$/.test(value) && value.length < 16000
}

/** Official Happ encryptor. Only the panel subscription URL is sent, never VPN configs. */
export async function encryptHappUrl(source: string): Promise<string> {
  const url = new URL(source)
  if (url.protocol !== 'https:' || url.hostname === 'localhost' || /^[\d.:]+$/.test(url.hostname) || url.hostname.endsWith('.local')) throw Error(HAPP_SETUP_MESSAGE)
  const response = await fetch(HAPP_ENCRYPTION_API, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: source }), signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store',
  })
  if (!response.ok) throw Error('سرویس رمزگذاری Happ موقتاً در دسترس نیست.')
  const data = await response.json()
  if (!isEncryptedHappLink(data?.encrypted_link)) throw Error('سرویس Happ لینک معتبری برنگرداند.')
  return data.encrypted_link
}

/**
 * The canonical customer subscription URL is always the URL returned by the
 * VPN panel. The shop domain is explicitly rejected so a panel cannot silently
 * fall back to one of MoboComCMS's mirror/proxy routes.
 */
export async function panelSubscriptionUrl(token: string): Promise<string> {
  const sub = await db.subscription.findUnique({ where: { subToken: token }, select: { panelSubUrl: true } })
  if (!sub) throw Error('اشتراک یافت نشد.')

  const source = upstreamUrl(String(sub.panelSubUrl || ''), await siteBaseUrl())
  if (!source) throw Error(HAPP_SETUP_MESSAGE)
  const url = new URL(source)
  if (url.protocol !== 'https:') throw Error(HAPP_SETUP_MESSAGE)
  return url.href
}

/** Safe variant for customer/API surfaces that should return an empty URL on panel misconfiguration. */
export async function safePanelSubscriptionUrl(token: string): Promise<string> {
  try { return await panelSubscriptionUrl(token) } catch { return '' }
}

/**
 * Build Happ's official crypt5 deep link from the VPN panel's own subscription
 * URL. No shop-domain `/s/*` or `/api/happ/sub/*` URL is used as its source.
 */
export async function happImportUrl(token: string): Promise<string> {
  const source = await panelSubscriptionUrl(token)
  const key = `happ.crypt5.${createHash('sha256').update(source).digest('hex')}`
  const current = pending.get(key)
  if (current) return current
  const job = (async () => {
    const cached = await db.setting.findUnique({ where: { key } })
    if (isEncryptedHappLink(cached?.value)) return cached.value
    const value = await encryptHappUrl(source)
    await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
    return value
  })()
  pending.set(key, job)
  try { return await job } finally { pending.delete(key) }
}

/** Failure is shown by the connection screen, never replaced with a shop URL. */
export async function safeHappLink(token: string): Promise<string> {
  try { return await happImportUrl(token) } catch { return '' }
}

/** A client filter, not cryptographic client authentication. */
export function isHappClient(headers: Headers): boolean {
  return /^Happ(?:\/|\s)/i.test(headers.get('user-agent') || '')
}
