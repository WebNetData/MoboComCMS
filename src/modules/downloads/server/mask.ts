import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { authSecret } from '@/platform/config/env'
import { logEvent } from '@/platform/observability/logger'
import { getSettings } from '@/modules/settings/server'
import { getDownloadSettings } from '@/modules/downloads/server/guard'
import { contentTypeFor, decodeNamePath, dispositionFor, encodeName, fileNameOf, resolveSibling, shouldMask } from '@/modules/downloads/domain/mask'
import { downloadFileName } from '@/modules/downloads/domain/scrub'
import { cleanedCopy, serveCleaned, type FileTags } from '@/modules/downloads/server/clean'
import { resolveCurrentUser } from '@/modules/identity/server/access'

// Masked file links (/dl/<token>/<name>): the real URL of a file on another
// host is encrypted into the token (AES-256-GCM, so it cannot be read or
// forged) together with an expiry; this site streams the file to the
// visitor, forwarding range requests so downloads can resume and video/audio
// can seek. Visitors only ever see this site's domain.

type Payload = { u: string; e: number; d: 0 | 1; n: string; m?: FileTags; a?: number }

const key = () => createHash('sha256').update(`${authSecret()}:masked-file-links:v1`).digest()

export function sealLink(payload: Payload): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

export function openLink(token: string): Payload | null {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < 29) return null
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    const payload = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as Payload
    return typeof payload.u === 'string' && typeof payload.e === 'number'
      && (payload.a === undefined || (Number.isSafeInteger(payload.a) && payload.a > 0)) ? payload : null
  } catch { return null }
}

async function siteBrand() {
  const settings = await getSettings().catch(() => ({} as Record<string, string>))
  return settings.brandName || ''
}

async function siteHost() {
  const settings = await getSettings().catch(() => ({} as Record<string, string>))
  for (const candidate of [settings.siteUrl, process.env.NEXTAUTH_URL]) {
    try { if (candidate) return new URL(candidate).hostname } catch { /* next */ }
  }
  return ''
}

/** What the file is, for its saved name (see the rename pattern in the download settings). */
export type FileContext = { title?: string; label?: string; quality?: string }

/**
 * The address to send a visitor to for a file: a masked /dl/ path on this
 * domain when the file lives elsewhere (and masking is on), otherwise the URL
 * itself. `download` makes the browser save the file; otherwise it plays inline.
 * The file is saved under this site's name for it, not the source's file name.
 */
export async function maskedHref(rawUrl: string, options: { download: boolean; name?: string; context?: FileContext; tags?: FileTags; userId?: number | null }): Promise<string> {
  const settings = await getDownloadSettings()
  if (!shouldMask(rawUrl, { mode: settings.maskMode, siteHost: await siteHost(), exclude: settings.maskExclude })) return rawUrl
  const original = fileNameOf(rawUrl)
  const name = options.name || downloadFileName({
    pattern: options.context?.title ? settings.renamePattern : '', original, words: settings.scrubWords,
    title: options.context?.title, label: options.context?.label, quality: options.context?.quality, site: await siteBrand(),
  })
  if (options.userId != null && (!Number.isSafeInteger(options.userId) || options.userId <= 0)) throw new Error('Invalid masked-link account')
  const token = sealLink({ u: rawUrl, e: Math.floor(Date.now() / 1000) + settings.maskTtlHours * 3600, d: options.download ? 1 : 0, n: name, ...(options.download && options.tags ? { m: options.tags } : {}), ...(options.userId != null ? { a: options.userId } : {}) })
  return `/dl/${token}/${encodeName(name)}`
}

// ------------------------------------------------------------------ streaming

const PASS = ['content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']
const notFound = (status = 404, text = 'فایل پیدا نشد یا لینک منقضی شده است.') =>
  new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } })

/** GET/HEAD /dl/:token/:name… */
export async function serveMasked(req: Request, token: string, nameSegments: string[]): Promise<Response> {
  const payload = openLink(token)
  if (!payload) return notFound()
  if (payload.e * 1000 < Date.now()) return notFound(410, 'این لینک منقضی شده است؛ دوباره از صفحهٔ دانلود اقدام کنید.')
  // Possession still authorizes this expiring link; human-bound grants use current account facts.
  // Legacy/guest tokens contain no account claim and cannot be relinked by guessing identity.
  if (payload.a !== undefined && !await resolveCurrentUser(payload.a, undefined)) {
    return notFound(423, 'دسترسی حساب مالک به این لینک فعلاً مجاز نیست.')
  }
  const requested = decodeNamePath(nameSegments)
  const target = resolveSibling(payload.u, payload.n, requested === payload.n ? '' : requested)
  if (!target) return notFound()
  const name = requested && requested !== payload.n ? requested.split('/').pop() || payload.n : payload.n

  // Downloads of a kind the admin chose to clean come from a cleaned copy on this server.
  if (payload.d === 1 && target === payload.u && (req.method === 'GET' || req.method === 'HEAD')) {
    const cleaned = await cleanedCopy({ url: target }, name, payload.m || {}).catch(() => null)
    if (cleaned) {
      const response = await serveCleaned(req, cleaned, name, true)
      if (payload.a !== undefined) response.headers.set('Cache-Control', 'private, no-store')
      return response
    }
  }

  const headers: Record<string, string> = { Accept: '*/*', 'User-Agent': req.headers.get('user-agent') || 'Mozilla/5.0' }
  const range = req.headers.get('range')
  if (range && /^bytes=[\d,\s-]+$/.test(range)) headers.Range = range
  const ifRange = req.headers.get('if-range')
  if (ifRange && range) headers['If-Range'] = ifRange
  let upstream: Response
  try {
    upstream = await fetch(target, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers, redirect: 'follow', cache: 'no-store', signal: req.signal })
  } catch (error) {
    if (!req.signal.aborted) logEvent('warn', 'downloads.mask_upstream_failed', { host: new URL(target).hostname, error: String(error).slice(0, 200) })
    return notFound(502, 'سرور فایل در دسترس نیست؛ کمی بعد دوباره تلاش کنید.')
  }
  if (upstream.status === 416) return new Response(null, { status: 416, headers: { 'Content-Range': upstream.headers.get('content-range') || '' } })
  if (!upstream.ok) {
    // 403/451/429 from a file host usually mean it blocks this server (foreign IP, hotlink protection):
    // the fix is to link that host directly (admin → downloads → "link directly").
    logEvent('warn', 'downloads.mask_upstream_status', { host: new URL(target).hostname, status: upstream.status, hint: upstream.status === 403 || upstream.status === 451 ? 'host blocks this server; add it to the direct-link list in admin downloads' : undefined })
    await upstream.body?.cancel().catch(() => undefined)
    return notFound(upstream.status === 404 || upstream.status === 410 ? 404 : 502, upstream.status === 404 ? 'فایل روی سرور پیدا نشد.' : 'سرور فایل پاسخ نداد؛ کمی بعد دوباره تلاش کنید.')
  }
  const out = new Headers()
  for (const header of PASS) { const value = upstream.headers.get(header); if (value) out.set(header, value) }
  if (!out.has('accept-ranges')) out.set('Accept-Ranges', 'bytes')
  out.set('Content-Type', contentTypeFor(name, upstream.headers.get('content-type')))
  out.set('Content-Disposition', dispositionFor(name, payload.d === 1))
  out.set('Cache-Control', payload.a === undefined ? 'private, max-age=3600' : 'private, no-store')
  out.set('X-Content-Type-Options', 'nosniff')
  out.set('X-Robots-Tag', 'noindex, nofollow')
  out.set('Referrer-Policy', 'no-referrer')
  // Stream straight through nginx instead of buffering big files to its disk.
  out.set('X-Accel-Buffering', 'no')
  return new Response(req.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: out })
}
