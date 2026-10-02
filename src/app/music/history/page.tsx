import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { getServerLocale } from '@/i18n/server'
import { continueListening, listListeningHistory } from '@/modules/music/server/listening-history'
import { toPlayerTracks } from '@/components/media/player-types'
import MediaShell from '@/components/media/MediaShell'
import { musicNav } from '@/components/media/nav'
import { TrackList } from '@/components/media/PlayButton'
import Pager from '@/components/media/Pager'
import ClearHistoryButton from './ClearHistoryButton'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'تاریخچهٔ پخش | Listening history', robots: { index: false } }
type Props = { searchParams: Promise<{ page?: string }> }

export default async function MusicHistoryPage({ searchParams }: Props) {
  await requireModule('music')
  const [viewer, locale, search] = await Promise.all([getViewer(), getServerLocale(), searchParams])
  if (!viewer.userId) redirect('/login?next=/music/history')
  const fa = locale === 'fa'
  const [history, unfinished] = await Promise.all([listListeningHistory(viewer.userId, search.page), continueListening(viewer.userId)])
  const tracks = toPlayerTracks(history.items.map((item) => item.track), fa)
  const resumeTracks = toPlayerTracks(unfinished.map((item) => item.track), fa)

  return <MediaShell section="music" active="history" nav={musicNav(fa)}>
    <div className="container md-body">
      <header className="md-page-head mu-personal-head"><div><span className="md-eyebrow">{fa ? 'کتابخانهٔ شخصی' : 'Your library'}</span><h1>{fa ? 'تاریخچهٔ پخش' : 'Listening history'}</h1><p className="muted">{fa ? 'آهنگ‌هایی که پخش کرده‌اید فقط در حساب خودتان دیده می‌شوند.' : 'Only you can see the tracks you have played.'}</p></div>{history.total > 0 && <ClearHistoryButton fa={fa} />}</header>
      {resumeTracks.length > 0 && <section className="mu-panel"><header className="md-shelf-head"><h2>{fa ? 'ادامهٔ شنیدن' : 'Continue listening'}</h2></header><TrackList tracks={resumeTracks} numbered={false} history={unfinished.map((item) => ({ positionSeconds: item.positionSeconds, durationSeconds: item.durationSeconds }))} /></section>}
      <section className="mu-panel"><header className="md-shelf-head"><h2>{fa ? 'آخرین آهنگ‌ها' : 'Recently played'}</h2><span className="muted">{history.total.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span></header>
        {tracks.length ? <TrackList tracks={tracks} numbered={false} history={history.items.map((item) => ({ lastPlayedAt: item.lastPlayedAt.toISOString(), playCount: item.playCount, positionSeconds: item.completedAt ? 0 : item.positionSeconds, durationSeconds: item.durationSeconds }))} /> : <p className="muted mu-empty">{fa ? 'هنوز آهنگی پخش نکرده‌اید.' : 'You have not played any tracks yet.'}</p>}
      </section>
      <Pager page={history.page} pages={history.pages} href={(page) => `/music/history?page=${page}`} fa={fa} />
    </div>
  </MediaShell>
}
