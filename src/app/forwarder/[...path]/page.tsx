import { ForwarderPage, forwarderMetadata } from '@/modules/forwarder/server/page'

export const dynamic = 'force-dynamic'
export const metadata = forwarderMetadata

/** /forwarder/<slug> and /forwarder/url=<address> (query strings of the address are kept). */
export default async function Forward({ params, searchParams }: { params: Promise<{ path: string[] }>; searchParams: Promise<Record<string, string | string[]>> }) {
  const [{ path }, query] = await Promise.all([params, searchParams])
  let segment = path.map((part) => { try { return decodeURIComponent(part) } catch { return part } }).join('/')
  if (/^url=/i.test(segment)) {
    const rest = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map((item) => [key, item] as [string, string]))).toString()
    if (rest) segment += `?${rest}`
  }
  return <ForwarderPage segment={segment} />
}
