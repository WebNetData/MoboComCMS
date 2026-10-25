import type { Metadata } from 'next'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import { sized } from '@/shared/media/image'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getMusicHome } from '@/modules/media/server/queries'
import { getViewer } from '@/modules/membership/server/membership'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { musicNav } from '@/components/media/nav'
import { AlbumCard, ArtistBubble, Chips, EmptyState, PlaylistCard, Shelf, VipBadge } from '@/components/media/MediaCards'
import { PlayButton, TrackList } from '@/components/media/PlayButton'
import { toPlayerTracks } from '@/components/media/player-types'
import VipStrip from '@/components/media/VipStrip'
import { sectionLanding } from '@/modules/site/server/pages/section/landing'
import { toPublicPath } from '@/platform/routing/aliases'
import { getMusicSettings } from '@/modules/music/server/admin'
import { railOrder } from '@/shared/section-layout'
import type { MusicRail } from '@/modules/music/domain/music'
import { Fragment, type ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const fa = (await getServerLocale()) === 'fa'
  return withSectionSeo('music', { title: fa ? 'موزیک — دانلود و پخش آنلاین آهنگ' : 'Music — stream & download', description: fa ? 'جدیدترین آهنگ‌ها، آلبوم‌ها و پلی‌لیست‌ها با پخش آنلاین و کیفیت ۳۲۰' : 'New songs, albums and playlists with online playback and 320 kbps quality.', alternates: { canonical: toPublicPath('/music') } })
}

export default async function MusicHomePage() {
  await requireModule('music')
  const landing = await sectionLanding('music')
  if (landing) return landing
  const settings = await getMusicSettings()
  const [data, locale, viewer] = await Promise.all([getMusicHome({ latestSize: settings.latestSize, chartSize: settings.chartSize, chartSource: settings.chartSource, heroTrackIds: settings.heroTrackIds, featuredAlbumIds: settings.featuredAlbumIds }), getServerLocale(), getViewer()])
  const fa = locale === 'fa'
  const heroSource = data.featuredTracks.length ? data.featuredTracks : data.latestTracks.slice(0, 5)
  const hero = toPlayerTracks(heroSource, fa)
  const latest = toPlayerTracks(data.latestTracks.slice(0, data.latestSize), fa)
  const top = toPlayerTracks(data.topTracks, fa)
  const lead = heroSource[0]
  const empty = !data.latestTracks.length && !data.latestAlbums.length
  const order = railOrder(settings.rails)
  const chartTitle = settings.chartSource === 'downloads' ? (fa ? 'پردانلودترین‌ها' : 'Most downloaded') : settings.chartSource === 'recent' ? (fa ? 'تازه‌ترین‌ها' : 'Newest') : (fa ? `${data.topTracks.length.toLocaleString('fa-IR')} آهنگ برتر` : `Top ${data.topTracks.length}`)

  // Blocks render in the order (and visibility) chosen in «مدیریت موزیک ← صفحهٔ اصلی».
  const blocks: Record<MusicRail, () => ReactNode> = {
    hero: () => null,
    genres: () => data.genres.length > 0 && <Chips items={data.genres} hrefFor={(g) => `/music/browse?genre=${encodeURIComponent(g)}`} all={{ label: fa ? 'همه سبک‌ها' : 'All genres', href: '/music/browse' }} />,
    charts: () => !empty && (
      <div className="mu-columns">
        <section className="mu-panel">
          <header className="md-shelf-head"><div><span className="md-eyebrow">{fa ? 'به‌روز' : 'Fresh'}</span><h2>{fa ? 'جدیدترین آهنگ‌ها' : 'New songs'}</h2></div><Link href="/music/browse" className="md-more">{fa ? 'همه ←' : 'All →'}</Link></header>
          <TrackList tracks={latest} />
        </section>
        <section className="mu-panel mu-chart">
          <header className="md-shelf-head"><div><span className="md-eyebrow">{fa ? 'چارت' : 'Chart'}</span><h2>{chartTitle}</h2></div><Link href={`/music/browse?sort=${settings.chartSource === 'recent' ? 'new' : 'popular'}`} className="md-more">{fa ? 'بیشتر ←' : 'More →'}</Link></header>
          <TrackList tracks={top} chart />
        </section>
      </div>
    ),
    featuredAlbums: () => data.featuredAlbums.length > 0 && (
      <Shelf tone="music" id="featured-albums" eyebrow={fa ? 'منتخب' : 'Editors’ picks'} title={fa ? 'آلبوم‌های ویژه' : 'Featured albums'}>
        {data.featuredAlbums.map((album) => <AlbumCard key={album.id} album={album} fa={fa} />)}
      </Shelf>
    ),
    latestAlbums: () => data.latestAlbums.length > 0 && (
      <Shelf tone="music" id="albums" href="/music/albums" more={fa ? 'همهٔ آلبوم‌ها ←' : 'All albums →'} eyebrow={fa ? 'آلبوم' : 'Albums'} title={fa ? 'آلبوم‌های تازه' : 'New albums'}>
        {data.latestAlbums.map((album) => <AlbumCard key={album.id} album={album} fa={fa} />)}
      </Shelf>
    ),
    artists: () => data.artists.length > 0 && (
      <Shelf tone="music" id="artists" href="/music/artists" more={fa ? 'همهٔ هنرمندان ←' : 'All artists →'} eyebrow={fa ? 'هنرمندان' : 'Artists'} title={fa ? 'خوانندگان محبوب' : 'Popular artists'}>
        {data.artists.map((artist) => <ArtistBubble key={artist.id} artist={artist} fa={fa} />)}
      </Shelf>
    ),
    playlists: () => data.playlists.length > 0 && (
      <section className="md-shelf" id="playlists">
        <header className="md-shelf-head"><div><span className="md-eyebrow">{fa ? 'برای هر حال' : 'For every mood'}</span><h2>{fa ? 'پلی‌لیست‌ها' : 'Playlists'}</h2></div><Link href="/music/playlists" className="md-more">{fa ? 'همهٔ پلی‌لیست‌ها ←' : 'All playlists →'}</Link></header>
        <div className="mu-playlists">{data.playlists.map((playlist, i) => <PlaylistCard key={playlist.id} playlist={playlist} fa={fa} index={i} />)}</div>
      </section>
    ),
    vipStrip: () => !viewer.member && <VipStrip fa={fa} kind="music" />,
  }

  return (
    <MediaShell section="music" active="home" nav={musicNav(fa)} search={{ action: '/music/browse', placeholder: fa ? 'جست‌وجوی آهنگ یا خواننده…' : 'Search songs or artists…' }}>
      {order.includes('hero') && lead ? (
        <section className="mu-hero">
          <div className="mu-hero-bg" style={lead.cover ? { backgroundImage: `url("${lead.cover.replace(/"/g, '%22')}")` } : undefined} aria-hidden="true" />
          <div className="container mu-hero-inner">
            <div className="mu-hero-lead">
              <span className="md-eyebrow">{data.featuredTracks.length ? (fa ? (data.heroPicked ? 'انتخاب سردبیر' : 'پیشنهاد ویژه') : 'Featured') : (fa ? 'تازه منتشر شد' : 'Just released')}</span>
              <h1>{fa ? lead.title : lead.titleEn || lead.title}</h1>
              <Link href={`/music/artist/${lead.artist.slug}`} className="mu-hero-artist">{fa ? lead.artist.name : lead.artist.nameEn || lead.artist.name}</Link>
              <div className="mu-hero-tags">
                {lead.genre && <span>{lead.genre}</span>}
                {lead.hasHq && <span className="mu-hq-chip">320 kbps</span>}
                {lead.access === 'MEMBERS' && <VipBadge fa={fa} />}
              </div>
              <div className="mu-hero-actions">
                <PlayButton tracks={hero} index={0} variant="big" label={fa ? 'پخش آهنگ' : 'Play now'} />
                <Link href={`/music/track/${lead.slug}`} className="btn btn-ghost">{fa ? 'متن و دانلود' : 'Lyrics & download'}</Link>
              </div>
            </div>
            <div className="mu-hero-cover">
              {lead.cover ? <img src={lead.cover} alt="" /> : <span className="mu-noart">♪</span>}
            </div>
            {hero.length > 1 && (
              <ol className="mu-hero-queue" aria-label={fa ? 'ادامهٔ پیشنهادها' : 'More picks'} data-title={fa ? 'ادامهٔ پیشنهادها' : 'More picks'}>
                {heroSource.slice(1, 5).map((track, i) => (
                  <li key={track.id}>
                    <PlayButton tracks={hero} index={i + 1} />
                    {track.cover ? <img src={sized(track.cover, 120)} alt="" /> : <span className="mu-noart">♪</span>}
                    <Link href={`/music/track/${track.slug}`}><b>{fa ? track.title : track.titleEn || track.title}</b><small>{fa ? track.artist.name : track.artist.nameEn || track.artist.name}</small></Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      ) : null}

      <div className="container md-body">
        {empty && <EmptyState fa={fa} title={fa ? 'بخش موزیک آماده است' : 'Music is ready'} text={fa ? 'به‌زودی آهنگ‌ها و آلبوم‌های تازه اینجا منتشر می‌شوند.' : 'Fresh songs and albums are coming soon.'} />}
        {order.filter((key) => key !== 'hero').map((key) => <Fragment key={key}>{blocks[key]()}</Fragment>)}
      </div>
    </MediaShell>
  )
}
