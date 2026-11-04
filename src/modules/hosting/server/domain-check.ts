// Is a domain free? Public lookups only, to fixed hosts: WHOIS at whois.nic.ir for .ir names, RDAP (rdap.org) for the
// rest. A network that blocks them, or an answer that cannot be read, gives "unknown": the order is still possible and
// staff confirm it at the registry. Answers are kept for a minute.
import net from 'node:net'
import type { Availability } from '@/modules/hosting/domain/domains'

type Checker = (name: string) => Promise<Availability>
const cache = new Map<string, { state: Availability; at: number }>()
const TTL = 60_000

function whoisIr(name: string): Promise<Availability> {
  return new Promise((resolve) => {
    let text = ''
    const socket = net.createConnection({ host: 'whois.nic.ir', port: 43 })
    const done = (state: Availability) => { socket.destroy(); resolve(state) }
    socket.setTimeout(6000, () => done('unknown'))
    socket.on('error', () => done('unknown'))
    socket.on('connect', () => socket.write(`${name}\r\n`))
    socket.on('data', (chunk) => { text += chunk.toString('utf8'); if (text.length > 20_000) done('unknown') })
    socket.on('end', () => done(/no entries found|%error:101/i.test(text) ? 'available' : /^domain:\s/im.test(text) ? 'taken' : 'unknown'))
  })
}

async function rdap(name: string): Promise<Availability> {
  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(name)}`, { headers: { accept: 'application/rdap+json' }, redirect: 'follow', signal: AbortSignal.timeout(6000), cache: 'no-store' })
    return response.status === 404 ? 'available' : response.ok ? 'taken' : 'unknown'
  } catch { return 'unknown' }
}

let checker: Checker = (name) => (name === 'ir' || name.endsWith('.ir') ? whoisIr(name) : rdap(name))

/** Tests replace the outside lookup; the real one is restored with `null`. */
export function setDomainChecker(next: Checker | null) {
  checker = next || ((name) => (name.endsWith('.ir') ? whoisIr(name) : rdap(name)))
  cache.clear()
}

export async function checkDomain(name: string): Promise<Availability> {
  const hit = cache.get(name)
  if (hit && Date.now() - hit.at < TTL) return hit.state
  const state = await checker(name).catch(() => 'unknown' as const)
  cache.set(name, { state, at: Date.now() })
  if (cache.size > 5000) cache.delete(cache.keys().next().value as string)
  return state
}
