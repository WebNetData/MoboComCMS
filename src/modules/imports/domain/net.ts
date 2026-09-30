/**
 * Which network addresses an import may fetch from. Remote media URLs are
 * untrusted: loopback, private, link-local (cloud metadata), carrier-grade
 * NAT, multicast, reserved and documentation ranges are refused, for IPv4,
 * IPv6 and IPv4-mapped/NAT64 forms alike. Pure.
 */

const v4ToInt = (ip: string) => ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]

export function isIPv4(ip: string) {
  return /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip) && ip.split('.').every((part) => Number(part) <= 255)
}

function blockedV4(ip: string): boolean {
  const n = v4ToInt(ip)
  return V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)))
}

/** Expands an IPv6 address to 8 groups (embedded IPv4 turned into two groups). */
function v6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  const v4 = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text)
  if (v4) {
    if (!isIPv4(v4[1])) return null
    const n = v4ToInt(v4[1])
    text = text.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  const groups = [...head, ...Array(Math.max(0, fill)).fill('0'), ...tail]
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  return groups.map((g) => parseInt(g, 16))
}

export function isBlockedAddress(address: string): boolean {
  const ip = address.trim()
  if (isIPv4(ip)) return blockedV4(ip)
  const g = v6Groups(ip)
  if (!g) return true // unparseable: refuse
  const embedded = () => `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`
  if (g.every((x) => x === 0)) return true // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true // ::1
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return blockedV4(embedded()) // ::ffff:a.b.c.d and ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return blockedV4(embedded()) // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true // link-local fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return true // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // documentation
  if (g[0] === 0x2002) return blockedV4(`${g[1] >> 8}.${g[1] & 0xff}.${g[2] >> 8}.${g[2] & 0xff}`) // 6to4
  return false
}

/** Protocol and port rules for a remote media URL (before any DNS lookup). */
export function checkRemoteUrl(raw: string, options: { allowPrivate?: boolean } = {}): URL {
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('نشانی نامعتبر است') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`پروتکل ${url.protocol} مجاز نیست`)
  if (url.username || url.password) throw new Error('نشانی دارای نام کاربری/رمز مجاز نیست')
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (options.allowPrivate) return url // test servers only (the caller never enables this in production)
  if (![80, 443, 8080, 8443].includes(port)) throw new Error(`درگاه ${port} مجاز نیست`)
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === 'metadata' ) throw new Error('نشانی داخلی مجاز نیست')
  const literal = host.replace(/^\[|\]$/g, '')
  if ((isIPv4(literal) || literal.includes(':')) && isBlockedAddress(literal)) throw new Error('نشانی شبکهٔ داخلی یا رزروشده مجاز نیست')
  return url
}
