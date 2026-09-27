import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { cache } from 'react'
import { db } from '@/platform/database/prisma'
import { authSecret } from '@/platform/config/env'
import { clientIp } from '@/platform/http/rate-limit'
import { visitorHash } from '@/platform/http/visitor'
import { isModuleEnabled } from '@/extensions/server/modules'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import {
  DEFAULT_DOWNLOAD_SETTINGS, dailyLimit, hostMatches, nginxExpression, normalizeDownloadSettings, splitToken, tokenPayload,
  type DownloadSettings,
} from '@/modules/downloads/domain/downloads'

const KEY = 'downloads.config.v1'

export const getDownloadSettings = cache(async (): Promise<DownloadSettings> => {
  const stored = await readJsonSetting(KEY)
  return stored ? normalizeDownloadSettings(stored, { ...DEFAULT_DOWNLOAD_SETTINGS, hosts: [] }) : structuredClone(DEFAULT_DOWNLOAD_SETTINGS)
})

/** Saves admin input. New host secrets are encrypted; blank secrets keep the stored ones. */
export async function saveDownloadSettings(input: Record<string, unknown>): Promise<DownloadSettings> {
  const previous = await getDownloadSettings()
  const next = normalizeDownloadSettings(input, previous)
  next.hosts = next.hosts.map((host) => {
    const kept = previous.hosts.find((item) => item.host === host.host)
    return { ...host, secret: host.secret === kept?.secret ? host.secret : encryptPanelCredential(host.secret) }
  })
  await writeJsonSetting(KEY, next)
  return next
}

/** Settings safe for the admin UI: secrets are reduced to "configured or not". */
export function publicDownloadSettings(settings: DownloadSettings) {
  return { ...settings, hosts: settings.hosts.map((host) => ({ ...host, secret: '', hasSecret: !!host.secret })) }
}

export const downloadGuardEnabled = () => isModuleEnabled('download-guard')

// ------------------------------------------------------------------ page tokens

const sign = (payload: string) => createHmac('sha256', authSecret()).update(payload).digest('base64url').slice(0, 27)

/** Signed "?t=" token for a download button. `linkKey` is "l12" for links or "t7" for tracks. */
export function pageToken(linkKey: string, userId: number | null, ttlMinutes: number, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + ttlMinutes * 60
  return `${expires.toString(36)}.${sign(tokenPayload(linkKey, expires, userId))}`
}

export type TokenCheck = 'ok' | 'missing' | 'invalid' | 'expired'

export function checkPageToken(token: string | null, linkKey: string, userId: number | null, now = Date.now()): TokenCheck {
  if (!token) return 'missing'
  const parts = splitToken(token)
  if (!parts) return 'invalid'
  const expected = Buffer.from(sign(tokenPayload(linkKey, parts.expires, userId)))
  const actual = Buffer.from(parts.signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return 'invalid'
  return parts.expires * 1000 < now ? 'expired' : 'ok'
}

/** Download href for a media link, with a token when protection is on. */
export async function linkHref(linkId: number, userId: number | null): Promise<string> {
  if (!await downloadGuardEnabled()) return `/api/media/link/${linkId}`
  const settings = await getDownloadSettings()
  return settings.enforceTokens ? `/api/media/link/${linkId}?t=${pageToken(`l${linkId}`, userId, settings.tokenTtlMinutes)}` : `/api/media/link/${linkId}`
}

export async function trackDownloadHref(trackId: number, userId: number | null, hq: boolean): Promise<string> {
  const base = `/api/media/track/${trackId}?dl=1${hq ? '&q=hq' : ''}`
  if (!await downloadGuardEnabled()) return base
  const settings = await getDownloadSettings()
  return settings.enforceTokens ? `${base}&t=${pageToken(`t${trackId}`, userId, settings.tokenTtlMinutes)}` : base
}

// ------------------------------------------------------------------ origin signing

/**
 * Returns the file URL to redirect to. For hosts with a signing rule the URL
 * gets an expiring signature the download server verifies, so the redirect
 * target cannot be reshared either.
 */
export function signOriginUrl(rawUrl: string, settings: DownloadSettings, headers: Headers, now = Date.now()): string {
  let url: URL
  try { url = new URL(rawUrl) } catch { return rawUrl }
  const rule = settings.hosts.find((host) => hostMatches(host.host, url.hostname))
  if (!rule || !rule.secret) return rawUrl
  let secret = ''
  try { secret = decryptPanelCredential(rule.secret) } catch { return rawUrl }
  if (!secret) return rawUrl
  const expires = Math.floor(now / 1000) + rule.ttlMinutes * 60
  let uri = url.pathname
  try { uri = decodeURIComponent(url.pathname) } catch { /* keep encoded path */ }
  if (rule.method === 'nginx') {
    const plain = nginxExpression(rule.expression, { expires, uri, ip: clientIp(headers), secret })
    url.searchParams.set(rule.tokenParam, createHash('md5').update(plain).digest('base64url'))
  } else {
    url.searchParams.set(rule.tokenParam, createHmac('sha256', secret).update(`${uri}:${expires}`).digest('hex'))
  }
  url.searchParams.set(rule.expiresParam, String(expires))
  return url.toString()
}

// ------------------------------------------------------------------ limits & log

export type Downloader = { userId: number | null; member: boolean; visitor: string }

export function downloaderOf(headers: Headers, viewer: { userId: number | null; member: boolean }): Downloader {
  return { ...viewer, visitor: visitorHash(headers) }
}

/** Remaining downloads in the rolling 24 hours, or null when unlimited. */
export async function remainingDownloads(settings: DownloadSettings, who: Downloader): Promise<number | null> {
  const limit = dailyLimit(settings, who)
  if (!limit) return null
  const since = new Date(Date.now() - 86_400_000)
  const used = await db.downloadLog.count({ where: { createdAt: { gte: since }, ...(who.userId ? { userId: who.userId } : { userId: null, visitor: who.visitor }) } })
  return Math.max(0, limit - used)
}

export async function logDownload(who: Downloader, entry: { linkId?: number; ownerType: string; ownerId: number }) {
  await db.downloadLog.create({ data: { linkId: entry.linkId ?? null, ownerType: entry.ownerType, ownerId: entry.ownerId, userId: who.userId, visitor: who.visitor } }).catch(() => undefined)
}

/** Deletes download logs older than `days` (they feed limits and 90-day stats). */
export async function pruneDownloadLogs(days = 120) {
  const { count } = await db.downloadLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } } })
  return count
}
