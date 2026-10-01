import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound, redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { getServerLocale } from '@/i18n/server'
import { browseMusic } from '@/modules/media/server/queries'
import { getPersonalPlaylist, playlistId, PlaylistError } from '@/modules/music/server/personal-playlists'
import { toPlayerTracks } from '@/components/media/player-types'
import MediaShell from '@/components/media/MediaShell'
import { musicNav } from '@/components/media/nav'
import { PlayButton } from '@/components/media/PlayButton'
import Pager from '@/components/media/Pager'
import PlaylistTracksEditor from './PlaylistTracksEditor'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'پلی‌لیست شخصی | My playlist', robots: { index: false } }
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; page?: string }> }

export default async function MyPlaylistPage({ params, searchParams }: Props) {
  await requireModule('music')
  const [route, search, viewer, locale] = await Promise.all([params, searchParams, getViewer(), getServerLocale()])
  if (!viewer.userId) redirect(`/login?next=/music/my-playlists/${encodeURIComponent(route.id)}`)
  let playlist: Awaited<ReturnType<typeof getPersonalPlaylist>>
  try { playlist = await getPersonalPlaylist(viewer.userId, playlistId(route.id)) }
  catch (error) { if (error instanceof PlaylistError && error.status === 404) notFound(); throw error }
  const fa = locale === 'fa'
  const q = String(search.q || '').trim().slice(0, 80)
  const result = q ? await browseMusic({ q, page: Number(search.page) }) : null
  const tracks = toPlayerTracks(playlist.tracks, fa)
  const matches = toPlayerTracks(result?.tracks || [], fa)
  return <MediaShell section="music" active="mine" nav={musicNav(fa)}>
    <div className="container md-body">
      <header className="md-page-head mu-personal-head"><div><Link className="md-more" href="/music/my-playlists">{fa ? '← پلی‌لیست‌های من' : '← My playlists'}</Link><h1>{playlist.title}</h1><p className="muted">{tracks.length.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'آهنگ · فقط برای شما' : 'tracks · private'}</p></div>{tracks.length > 0 && <PlayButton tracks={tracks} index={0} variant="big" label={fa ? 'پخش همه' : 'Play all'} />}</header>
      <section className="mu-panel"><header className="md-shelf-head"><h2>{fa ? 'افزودن آهنگ' : 'Add tracks'}</h2></header><form action={`/music/my-playlists/${playlist.id}`} className="mu-directory-search" role="search"><input className="input" type="search" name="q" defaultValue={q} maxLength={80} placeholder={fa ? 'نام آهنگ یا هنرمند…' : 'Song or artist…'} aria-label={fa ? 'جست‌وجوی آهنگ' : 'Search tracks'} /><button className="btn btn-primary" type="submit">{fa ? 'جست‌وجو' : 'Search'}</button></form>{q && result?.total === 0 && <p className="muted">{fa ? 'آهنگی پیدا نشد.' : 'No songs found.'}</p>}</section>
      <PlaylistTracksEditor id={playlist.id} tracks={tracks} matches={matches} fa={fa} />
      {result && <Pager page={result.page} pages={result.pages} href={(page) => `/music/my-playlists/${playlist.id}?${new URLSearchParams({ q, page: String(page) })}`} fa={fa} />}
    </div>
  </MediaShell>
}
