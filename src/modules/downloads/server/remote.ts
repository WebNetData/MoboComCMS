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

/** The socket resolves through the guard. Every hop and every streamed byte is checked. */
export async function streamPublicFile(raw: string, sink: Writable, options: { maxBytes: number; timeoutMs?: number; checkpoint?: () => Promise<void> }) {
  let url = checkRemoteUrl(raw, { allowLoopback: allowLoopback() })
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), options.timeoutMs || 120000)
  let received = 0
  try {
    for (let hop = 0; hop <= 3; hop++) {
      const literal = url.hostname.replace(/^\[|\]$/g, '')
      if (net.isIP(literal) && refused(literal)) throw new Error('دسترسی به شبکهٔ داخلی مجاز نیست')
      await options.checkpoint?.()
      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = (url.protocol === 'https:' ? https : http).request(url, { lookup, signal: controller.signal, agent: false, headers: { 'User-Agent': 'MoboCom-Media/1.0', Accept: '*/*', 'Accept-Encoding': 'identity' } }, resolve)
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
      if (Number(response.headers['content-length']) > options.maxBytes) { response.destroy(); throw new Error('فایل از سقف حجم انتقال بزرگ‌تر است') }
      let lastCheck = Date.now()
      const bound = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        if (received > options.maxBytes) return callback(new Error('فایل از سقف حجم انتقال بزرگ‌تر است'))
        if (Date.now() - lastCheck > 2000 && options.checkpoint) {
          lastCheck = Date.now(); options.checkpoint().then(() => callback(null, chunk), e => callback(e))
        } else callback(null, chunk)
      } })
      await pipeline(response, bound, sink, { signal: controller.signal })
      return { bytes: received, mime: String(response.headers['content-type'] || '').split(';')[0], finalUrl: url.toString() }
    }
    throw new Error('تغییر مسیر نامعتبر است')
  } finally { clearTimeout(deadline); if (!sink.writableFinished) sink.destroy() }
}
