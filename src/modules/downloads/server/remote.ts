import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { Transform, type Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { checkRemoteUrl, isBlockedAddress, isLoopback } from '@/shared/media/net'

const allowLoopback = () => process.env.NODE_ENV !== 'production' && process.env.IMPORT_ALLOW_LOOPBACK === '1'
const refused = (ip: string) => isBlockedAddress(ip) && !(allowLoopback() && isLoopback(ip))
const lookup: typeof dns.lookup = ((host: string, options: dns.LookupOptions, callback: (e: Error | null, address: string | dns.LookupAddress[], family?: number) => void) => {
  dns.lookup(host, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, '')
    if (!addresses.length || addresses.some(a => refused(a.address))) return callback(new Error('دسترسی به شبکهٔ داخلی مجاز نیست'), '')
    if (options.all) callback(null, addresses)
    else callback(null, addresses[0].address, addresses[0].family)
  })
}) as typeof dns.lookup

const TOO_LARGE = 'فایل از سقف حجم انتقال بزرگ‌تر است'

/** One GET through the guard, following at most three redirects; every hop is checked. A non-2xx answer is refused. */
async function open(start: URL, signal: AbortSignal, headers: Record<string, string> = {}, checkpoint?: () => Promise<void>, agent?: http.Agent) {
  let url = start
  for (let hop = 0; hop <= 3; hop++) {
    const literal = url.hostname.replace(/^\[|\]$/g, '')
    if (net.isIP(literal) && refused(literal)) throw new Error('دسترسی به شبکهٔ داخلی مجاز نیست')
    await checkpoint?.()
    const target = url
    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = (target.protocol === 'https:' ? https : http).request(target, { lookup, signal, agent: agent ?? false, headers: { 'User-Agent': 'MoboCom-Media/1.0', Accept: '*/*', 'Accept-Encoding': 'identity', ...headers } }, resolve)
      req.on('error', reject); req.end()
    })
    const status = response.statusCode || 0
    if (status >= 300 && status < 400) {
      const location = response.headers.location
      response.destroy()
      if (!location || hop === 3) throw new Error('تعداد تغییر مسیرها بیش از حد مجاز است')
      url = checkRemoteUrl(new URL(location, url).toString(), { allowLoopback: allowLoopback() }); continue
    }
    if (status < 200 || status >= 300) { response.destroy(); throw new Error(`دریافت فایل انجام نشد (${status})`) }
    return { response, url }
  }
  throw new Error('تغییر مسیر نامعتبر است')
}

/** "bytes 0-99/1234" → its first byte and the whole size; anything else → null. */
function contentRange(response: http.IncomingMessage) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(response.headers['content-range'] || '').trim())
  return match ? { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) } : null
}

/** Exactly `size` bytes of a response, or an error: a part that arrives short or long is never passed on. */
async function readExactly(response: http.IncomingMessage, size: number) {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of response as AsyncIterable<Buffer>) {
    length += chunk.length
    if (length > size) { response.destroy(); throw new Error('بخش دریافتی فایل بزرگ‌تر از انتظار بود') }
    chunks.push(chunk)
  }
  if (length !== size) throw new Error('بخشی از فایل کامل دریافت نشد')
  return Buffer.concat(chunks, length)
}

/** Writes one part and waits while the reader is full; a reader that went away is an error, never a wait. */
function write(sink: Writable, part: Buffer) {
  return new Promise<void>((resolve, reject) => {
    if (sink.destroyed || sink.writableEnded) return reject(new Error('خواندن فایل متوقف شد'))
    if (sink.write(part)) return resolve()
    const settle = (error?: Error) => { sink.off('drain', drained); sink.off('close', closed); sink.off('error', failed); if (error) reject(error); else resolve() }
    const drained = () => settle(), closed = () => settle(new Error('خواندن فایل متوقف شد')), failed = (error: Error) => settle(error)
    sink.once('drain', drained); sink.once('close', closed); sink.once('error', failed)
  })
}

const PART_BYTES = 8 * 1024 * 1024

/**
 * Connections kept open for many small range reads of one host (the subtitle lines of a file): each new socket still
 * resolves through the guard, a kept one stays on the address that was checked. Destroy it when done.
 */
export function rangeAgents() {
  const options = { keepAlive: true, maxSockets: 8, lookup } as const
  const agents = { http: new http.Agent(options), https: new https.Agent(options) }
  return { for: (url: URL) => url.protocol === 'https:' ? agents.https : agents.http, destroy: () => { agents.http.destroy(); agents.https.destroy() } }
}

/**
 * One byte range of a remote file through the guard: exactly those bytes, or an error. A host that answers with the
 * whole file instead (no ranges) is cut off at once, never read. The last range of a file may be shorter.
 */
export async function readRemoteRange(raw: string, from: number, to: number, options: { signal?: AbortSignal; timeoutMs?: number; agents?: ReturnType<typeof rangeAgents> } = {}) {
  const start = checkRemoteUrl(raw, { allowLoopback: allowLoopback() })
  const controller = new AbortController(), stop = () => controller.abort()
  if (options.signal?.aborted) throw new Error('خواندن فایل متوقف شد')
  options.signal?.addEventListener('abort', stop, { once: true })
  const timer = setTimeout(stop, options.timeoutMs ?? 20_000)
  try {
    const { response, url } = await open(start, controller.signal, { Range: `bytes=${from}-${to}` }, undefined, options.agents?.for(start))
    const got = response.statusCode === 206 ? contentRange(response) : null
    if (!got || got.start !== from || got.end > to) { response.destroy(); throw new Error('سرور فایل بخش‌های فایل را جدا نمی‌دهد') }
    return { bytes: await readExactly(response, got.end - got.start + 1), total: got.total, url: url.toString() }
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', stop) }
}

/**
 * The file read as consecutive byte ranges over several connections at once and written to `sink` in order, for hosts
 * that limit one connection's speed (a 1.7 GB film at 4 MB/s outlasts a background job). At most `width` parts are held
 * in memory. Every part must be the expected range of the same file (`If-Range` on its ETag or date): a file that
 * changes meanwhile is refused, not stitched. `null` when the host does not serve ranges, so the caller reads it whole.
 * `resume` continues an earlier read from a byte: it must be the same file (its validator and size), or nothing is read.
 */
export type RangeResume = { from: number; validator: string; total: number }
const CHANGED = 'فایل هنگام دریافت تغییر کرد'
async function streamRanges(start: URL, sink: Writable, options: { maxBytes: number; width: number; checkpoint?: () => Promise<void>; resume?: RangeResume; onStart?: (file: { total: number; validator: string }) => Promise<void> }, signal: AbortSignal) {
  const offset = options.resume?.from || 0
  const first = await open(start, signal, { Range: `bytes=${offset}-${offset + PART_BYTES - 1}`, ...(options.resume?.validator ? { 'If-Range': options.resume.validator } : {}) }, options.checkpoint)
  const range = first.response.statusCode === 206 ? contentRange(first.response) : null
  if (!range || range.start !== offset || !range.total) {
    first.response.destroy()
    // A read that cannot continue where it stopped starts over; a host without ranges is read whole by the caller.
    if (options.resume) throw Object.assign(new Error(CHANGED), { changed: true })
    return null
  }
  const { total } = range
  if (options.resume && (total !== options.resume.total || offset >= total)) { first.response.destroy(); throw Object.assign(new Error(CHANGED), { changed: true }) }
  if (total > options.maxBytes) { first.response.destroy(); throw new Error(TOO_LARGE) }
  const validator = options.resume?.validator || String(first.response.headers.etag || first.response.headers['last-modified'] || '')
  try { await options.onStart?.({ total, validator }) } catch (error) { first.response.destroy(); throw error }
  const parts = Math.ceil((total - offset) / PART_BYTES)
  const fetchPart = async (index: number, opened?: http.IncomingMessage): Promise<Buffer> => {
    const from = offset + index * PART_BYTES, to = Math.min(total, from + PART_BYTES) - 1
    for (let attempt = 0; ; attempt++) {
      try {
        const response = opened ?? (await open(first.url, signal, { Range: `bytes=${from}-${to}`, ...(validator ? { 'If-Range': validator } : {}) }, options.checkpoint)).response
        opened = undefined
        const got = response.statusCode === 206 ? contentRange(response) : null
        if (!got || got.start !== from || got.total !== total) { response.destroy(); throw Object.assign(new Error(CHANGED), { final: true, changed: true }) }
        return await readExactly(response, to - from + 1)
      } catch (error) {
        // One more try for a dropped connection; a changed file or a stopped read is the answer.
        if (attempt >= 1 || signal.aborted || (error as { final?: boolean }).final) throw error
      }
    }
  }
  const pending = new Map<number, Promise<Buffer>>()
  let next = 0, received = 0
  const launch = () => {
    while (next < parts && pending.size < options.width) {
      const part = fetchPart(next, next === 0 ? first.response : undefined)
      part.catch(() => undefined) // awaited in order below; a part failing early must not be an unhandled rejection
      pending.set(next++, part)
    }
  }
  for (let index = 0; index < parts; index++) {
    launch()
    const part = await pending.get(index)!
    pending.delete(index)
    received += part.length
    await write(sink, part)
    await options.checkpoint?.()
  }
  await new Promise<void>((resolve, reject) => {
    sink.once('error', reject)
    sink.end(() => resolve())
  })
  return { bytes: received, mime: String(first.response.headers['content-type'] || '').split(';')[0], finalUrl: first.url.toString(), total, validator }
}

/**
 * The socket resolves through the guard. Every hop and every streamed byte is checked. With `parallel` above 1 a host
 * that serves byte ranges is read over that many connections (in order, same file); any other host is read as one stream.
 */
export async function streamPublicFile(raw: string, sink: Writable, options: { maxBytes: number; timeoutMs?: number; checkpoint?: () => Promise<void>; parallel?: number; resume?: RangeResume; onStart?: (file: { total: number; validator: string }) => Promise<void> }) {
  const start = checkRemoteUrl(raw, { allowLoopback: allowLoopback() })
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), options.timeoutMs || 120000)
  let received = 0
  try {
    const width = Math.min(8, Math.max(1, Math.floor(options.parallel || 1)))
    if (width > 1 || options.resume) {
      const ranged = await streamRanges(start, sink, { maxBytes: options.maxBytes, width, checkpoint: options.checkpoint, resume: options.resume, onStart: options.onStart }, controller.signal)
      if (ranged) return ranged
    }
    const { response, url } = await open(start, controller.signal, {}, options.checkpoint)
    if (Number(response.headers['content-length']) > options.maxBytes) { response.destroy(); throw new Error(TOO_LARGE) }
    let lastCheck = Date.now()
    const bound = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      if (received > options.maxBytes) return callback(new Error(TOO_LARGE))
      if (Date.now() - lastCheck > 2000 && options.checkpoint) {
        lastCheck = Date.now(); options.checkpoint().then(() => callback(null, chunk), e => callback(e))
      } else callback(null, chunk)
    } })
    await pipeline(response, bound, sink, { signal: controller.signal })
    return { bytes: received, mime: String(response.headers['content-type'] || '').split(';')[0], finalUrl: url.toString() }
  } finally {
    clearTimeout(deadline)
    // Parts still in flight stop with the read.
    controller.abort()
    if (!sink.writableFinished) sink.destroy()
  }
}
