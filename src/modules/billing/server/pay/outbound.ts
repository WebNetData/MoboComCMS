import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { request } from 'node:https'
import { connect, checkServerIdentity, type TLSSocket } from 'node:tls'
import { payCallbackEgress } from '@/modules/social/server/pay-egress'
import { payCallbackTunnel } from '@/modules/social/server/pay-tunnel'
import { PayCallbackNotSentError } from '@/modules/billing/domain/pay-outbound'

const blocked = new BlockList(), blockedV6 = new BlockList()
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [['::',128],['::1',128],['::ffff:0:0',96],['64:ff9b::',96],['100::',64],['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20],['fc00::',7],['fe80::',10],['ff00::',8]] as const) blockedV6.addSubnet(address, prefix, 'ipv6')
export function publicBotAddress(address: string): boolean {
  const family = isIP(address)
  return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && /^[23]/i.test(address) && !blockedV6.check(address, 'ipv6')
}

/** No HTTP headers/body are constructed until the pinned peer's TLS identity is verified. */
function directCallbackSocket(host: string, address: string, signal: AbortSignal): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new PayCallbackNotSentError())
    let done = false
    const socket = connect({ host: address, port: 443, servername: isIP(host) ? undefined : host,
      rejectUnauthorized: true, ALPNProtocols: ['http/1.1'],
      checkServerIdentity: (_name, certificate) => checkServerIdentity(host, certificate) })
    const fail = () => {
      if (done) return
      done = true
      signal.removeEventListener('abort', fail)
      socket.destroy()
      reject(new PayCallbackNotSentError())
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

/** Only public HTTPS, validated DNS answers pinned to the actual TLS request. Redirects are never followed. */
export async function publicHttpsPost(destination: string, body: string, headers: Record<string, string>, financialCallback=false) {
  const url = new URL(destination), host = url.hostname.replace(/^\[|\]$/g, '')
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || (url.port && url.port !== '443')) throw new Error('BOT_DESTINATION_BLOCKED')
  let timer: ReturnType<typeof setTimeout> | undefined
  let addresses: { address: string; family: number }[]
  try {
    addresses = await Promise.race([
      isIP(host) ? Promise.resolve([{ address: host, family: isIP(host) }]) : lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('BOT_DNS_TIMEOUT')), 5000) }),
    ])
  } catch { throw new PayCallbackNotSentError() } finally { clearTimeout(timer) }
  if (!addresses.length || addresses.some(item => !publicBotAddress(item.address))) throw new Error('BOT_DESTINATION_BLOCKED')
  const pinned = addresses[0]
  const signal=AbortSignal.timeout(12000)
  let socket: TLSSocket
  try {
    const route=financialCallback?await payCallbackEgress():'direct'
    socket = route === 'proxy' ? await payCallbackTunnel(host, pinned.address, signal) : await directCallbackSocket(host, pinned.address, signal)
  } catch { throw new PayCallbackNotSentError() }
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(url, {
      method: 'POST', port:443, createConnection: () => socket, family: pinned.family, servername: isIP(host) ? undefined : host,
      lookup: ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => options?.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family)) as NonNullable<Parameters<typeof request>[1]>['lookup'],
      headers: { ...headers, Host:url.host,'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'MoboComPay/1' },
      signal,
    }, response => {
      const chunks: Buffer[] = []; let size = 0
      response.on('data', chunk => { size += chunk.length; if (size > 16384) { response.destroy(); reject(new Error('BOT_RESPONSE_TOO_LARGE')); return } chunks.push(Buffer.from(chunk)) })
      response.on('end', () => resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }))
      response.on('error', () => reject(new Error('BOT_RESPONSE_INTERRUPTED')))
    })
    req.on('error', () => { socket.destroy(); reject(new Error('BOT_RESPONSE_UNKNOWN')) })
    req.once('close', () => socket.destroy())
    req.end(body)
  })
}
