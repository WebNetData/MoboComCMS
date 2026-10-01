import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import { getServerLocale } from '@/i18n/server'
import { browseMusicPlaylists } from '@/modules/media/server/queries'
import MusicDirectory from '@/components/media/MusicDirectory'
import { PlaylistCard } from '@/components/media/MediaCards'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'پلی‌لیست‌های موزیک | Music playlists' }
type Search = { q?: string; page?: string }

export default async function MusicPlaylistsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireModule('music')
  const [params, locale] = await Promise.all([searchParams, getServerLocale()])
  const fa = locale === 'fa'
  const result = await browseMusicPlaylists({ q: params.q, page: Number(params.page) })
  return <MusicDirectory kind="playlists" title={fa ? 'پلی‌لیست‌ها' : 'Playlists'} count={result.total} q={String(params.q || '').slice(0, 100)} page={result.page} pages={result.pages} fa={fa}>
    {result.playlists.map((playlist, index) => <PlaylistCard key={playlist.id} playlist={playlist} fa={fa} index={index} />)}
  </MusicDirectory>
}
