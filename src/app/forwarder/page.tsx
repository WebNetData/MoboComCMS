import { notFound } from 'next/navigation'
import { ForwarderPage, forwarderMetadata } from '@/modules/forwarder/server/page'

export const dynamic = 'force-dynamic'
export const metadata = forwarderMetadata

/** /forwarder?url=<address> */
export default async function ForwardQuery({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams
  if (!url) notFound()
  return <ForwarderPage segment={`url=${url}`} />
}
