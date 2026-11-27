import { request } from 'node:https'
import type { TLSSocket } from 'node:tls'
import { payCallbackEgress } from '@/modules/social/server/pay-egress'
import { payCallbackTunnel } from '@/modules/social/server/pay-tunnel'
import { PayCallbackNotSentError } from '@/modules/billing/domain/pay-outbound'
import { directPublicSocket, pinnedAgent, publicAddress, PublicHttpsNotSentError, resolvePublicHttpsAddress } from '@/platform/http/public-https-post'

export const publicBotAddress = publicAddress

/** Only public HTTPS, validated DNS answers pinned to the actual TLS request. Redirects are never followed. */
export async function publicHttpsPost(destination: string, body: string, headers: Record<string, string>, financialCallback=false) {
  const url = new URL(destination), host = url.hostname.replace(/^\[|\]$/g, '')
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || (url.port && url.port !== '443')) throw new Error('BOT_DESTINATION_BLOCKED')
  let address: string
  try {
    address = await resolvePublicHttpsAddress(host)
  } catch (error) {
    if (error instanceof PublicHttpsNotSentError) throw new PayCallbackNotSentError()
    throw new Error('BOT_DESTINATION_BLOCKED')
  }
  const signal=AbortSignal.timeout(12000)
  let socket: TLSSocket
  try {
    const route=financialCallback?await payCallbackEgress():'direct'
    socket = route === 'proxy' ? await payCallbackTunnel(host, address, signal) : await directPublicSocket(host, address, 443, signal)
  } catch { throw new PayCallbackNotSentError() }
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(url, {
      method: 'POST', port:443, agent: pinnedAgent(socket),
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
