import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TrackView } from '@/modules/shipping/server/pages/track'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'رهگیری مرسوله' }

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams
  if (code && /^[A-Za-z0-9-]{6,40}$/.test(code.trim())) redirect(`/track/${encodeURIComponent(code.trim().toUpperCase().startsWith('MC') ? code.trim().toUpperCase() : code.trim())}`)
  return <TrackView code={code} />
}
