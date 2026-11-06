import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import { Readable } from 'node:stream'
import { readJsonSetting } from '@/modules/settings/server'
import { fromLegacy, normalizeEgress, purposeOfHost, type EgressPurpose, type EgressSettings } from '@/modules/social/domain/egress'

// Requests of the site that belong to a purpose (Telegram, Instagram, AI providers…) go through the local Xray-core proxy
// (127.0.0.1) when the owner chose a profile for that purpose in the Server Panel; everything else goes out directly.

/** The first setting: one link for Telegram and Instagram. Read only while the profile setting does not exist yet. */
export const SOCIAL_PROXY_KEY = 'social.proxy.v1'
/** Profiles (encrypted links) and the profile of each purpose. */
export const EGRESS_PROXY_KEY = 'egress.proxy.v2'
export const SOCIAL_PROXY_HOSTS = ['api.telegram.org', 'graph.facebook.com', 'graph.instagram.com'] as const
const PROXY_PORT = Number(process.env.SOCIAL_PROXY_PORT || 10809)

export type SocialInit = {
  method?: string
  headers?: Record<string, string> | Headers | [string, string][]
  body?: string | URLSearchParams | Uint8Array | ArrayBuffer | null
  signal?: AbortSignal | null
  redirect?: RequestRedirect
  cache?: RequestCache
}

/** The stored profiles and routes; the first setting is read as profile p1 until the panel saves the new one. */
export async function readEgressSettings(): Promise<EgressSettings> {
  const current = await readJsonSetting(EGRESS_PROXY_KEY).catch(() => undefined)
  if (current && typeof current === 'object' && Array.isArray((current as { profiles?: unknown }).profiles)) return normalizeEgress(current)
  return fromLegacy(await readJsonSetting(SOCIAL_PROXY_KEY).catch(() => undefined))
}

let cached: { at: number; routed: Set<EgressPurpose> } | null = null
/** The purposes that go through the proxy now; read at most every 15 seconds. */
async function routedPurposes() {
  if (cached && Date.now() - cached.at < 15_000) return cached.routed
  const settings = await readEgressSettings().catch(() => null)
  cached = { at: Date.now(), routed: new Set(Object.entries(settings?.routes || {}).filter(([, id]) => id).map(([purpose]) => purpose as EgressPurpose)) }
  return cached.routed
}
export function forgetSocialProxySetting() { cached = null }

/** The actual host/purpose decision, also used by callers' secret-free connection diagnostics. */
export async function egressRoute(url: string | URL): Promise<'direct' | 'proxy'> {
  const target = new URL(String(url))
  const purpose = target.protocol === 'https:' ? purposeOfHost(target.hostname) : null
  return purpose && (await routedPurposes()).has(purpose) ? 'proxy' : 'direct'
}

/** fetch() for the site's outside services: through the local proxy when the host's purpose has a profile. */
export async function egressFetch(url: string | URL, init: SocialInit = {}): Promise<Response> {
  const target = new URL(String(url))
  if (await egressRoute(target) === 'proxy') return viaProxy(target, init)
  return fetch(String(url), init as RequestInit)
}

/** The name the Telegram and Instagram callers already use. */
export const socialFetch = egressFetch

function headerRecord(headers: SocialInit['headers']): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headers) return out
  const entries = headers instanceof Headers ? [...headers.entries()] : Array.isArray(headers) ? headers : Object.entries(headers)
  for (const [key, value] of entries) out[key.toLowerCase()] = String(value)
  return out
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
    const headers = headerRecord(init.headers)
    let body: Buffer | undefined
    if (init.body instanceof URLSearchParams) {
      body = Buffer.from(init.body.toString())
      headers['content-type'] ||= 'application/x-www-form-urlencoded;charset=UTF-8'
    } else if (typeof init.body === 'string') body = Buffer.from(init.body)
    else if (init.body instanceof ArrayBuffer) body = Buffer.from(new Uint8Array(init.body))
    else if (init.body) body = Buffer.from(init.body)
    if (body) headers['content-length'] = String(body.length)
    headers.host = target.host
    headers['accept-encoding'] = 'identity'

    const authority = `${target.hostname}:${target.port || 443}`
    let settled = false
    const done = (error?: unknown, response?: Response) => {
      if (settled) return
      settled = true
      // A fetch signal covers response consumption too, not only receipt of its headers.
      if (error) signal?.removeEventListener('abort', onAbort)
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
        const cleanup = () => signal?.removeEventListener('abort', onAbort)
        incoming.once('end', cleanup)
        incoming.once('close', cleanup)
        incoming.once('error', cleanup)
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
