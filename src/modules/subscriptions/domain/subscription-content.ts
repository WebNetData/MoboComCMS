import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

const MAX_PROFILE_BYTES = 4_000_000
const PROFILE_TIMEOUT_MS = 6_000

/** Only recognized VPN URIs are accepted as an installable profile. */
export function parseLinks(body: string): string[] {
  const value = body.trim()
  if (!value || value.length > MAX_PROFILE_BYTES) return []
  const decoded = value.includes('://') ? value : Buffer.from(value, 'base64').toString('utf8')
  return [...new Set(decoded.split(/\r?\n/).map(line => line.trim()).filter(line => /^(vless|vmess|trojan|ss|ssr|hysteria2?|hy2|tuic|wireguard):\/\/\S+$/i.test(line)))]
}

export function validProfile(body: string, format: string): boolean {
  if (!body.trim() || body.length > MAX_PROFILE_BYTES || /^\s*</.test(body)) return false
  if (format === 'links') return parseLinks(body).length > 0
  if (format === 'clash') return /^proxies\s*:/m.test(body) || /^proxy-providers\s*:/m.test(body)
  try {
    const data = JSON.parse(body)
    return Array.isArray(data) ? data.length > 0 && data.every(item => Array.isArray(item?.outbounds)) : Array.isArray(data?.outbounds) && data.outbounds.length > 0
  } catch { return false }
}

function blockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b, c] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  if (a === 169 && b === 254) return true // link-local / common cloud metadata range
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  // Reserved/documentation/benchmark ranges are not valid public panel targets.
  if (a === 192 && b === 0 && c === 0) return true
  if (a === 192 && b === 0 && c === 2) return true
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true
  if (a === 203 && b === 0 && c === 113) return true
  return false
}

function blockedIpv6(ip: string): boolean {
  const host = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === '::' || host === '::1') return true
  if (host.startsWith('::ffff:')) return true // IPv4-mapped addresses are never needed for panel subscriptions
  if (host.startsWith('fc') || host.startsWith('fd')) return true // unique-local fc00::/7
  if (/^fe[89ab]/.test(host)) return true // link-local fe80::/10
  if (host.startsWith('ff')) return true // multicast
  if (host.startsWith('2001:db8')) return true // documentation
  return false
}

export function blockedNetworkAddress(value: string): boolean {
  const ip = value.toLowerCase().replace(/^\[|\]$/g, '')
  const family = net.isIP(ip)
  if (family === 4) return blockedIpv4(ip)
  if (family === 6) return blockedIpv6(ip)
  return true
}

/**
 * Loopback/private/reserved hosts must never be fetched: `panelSubUrl` comes
 * from a remote panel, so a compromised panel must not turn this app into an
 * SSRF proxy against the database, Docker network or cloud metadata service.
 */
function blockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return true
  return net.isIP(host) ? blockedNetworkAddress(host) : false
}

/** The upstream must never resolve to this application's bearer-token routes. */
export function upstreamUrl(value: string, site: string): string | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (url.username || url.password) return null
    if (blockedHostname(url.hostname)) return null
    if (url.origin === new URL(site).origin || /^\/(s\/|api\/sub\/)/.test(url.pathname)) return null
    return url.href
  } catch { return null }
}

type Address = { address: string; family: number }

async function resolvePublicTarget(hostname: string): Promise<Address[]> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (net.isIP(host)) {
    if (blockedNetworkAddress(host)) throw new Error('blocked upstream address')
    return [{ address: host, family: net.isIP(host) }]
  }

  const rows = await dns.lookup(host, { all: true, verbatim: true })
  if (!rows.length) throw new Error('upstream did not resolve')
  // Reject the hostname completely if *any* returned record points at a local,
  // private or reserved range. This closes DNS-rebinding/mixed-answer tricks.
  if (rows.some(row => blockedNetworkAddress(row.address))) throw new Error('blocked upstream address')
  return rows.map(row => ({ address: row.address, family: row.family }))
}

function pinnedLookup(addresses: Address[]) {
  return (_hostname: string, options: any, callback: any) => {
    const family = typeof options === 'number' ? options : Number(options?.family || 0)
    const candidates = family === 4 || family === 6 ? addresses.filter(row => row.family === family) : addresses
    const rows = candidates.length ? candidates : addresses
    if (options && typeof options === 'object' && options.all) {
      callback(null, rows)
      return
    }
    const row = rows[0]
    callback(null, row.address, row.family)
  }
}

async function fetchPinnedText(value: string): Promise<string> {
  const url = new URL(value)
  if (blockedHostname(url.hostname)) return ''
  const addresses = await resolvePublicTarget(url.hostname)
  const lookup = pinnedLookup(addresses)
  const transport = url.protocol === 'https:' ? https : http
  const Agent = url.protocol === 'https:' ? https.Agent : http.Agent
  const agent = new Agent({ keepAlive: false, lookup })

  return new Promise<string>((resolve) => {
    const req = transport.request(url, {
      method: 'GET',
      agent,
      headers: {
        accept: '*/*',
        'accept-encoding': 'identity',
        'user-agent': 'MoboComCMS',
      },
    }, (res) => {
      const status = res.statusCode || 0
      if (status < 200 || status >= 300) {
        res.resume()
        resolve('')
        return
      }
      const parts: Buffer[] = []
      let size = 0
      res.on('data', (chunk: Buffer | string) => {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += part.length
        if (size > MAX_PROFILE_BYTES) req.destroy(new Error('profile too large'))
        else parts.push(part)
      })
      res.on('end', () => resolve(size <= MAX_PROFILE_BYTES ? Buffer.concat(parts).toString('utf8') : ''))
      res.on('error', () => resolve(''))
    })
    req.setTimeout(PROFILE_TIMEOUT_MS, () => req.destroy(new Error('upstream timeout')))
    req.on('error', () => resolve(''))
    req.end()
  }).finally(() => agent.destroy())
}

export async function fetchProfile(url: string, format: string): Promise<string> {
  try {
    const body = await fetchPinnedText(url)
    return validProfile(body, format) ? body : ''
  } catch {
    return ''
  }
}
