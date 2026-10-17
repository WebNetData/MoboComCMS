import { createHash } from 'node:crypto'
import dns from 'node:dns'
import fs from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import path from 'node:path'
import { db } from '@/platform/database/prisma'
import { env } from '@/platform/config/env'
import { checkRemoteUrl, isBlockedAddress, isLoopback } from '@/modules/imports/domain/net'
import { CoverImageError, storeCoverImage } from '@/modules/site/server/cover-store'

/**
 * Remote images of imported records go into the site's media library
 * (storage/covers, served at /api/media/covers/…) — no external address is
 * stored. Every URL is untrusted: only http(s) on standard ports, every DNS
 * answer is checked at connect time (so a rebinding name cannot reach an
 * internal address), redirects are followed by hand and re-checked, and
 * size, time, type and the decoded image itself are verified. Each address
 * and each distinct image content is stored once.
 */

export const MEDIA_LIMITS = { bytes: 15 * 1024 * 1024, timeoutMs: 20_000, redirects: 3, pixels: 60_000_000, attempts: 3 }
const OWN = /^\/api\/media\/covers\/[0-9a-f-]{36}\.(webp|png|jpg)$/
// Test-only: lets the integration test's local image server (loopback only) be reached; never honoured in production.
const allowLoopback = () => env('IMPORT_ALLOW_LOOPBACK') === '1' && process.env.NODE_ENV !== 'production'
const refused = (address: string) => isBlockedAddress(address) && !(allowLoopback() && isLoopback(address))

export class MediaError extends Error {
  constructor(message: string, readonly retry = false) { super(message) }
}

/** DNS lookup that refuses internal addresses, used by the socket itself (no gap between check and connect). */
function guardedLookup(hostname: string, options: dns.LookupOptions, callback: (error: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, '')
    const list = addresses as dns.LookupAddress[]
    if (!list.length) return callback(new MediaError('نام میزبان پیدا نشد'), '')
    if (list.some((entry) => refused(entry.address))) return callback(new MediaError('نشانی به شبکهٔ داخلی اشاره می‌کند و مسدود شد'), '')
    if (options.all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

type Fetched = { bytes: Buffer; type: string; finalUrl: string }
function imageUrl(raw: string) {
  try { return checkRemoteUrl(raw, { allowLoopback: allowLoopback() }) }
  catch (error) { throw new MediaError(error instanceof Error ? error.message : 'نشانی تصویر معتبر نیست') }
}

function requestOnce(url: URL): Promise<{ status: number; location: string; type: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const literal = url.hostname.replace(/^\[|\]$/g, '')
    if (net.isIP(literal) && refused(literal)) return reject(new MediaError('نشانی شبکهٔ داخلی مجاز نیست'))
    const req = client.request(url, {
      method: 'GET', lookup: guardedLookup as never, timeout: MEDIA_LIMITS.timeoutMs,
      headers: { 'User-Agent': 'MoboComCMS-Importer/1.0', Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1' },
    }, (res) => {
      const status = res.statusCode || 0
      if (status >= 300 && status < 400) { res.resume(); return resolve({ status, location: String(res.headers.location || ''), type: '', body: Buffer.alloc(0) }) }
      const declared = Number(res.headers['content-length'] || 0)
      if (declared > MEDIA_LIMITS.bytes) { res.destroy(); return reject(new MediaError('حجم تصویر بیش از حد مجاز است')) }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MEDIA_LIMITS.bytes) { res.destroy(); reject(new MediaError('حجم تصویر بیش از حد مجاز است')) } else chunks.push(chunk)
      })
      res.on('end', () => resolve({ status, location: '', type: String(res.headers['content-type'] || ''), body: Buffer.concat(chunks) }))
      res.on('error', (error) => reject(new MediaError(`دریافت قطع شد: ${error.message}`, true)))
    })
    const deadline = setTimeout(() => req.destroy(new MediaError('زمان دریافت تصویر تمام شد', true)), MEDIA_LIMITS.timeoutMs)
    req.on('timeout', () => req.destroy(new MediaError('زمان دریافت تصویر تمام شد', true)))
    req.on('error', (error) => reject(error instanceof MediaError ? error : new MediaError(`اتصال برقرار نشد: ${error.message}`, true)))
    req.on('close', () => clearTimeout(deadline))
    req.end()
  })
}

/** GET with every hop checked; the final response must be a success. */
export async function safeFetch(raw: string): Promise<Fetched> {
  let url = imageUrl(raw)
  for (let hop = 0; hop <= MEDIA_LIMITS.redirects; hop++) {
    const res = await requestOnce(url)
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new MediaError('تغییر مسیر بدون مقصد')
      if (hop === MEDIA_LIMITS.redirects) throw new MediaError('تعداد تغییر مسیرها بیش از حد مجاز است')
      url = imageUrl(new URL(res.location, url).toString())
      continue
    }
    if (res.status >= 500 || res.status === 429) throw new MediaError(`سرور تصویر خطا داد (${res.status})`, true)
    if (res.status < 200 || res.status >= 300) throw new MediaError(`تصویر دریافت نشد (${res.status})`)
    return { bytes: res.body, type: res.type, finalUrl: url.toString() }
  }
  throw new MediaError('تعداد تغییر مسیرها بیش از حد مجاز است')
}

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
/** The address as a key: scheme and host in lower case, fragment dropped. */
export const sourceKey = (raw: string) => { try { const url = new URL(raw); url.hash = ''; return sha256(url.toString()) } catch { return sha256(raw) } }

/** Remote bytes → the site's content-image store (same checks and processing as an admin upload, strict). */
async function storeImage(bytes: Buffer, type: string): Promise<string> {
  if (type && !/^image\//i.test(type) && !/octet-stream/i.test(type)) throw new MediaError(`نوع فایل تصویر نیست (${type.slice(0, 40)})`)
  try { return await storeCoverImage(bytes, { strict: true }) } catch (error) {
    throw new MediaError(error instanceof CoverImageError ? error.message : 'تصویر ذخیره نشد')
  }
}

const exists = (url: string) => fs.access(path.join(process.cwd(), 'storage', 'covers', url.split('/').pop() || '')).then(() => true, () => false)

export type MediaResult = { url: string; reused: boolean }

/**
 * An image address → an address in the media library. Site images are kept;
 * a known address or an identical picture is reused; transient failures are
 * retried a few times with a pause.
 */
export async function importImage(raw: string): Promise<MediaResult> {
  if (OWN.test(raw)) return { url: raw, reused: true }
  if (raw.startsWith('/')) throw new MediaError('فقط تصاویر کتابخانهٔ سایت یا نشانی http(s) پذیرفته می‌شود')
  const key = sourceKey(raw)
  const known = await db.importMedia.findUnique({ where: { sourceHash: key } })
  if (known && await exists(known.localUrl)) return { url: known.localUrl, reused: true }
  let fetched: Fetched | null = null
  let lastError: unknown = null
  for (let attempt = 1; attempt <= MEDIA_LIMITS.attempts && !fetched; attempt++) {
    try { fetched = await safeFetch(raw) } catch (error) {
      lastError = error
      if (!(error instanceof MediaError && error.retry) || attempt === MEDIA_LIMITS.attempts) break
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt * attempt))
    }
  }
  if (!fetched) throw lastError instanceof Error ? lastError : new MediaError('تصویر دریافت نشد')
  const contentHash = sha256(fetched.bytes)
  const same = await db.importMedia.findFirst({ where: { contentHash }, orderBy: { id: 'asc' } })
  const localUrl = same && await exists(same.localUrl) ? same.localUrl : await storeImage(fetched.bytes, fetched.type)
  await db.importMedia.upsert({
    where: { sourceHash: key },
    create: { sourceHash: key, sourceUrl: raw.slice(0, 2000), contentHash, localUrl },
    update: { contentHash, localUrl },
  })
  return { url: localUrl, reused: !!same }
}

/** Addresses already in the library (for the dry run's "images to download" count). */
export async function knownSources(urls: string[]): Promise<Set<string>> {
  const remote = urls.filter((url) => !OWN.test(url))
  if (!remote.length) return new Set(urls)
  const keys = remote.map(sourceKey)
  const rows = await db.importMedia.findMany({ where: { sourceHash: { in: keys } }, select: { sourceHash: true } })
  const known = new Set(rows.map((row) => row.sourceHash))
  return new Set([...urls.filter((url) => OWN.test(url)), ...remote.filter((url) => known.has(sourceKey(url)))])
}
