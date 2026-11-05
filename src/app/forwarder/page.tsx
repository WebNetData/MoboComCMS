import { notFound } from 'next/navigation'
import { ForwarderPage, forwarderMetadata } from '@/modules/forwarder/server/page'

export const dynamic = 'force-dynamic'
export const metadata = forwarderMetadata

/** /forwarder?url=<address> */
export default async function ForwardQuery({ searchParams }: { searchParams: Promise<{ url?: string; auto?: string }> }) {
  const { url, auto } = await searchParams
  if (!url) notFound()
  return <ForwarderPage segment={`url=${url}`} rawTarget={url} automatic={auto === '1'} />
}
