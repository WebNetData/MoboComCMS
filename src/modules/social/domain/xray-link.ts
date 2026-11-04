// The outbound of the social-network proxy: one Xray-core outbound, read from the share link an owner pastes
// (vless://, vmess://, trojan://, ss://, socks://, http://) or from Xray's own outbound JSON. Only where traffic leaves
// is decided here; the root helper builds the rest of the configuration (listening, routing) itself.

export class ProxyConfigError extends Error {}

type Json = Record<string, unknown>
export type ProxyOutbound = { protocol: string; settings: Json; streamSettings?: Json }
export type ParsedProxy = { outbound: ProxyOutbound; label: string; protocol: string; server: string }

export const PROXY_PROTOCOLS = ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http'] as const
const NETWORKS = ['tcp', 'raw', 'ws', 'grpc', 'xhttp', 'httpupgrade'] as const
const SS_METHODS = ['aes-128-gcm', 'aes-256-gcm', 'chacha20-poly1305', 'chacha20-ietf-poly1305', 'xchacha20-poly1305', 'xchacha20-ietf-poly1305', '2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm', '2022-blake3-chacha20-poly1305']
const FINGERPRINTS = ['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', '360', 'qq', 'random', 'randomized']
const MAX_INPUT = 16_384

const fail = (message: string): never => { throw new ProxyConfigError(message) }
const text = (value: unknown, max = 512) => {
  const s = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
  if (s.length > max || /[\u0000-\u001f\u007f]/.test(s)) fail('یکی از مقدارهای پیکربندی نامعتبر یا بیش از حد طولانی است')
  return s
}
const address = (value: unknown) => {
  const s = text(value, 253).replace(/^\[(.*)\]$/, '$1')
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(s) && !/^[0-9A-Fa-f:]{2,39}$/.test(s)) fail('نشانی سرور پروکسی نامعتبر است')
  return s
}
const port = (value: unknown) => {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 65535) fail('پورت سرور پروکسی نامعتبر است')
  return n
}
const userId = (value: unknown) => {
  const s = text(value, 64)
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) fail('شناسهٔ کاربر (UUID) نامعتبر است')
  return s
}
const secret = (value: unknown, what: string) => {
  const s = text(value, 512)
  if (!s) fail(`${what} خالی است`)
  return s
}
const decodeBase64 = (value: string) => {
  const clean = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]*=*$/.test(clean)) fail('متن base64 پیکربندی خراب است')
  return Buffer.from(clean, 'base64').toString('utf8')
}

/** The transport (network) and its security, from share-link parameters. */
function stream(p: { type?: string; security?: string; sni?: string; fp?: string; alpn?: string; pbk?: string; sid?: string; spx?: string; path?: string; host?: string; serviceName?: string; mode?: string; headerType?: string; allowInsecure?: string }, fallbackSni: string): Json | undefined {
  const network = text(p.type || 'tcp').toLowerCase()
  if (!(NETWORKS as readonly string[]).includes(network)) fail(`نوع انتقال «${network}» پشتیبانی نمی‌شود (tcp، ws، grpc، xhttp یا httpupgrade)`)
  if (p.headerType && p.headerType !== 'none') fail('هدر جعلی tcp (headerType) پشتیبانی نمی‌شود')
  const security = text(p.security || 'none').toLowerCase()
  if (!['none', 'tls', 'reality'].includes(security)) fail(`امنیت «${security}» پشتیبانی نمی‌شود (none، tls یا reality)`)
  const fingerprint = text(p.fp).toLowerCase()
  if (fingerprint && !FINGERPRINTS.includes(fingerprint)) fail('اثر انگشت TLS (fp) نامعتبر است')
  const serverName = text(p.sni || fallbackSni, 253)
  const out: Json = { network: network === 'raw' ? 'tcp' : network, security }
  if (security === 'tls') {
    if (p.allowInsecure === '1' || p.allowInsecure === 'true') fail('پیکربندی بدون بررسی گواهی (allowInsecure) پذیرفته نمی‌شود')
    out.tlsSettings = { serverName, ...(fingerprint ? { fingerprint } : {}), ...(p.alpn ? { alpn: text(p.alpn).split(',').map((a) => a.trim()).filter(Boolean) } : {}) }
  }
  if (security === 'reality') {
    const publicKey = text(p.pbk)
    if (!/^[A-Za-z0-9_-]{42,44}$/.test(publicKey)) fail('کلید عمومی REALITY (pbk) نامعتبر است')
    const shortId = text(p.sid).toLowerCase()
    if (!/^[0-9a-f]{0,16}$/.test(shortId)) fail('shortId در REALITY نامعتبر است')
    if (!serverName) fail('برای REALITY نام سرور (sni) لازم است')
    out.realitySettings = { serverName, fingerprint: fingerprint || 'chrome', publicKey, shortId, spiderX: text(p.spx || '') }
  }
  const path = text(p.path), host = text(p.host, 253)
  if (network === 'ws') out.wsSettings = { path: path || '/', ...(host ? { host } : {}) }
  if (network === 'httpupgrade') out.httpupgradeSettings = { path: path || '/', ...(host ? { host } : {}) }
  if (network === 'xhttp') {
    const mode = text(p.mode || 'auto')
    if (!['auto', 'packet-up', 'stream-up', 'stream-one'].includes(mode)) fail('حالت xhttp نامعتبر است')
    out.xhttpSettings = { path: path || '/', mode, ...(host ? { host } : {}) }
  }
  if (network === 'grpc') out.grpcSettings = { serviceName: text(p.serviceName), multiMode: p.mode === 'multi' }
  return out
}

function params(url: URL) {
  const out: Record<string, string> = {}
  for (const [key, value] of url.searchParams) out[key] = value
  return out
}
const label = (url: URL) => { try { return text(decodeURIComponent(url.hash.slice(1)), 80) } catch { return '' } }
const parseUrl = (input: string) => { try { return new URL(input) } catch { return fail('لینک پیکربندی خوانده نشد') } }

function vless(input: string): ParsedProxy {
  const url = parseUrl(input), p = params(url), server = address(url.hostname)
  const encryption = text(p.encryption || 'none')
  if (encryption !== 'none') fail('رمزگذاری VLESS باید none باشد')
  const flow = text(p.flow)
  if (flow && flow !== 'xtls-rprx-vision') fail('flow در VLESS فقط xtls-rprx-vision پذیرفته می‌شود')
  const user = { id: userId(decodeURIComponent(url.username)), encryption: 'none', ...(flow ? { flow } : {}) }
  return { protocol: 'vless', server, label: label(url), outbound: { protocol: 'vless', settings: { vnext: [{ address: server, port: port(url.port || 443), users: [user] }] }, streamSettings: stream(p, server) } }
}

function vmess(input: string): ParsedProxy {
  let v: Json
  try { v = JSON.parse(decodeBase64(input.slice('vmess://'.length))) } catch (e) { if (e instanceof ProxyConfigError) throw e; return fail('لینک VMess خوانده نشد') }
  if (!v || typeof v !== 'object') fail('لینک VMess خوانده نشد')
  const server = address(v.add)
  const security = text(v.scy || 'auto')
  if (!['auto', 'aes-128-gcm', 'chacha20-poly1305', 'none', 'zero'].includes(security)) fail('رمزگذاری VMess نامعتبر است')
  const tls = text(v.tls).toLowerCase()
  const s = stream({ type: text(v.net || 'tcp'), headerType: text(v.type), security: tls === 'tls' ? 'tls' : 'none', sni: text(v.sni), fp: text(v.fp), alpn: text(v.alpn), path: text(v.path), host: text(v.host, 253) }, server)
  return { protocol: 'vmess', server, label: text(v.ps, 80), outbound: { protocol: 'vmess', settings: { vnext: [{ address: server, port: port(v.port), users: [{ id: userId(v.id), alterId: 0, security }] }] }, streamSettings: s } }
}

function trojan(input: string): ParsedProxy {
  const url = parseUrl(input), p = params(url), server = address(url.hostname)
  const password = secret(decodeURIComponent(url.username), 'گذرواژهٔ Trojan')
  return { protocol: 'trojan', server, label: label(url), outbound: { protocol: 'trojan', settings: { servers: [{ address: server, port: port(url.port || 443), password }] }, streamSettings: stream({ ...p, security: p.security || 'tls' }, server) } }
}

function shadowsocks(input: string): ParsedProxy {
  let body = input.slice('ss://'.length)
  const hash = body.indexOf('#'), name = hash >= 0 ? body.slice(hash + 1) : ''
  if (hash >= 0) body = body.slice(0, hash)
  body = body.split('?')[0].replace(/\/$/, '')
  // ss://BASE64(method:password)@host:port (SIP002), ss://method:password@host:port, or ss://BASE64(method:password@host:port)
  let userinfo: string, hostport: string
  if (body.includes('@')) {
    const at = body.lastIndexOf('@')
    userinfo = body.slice(0, at); hostport = body.slice(at + 1)
    let decoded = ''
    try { decoded = decodeURIComponent(userinfo) } catch { fail('لینک Shadowsocks خوانده نشد') }
    userinfo = decoded.includes(':') ? decoded : decodeBase64(userinfo)
  } else {
    const whole = decodeBase64(body), at = whole.lastIndexOf('@')
    if (at < 0) fail('لینک Shadowsocks خوانده نشد')
    userinfo = whole.slice(0, at); hostport = whole.slice(at + 1)
  }
  const colon = userinfo.indexOf(':')
  if (colon < 0) fail('روش و گذرواژهٔ Shadowsocks پیدا نشد')
  const method = text(userinfo.slice(0, colon)).toLowerCase(), password = secret(userinfo.slice(colon + 1), 'گذرواژهٔ Shadowsocks')
  if (!SS_METHODS.includes(method)) fail(`روش رمزگذاری Shadowsocks «${method}» پشتیبانی نمی‌شود`)
  const split = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(hostport)
  if (!split) fail('نشانی و پورت سرور Shadowsocks نامعتبر است')
  const server = address(split![1])
  let shown = ''
  try { shown = text(decodeURIComponent(name), 80) } catch { shown = '' }
  return { protocol: 'shadowsocks', server, label: shown, outbound: { protocol: 'shadowsocks', settings: { servers: [{ address: server, port: port(split![2]), method, password }] } } }
}

function upstream(input: string, protocol: 'socks' | 'http'): ParsedProxy {
  const url = parseUrl(input.replace(/^socks5?:\/\//, 'socks://')), server = address(url.hostname)
  const user = decodeURIComponent(url.username), pass = decodeURIComponent(url.password)
  const users = user ? [{ user: text(user, 128), pass: text(pass, 256) }] : undefined
  return { protocol, server, label: label(url), outbound: { protocol, settings: { servers: [{ address: server, port: port(url.port || (protocol === 'http' ? 8080 : 1080)), ...(users ? { users } : {}) }] } } }
}

const OUTBOUND_KEYS = ['protocol', 'settings', 'streamSettings', 'tag', 'mux']
const STREAM_KEYS = ['network', 'security', 'tlsSettings', 'realitySettings', 'wsSettings', 'grpcSettings', 'xhttpSettings', 'httpupgradeSettings', 'tcpSettings', 'rawSettings']

/** Xray's own outbound JSON (or a whole configuration: its first usable outbound), limited to what an outbound needs. */
function fromJson(input: string): ParsedProxy {
  let value: unknown
  try { value = JSON.parse(input) } catch { return fail('JSON پیکربندی خوانده نشد') }
  let candidate = value as Json
  if (candidate && Array.isArray(candidate.outbounds)) candidate = (candidate.outbounds as Json[]).find((o) => o && (PROXY_PROTOCOLS as readonly string[]).includes(String(o.protocol))) as Json
  if (!candidate || typeof candidate !== 'object') fail('در JSON خروجی (outbound) قابل استفاده‌ای پیدا نشد')
  const protocol = String(candidate.protocol || '')
  if (!(PROXY_PROTOCOLS as readonly string[]).includes(protocol)) fail(`پروتکل «${protocol || '؟'}» پشتیبانی نمی‌شود`)
  for (const key of Object.keys(candidate)) if (!OUTBOUND_KEYS.includes(key)) fail(`کلید «${key}» در خروجی مجاز نیست`)
  if (!candidate.settings || typeof candidate.settings !== 'object') fail('بخش settings خروجی خالی است')
  const streamSettings = candidate.streamSettings as Json | undefined
  if (streamSettings !== undefined) {
    if (!streamSettings || typeof streamSettings !== 'object') fail('بخش streamSettings نامعتبر است')
    for (const key of Object.keys(streamSettings)) if (!STREAM_KEYS.includes(key)) fail(`کلید «${key}» در streamSettings مجاز نیست`)
    const tls = streamSettings.tlsSettings as Json | undefined
    if (tls && tls.allowInsecure === true) fail('پیکربندی بدون بررسی گواهی (allowInsecure) پذیرفته نمی‌شود')
  }
  const settings = candidate.settings as Json
  const first = ((settings.vnext || settings.servers) as Json[] | undefined)?.[0]
  const server = first ? address(first.address) : fail('نشانی سرور در خروجی پیدا نشد')
  return { protocol, server, label: '', outbound: { protocol, settings, ...(streamSettings ? { streamSettings } : {}) } }
}

/** Reads what the owner pasted: one share link or Xray outbound JSON. Throws ProxyConfigError with a Persian message. */
export function parseProxyConfig(raw: string): ParsedProxy {
  const input = String(raw || '').trim()
  if (!input) fail('لینک یا JSON پیکربندی را وارد کنید')
  if (input.length > MAX_INPUT) fail('پیکربندی بیش از حد طولانی است')
  const scheme = input.slice(0, input.indexOf(':') + 1).toLowerCase()
  if (input.startsWith('{')) return fromJson(input)
  if (scheme === 'vless:') return vless(input)
  if (scheme === 'vmess:') return vmess(input)
  if (scheme === 'trojan:') return trojan(input)
  if (scheme === 'ss:') return shadowsocks(input)
  if (scheme === 'socks:' || scheme === 'socks5:') return upstream(input, 'socks')
  if (scheme === 'http:') return upstream(input, 'http')
  return fail('این نوع لینک شناخته نشد؛ لینک vless، vmess، trojan، ss یا JSON خروجی Xray را وارد کنید')
}
