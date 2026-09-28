import type { Metadata } from 'next'
import { TrackView } from '@/modules/shipping/server/pages/track'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'رهگیری مرسوله', robots: { index: false } }

export default async function TrackCodePage({ params }: { params: Promise<{ code: string }> }) {
  return <TrackView code={decodeURIComponent((await params).code)} />
}
