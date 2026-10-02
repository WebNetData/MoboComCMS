import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import { getServerLocale } from '@/i18n/server'
import { browseMusicAlbums } from '@/modules/media/server/queries'
import MusicDirectory from '@/components/media/MusicDirectory'
import { AlbumCard } from '@/components/media/MediaCards'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'آلبوم‌های موزیک | Music albums' }
type Search = { q?: string; page?: string }

export default async function MusicAlbumsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireModule('music')
  const [params, locale] = await Promise.all([searchParams, getServerLocale()])
  const fa = locale === 'fa'
  const result = await browseMusicAlbums({ q: params.q, page: Number(params.page) })
  return <MusicDirectory kind="albums" title={fa ? 'آلبوم‌ها' : 'Albums'} count={result.total} q={String(params.q || '').slice(0, 100)} page={result.page} pages={result.pages} fa={fa}>
    {result.albums.map((album) => <AlbumCard key={album.id} album={album} fa={fa} />)}
  </MusicDirectory>
}
