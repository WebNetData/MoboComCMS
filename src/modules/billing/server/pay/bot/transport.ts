import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { request } from 'node:https'
import { botCallbackUrl } from '@/modules/billing/domain/pay-bot'

const blocked = new BlockList(), blockedV6 = new BlockList()
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [['::',128],['::1',128],['::ffff:0:0',96],['64:ff9b::',96],['100::',64],['2001::',32],['2001:db8::',32],['2002::',16],['fc00::',7],['fe80::',10],['ff00::',8]] as const) blockedV6.addSubnet(address, prefix, 'ipv6')
export function publicBotAddress(address: string): boolean {
  const family = isIP(address)
  return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && /^[23]/i.test(address) && !blockedV6.check(address, 'ipv6')
}

/** No proxy/redirect: resolve once, validate all answers, pin lookup, preserve TLS hostname checks. */
export async function sendBotVerification(destination: string, token: string, orderId: string) {
  const url = new URL(botCallbackUrl(destination)), host = url.hostname.replace(/^\[|\]$/g, '')
  if (!token || token.length > 512 || /[\r\n\u0000]/.test(token)) throw new Error('BOT_TOKEN_INVALID')
  let timer: ReturnType<typeof setTimeout> | undefined
  let addresses: { address: string; family: number }[]
  try {
    addresses = await Promise.race([
      isIP(host) ? Promise.resolve([{ address: host, family: isIP(host) }]) : lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('BOT_DNS_TIMEOUT')), 5000) }),
    ])
  } finally { clearTimeout(timer) }
  if (!addresses.length || addresses.some(item => !publicBotAddress(item.address))) throw new Error('BOT_DESTINATION_BLOCKED')
  const pinned = addresses[0], body = JSON.stringify({ order_id: orderId, actions: 'custom_payment_verify' })
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(url, {
      method: 'POST', agent: false, family: pinned.family, servername: isIP(host) ? undefined : host,
      lookup: ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => options?.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family)) as NonNullable<Parameters<typeof request>[1]>['lookup'],
      headers: { Token: token, 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'MoboComPay/1' },
      signal: AbortSignal.timeout(12000),
    }, response => {
      const chunks: Buffer[] = []; let size = 0
      response.on('data', chunk => { size += chunk.length; if (size > 16384) { response.destroy(); reject(new Error('BOT_RESPONSE_TOO_LARGE')); return } chunks.push(Buffer.from(chunk)) })
      response.on('end', () => resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }))
      response.on('error', () => reject(new Error('BOT_RESPONSE_INTERRUPTED')))
    })
    req.on('error', () => reject(new Error('BOT_RESPONSE_UNKNOWN')))
    req.end(body)
  })
}
