import { lookup } from 'node:dns/promises'
import { Agent, request } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { checkServerIdentity, connect, type TLSSocket } from 'node:tls'

export class PublicHttpsNotSentError extends Error {
  constructor() { super('PUBLIC_HTTPS_NOT_SENT') }
}

export class PublicHttpsDestinationError extends Error {
  constructor() { super('PUBLIC_HTTPS_DESTINATION_BLOCKED') }
}

const blocked = new BlockList(), blockedV6 = new BlockList()
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [['::',128],['::1',128],['::ffff:0:0',96],['64:ff9b::',96],['100::',64],['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20],['fc00::',7],['fe80::',10],['ff00::',8]] as const) blockedV6.addSubnet(address, prefix, 'ipv6')

export function publicAddress(address: string): boolean {
  const family = isIP(address)
  return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && /^[23]/i.test(address) && !blockedV6.check(address, 'ipv6')
}

/** Establish and authenticate the pinned TLS peer before writing any HTTP bytes. */
export function directPublicSocket(host: string, address: string, port: number, signal: AbortSignal): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new PublicHttpsNotSentError())
    let done = false
    const socket = connect({ host: address, port, servername: isIP(host) ? undefined : host,
      rejectUnauthorized: true, ALPNProtocols: ['http/1.1'],
      checkServerIdentity: (_name, certificate) => checkServerIdentity(host, certificate) })
    const fail = () => {
      if (done) return
      done = true
      signal.removeEventListener('abort', fail)
      socket.destroy()
      reject(new PublicHttpsNotSentError())
    }
    signal.addEventListener('abort', fail, { once: true })
    socket.once('error', fail)
    socket.once('close', () => { if (!done) fail() })
    socket.once('secureConnect', () => {
      if (done) return
      done = true
      signal.removeEventListener('abort', fail)
      resolve(socket)
    })
  })
}

/** An agent bound to one authenticated socket cannot reconnect through DNS. */
export function pinnedAgent(socket: TLSSocket): Agent {
  const agent = new Agent({ keepAlive: false })
  agent.createConnection = () => socket
  return agent
}

/** Refuse the destination if any one of its DNS answers is outside the public address space. */
export async function resolvePublicHttpsAddress(host: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let addresses: { address: string; family: number }[]
  try {
    addresses = await Promise.race([
      isIP(host) ? Promise.resolve([{ address: host, family: isIP(host) }]) : lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('PUBLIC_HTTPS_DNS_TIMEOUT')), 5000) }),
    ])
  } catch { throw new PublicHttpsNotSentError() } finally { clearTimeout(timer) }
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new PublicHttpsDestinationError()
  return addresses[0].address
}

/** Post to a public HTTPS endpoint without following redirects or retaining its response body. */
export async function publicHttpsPost(destination: string, body: string, headers: Record<string, string>, options: { beforeSend?: () => Promise<boolean> } = {}): Promise<{ status: number } | null> {
  let url: URL
  try { url = new URL(destination) } catch { throw new PublicHttpsDestinationError() }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new PublicHttpsDestinationError()
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const address = await resolvePublicHttpsAddress(host)
  const signal = AbortSignal.timeout(12000)
  const socket = await directPublicSocket(host, address, Number(url.port || 443), signal)
  try {
    if (options.beforeSend && !await options.beforeSend()) { socket.destroy(); return null }
    if (signal.aborted) { socket.destroy(); throw new PublicHttpsNotSentError() }
    return await new Promise<{ status: number }>((resolve, reject) => {
      const req = request(url, {
        method: 'POST', agent: pinnedAgent(socket), signal,
        headers: { ...headers, Host: url.host, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, response => {
        const status = response.statusCode || 0
        response.destroy()
        resolve({ status })
      })
      req.on('error', () => { socket.destroy(); reject(new Error('PUBLIC_HTTPS_RESPONSE_UNKNOWN')) })
      req.once('close', () => socket.destroy())
      req.end(body)
    })
  } catch (error) { socket.destroy(); throw error }
}
