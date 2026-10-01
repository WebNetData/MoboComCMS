import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import { getServerLocale } from '@/i18n/server'
import { browseMusicArtists } from '@/modules/media/server/queries'
import MusicDirectory from '@/components/media/MusicDirectory'
import { ArtistBubble } from '@/components/media/MediaCards'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'هنرمندان موزیک | Music artists' }
type Search = { q?: string; page?: string }

export default async function MusicArtistsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireModule('music')
  const [params, locale] = await Promise.all([searchParams, getServerLocale()])
  const fa = locale === 'fa'
  const result = await browseMusicArtists({ q: params.q, page: Number(params.page) })
  return <MusicDirectory kind="artists" title={fa ? 'هنرمندان' : 'Artists'} count={result.total} q={String(params.q || '').slice(0, 100)} page={result.page} pages={result.pages} fa={fa}>
    {result.artists.map((artist) => <ArtistBubble key={artist.id} artist={artist} fa={fa} />)}
  </MusicDirectory>
}
