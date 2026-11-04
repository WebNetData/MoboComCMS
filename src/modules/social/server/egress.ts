import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import { Readable } from 'node:stream'
import { readJsonSetting } from '@/modules/settings/server'

// Requests to Telegram and Instagram, through the server's social-network proxy (Xray-core on 127.0.0.1) when the owner
// turned it on in the Server Panel; everything else, and these hosts while it is off, go out directly as before.

export const SOCIAL_PROXY_KEY = 'social.proxy.v1'
export const SOCIAL_PROXY_HOSTS = ['api.telegram.org', 'graph.facebook.com', 'graph.instagram.com'] as const
const PROXY_PORT = Number(process.env.SOCIAL_PROXY_PORT || 10809)

export type SocialInit = {
  method?: string
  headers?: Record<string, string>
  body?: string | URLSearchParams | Uint8Array
  signal?: AbortSignal
  redirect?: RequestRedirect
  cache?: RequestCache
}

let cached: { at: number; on: boolean } | null = null
/** Whether the owner sends Telegram/Instagram traffic through the proxy; read at most every 15 seconds. */
async function proxyOn() {
  if (cached && Date.now() - cached.at < 15_000) return cached.on
  const value = await readJsonSetting(SOCIAL_PROXY_KEY).catch(() => undefined)
  cached = { at: Date.now(), on: value?.enabled === true }
  return cached.on
}
export function forgetSocialProxySetting() { cached = null }

/** fetch() for the social networks: through the local proxy when it is on and the host is one of theirs. */
export async function socialFetch(url: string, init: SocialInit = {}): Promise<Response> {
  const target = new URL(url)
  if (target.protocol === 'https:' && (SOCIAL_PROXY_HOSTS as readonly string[]).includes(target.hostname) && await proxyOn()) return viaProxy(target, init)
  return fetch(url, init as RequestInit)
}

const NO_BODY = new Set([101, 204, 205, 304])

/**
 * One HTTPS request through the local HTTP proxy: a CONNECT tunnel to the host, then TLS with the host's own name and
 * certificate checks, so the proxy only ever sees an encrypted stream. Redirects are not followed.
 */
export function viaProxy(target: URL, init: SocialInit = {}, port = PROXY_PORT): Promise<Response> {
  return new Promise((resolve, reject) => {
    const signal = init.signal
    if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'))
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(init.headers || {})) headers[key.toLowerCase()] = value
    let body: Buffer | undefined
    if (init.body instanceof URLSearchParams) {
      body = Buffer.from(init.body.toString())
      headers['content-type'] ||= 'application/x-www-form-urlencoded;charset=UTF-8'
    } else if (typeof init.body === 'string') body = Buffer.from(init.body)
    else if (init.body) body = Buffer.from(init.body)
    if (body) headers['content-length'] = String(body.length)
    headers.host = target.host
    headers['accept-encoding'] = 'identity'

    const authority = `${target.hostname}:${target.port || 443}`
    let settled = false
    const done = (error?: unknown, response?: Response) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      if (error) reject(error); else resolve(response!)
    }
    const connect = http.request({ host: '127.0.0.1', port, method: 'CONNECT', path: authority, headers: { host: authority } })
    let request: http.ClientRequest | undefined
    function onAbort() { const reason = signal?.reason ?? new Error('aborted'); request?.destroy(reason); connect.destroy(reason); done(reason) }
    signal?.addEventListener('abort', onAbort, { once: true })
    connect.once('error', (error) => done(new Error(`social-network proxy is not reachable: ${error.message}`)))
    connect.once('connect', (answer, socket) => {
      if (answer.statusCode !== 200) { socket.destroy(); return done(new Error(`social-network proxy refused ${target.hostname} (${answer.statusCode})`)) }
      request = https.request({
        host: target.hostname, port: Number(target.port || 443), path: `${target.pathname}${target.search}`, method: (init.method || 'GET').toUpperCase(), headers,
        // No agent: Node then takes this tunnelled TLS socket (with agent: false it would open a direct connection).
        createConnection: () => tls.connect({ socket, servername: target.hostname, ALPNProtocols: ['http/1.1'] }),
      })
      request.once('error', (error) => done(error))
      request.once('response', (incoming) => {
        const responseHeaders = new Headers()
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) for (const item of value) responseHeaders.append(key, item)
          else if (value !== undefined) responseHeaders.set(key, value)
        }
        const status = incoming.statusCode || 502
        if (status >= 300 && status < 400 && init.redirect === 'error') { incoming.resume(); return done(new TypeError('redirect refused')) }
        const stream = NO_BODY.has(status) ? null : Readable.toWeb(incoming) as unknown as ReadableStream
        if (!stream) incoming.resume()
        done(undefined, new Response(stream, { status, headers: responseHeaders }))
      })
      if (body) request.write(body)
      request.end()
    })
    connect.end()
  })
}
